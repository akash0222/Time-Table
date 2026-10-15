import { inflateRawSync } from "node:zlib";

const MAX_COMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 2000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1000;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function invalid(message) {
  throw new Error(`Unsafe or invalid Excel file: ${message}`);
}

function readUInt16(buffer, offset, label) {
  if (offset < 0 || offset + 2 > buffer.length) invalid(`truncated ${label}`);
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset, label) {
  if (offset < 0 || offset + 4 > buffer.length) invalid(`truncated ${label}`);
  return buffer.readUInt32LE(offset);
}

/**
 * Inspect an XLSX ZIP directory before ExcelJS decompresses any entries.
 * This bounds ZIP entry count and total expansion for admin-uploaded workbooks.
 */
export function assertSafeXlsxBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) invalid("upload buffer is missing");
  if (buffer.length < 22) invalid("file is too short to be an XLSX archive");
  if (buffer.length > MAX_COMPRESSED_BYTES) invalid("compressed file exceeds the 10 MB upload limit");

  const scanStart = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= scanStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== SIG_EOCD) continue;
    const commentLength = readUInt16(buffer, offset + 20, "ZIP comment length");
    if (offset + 22 + commentLength === buffer.length) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) invalid("ZIP end-of-directory record was not found");

  const diskNumber = readUInt16(buffer, eocdOffset + 4, "ZIP disk number");
  const centralDisk = readUInt16(buffer, eocdOffset + 6, "ZIP central-directory disk");
  const entriesOnDisk = readUInt16(buffer, eocdOffset + 8, "ZIP disk entry count");
  const entryCount = readUInt16(buffer, eocdOffset + 10, "ZIP entry count");
  const centralSize = readUInt32(buffer, eocdOffset + 12, "ZIP central-directory size");
  const centralOffset = readUInt32(buffer, eocdOffset + 16, "ZIP central-directory offset");

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    invalid("multi-disk ZIP archives are not supported");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    invalid("ZIP64 archives exceed the supported XLSX size limits");
  }
  if (entryCount === 0 || entryCount > MAX_ENTRIES) {
    invalid(`workbook contains too many entries (maximum ${MAX_ENTRIES})`);
  }
  const centralEnd = centralOffset + centralSize;
  if (centralOffset < 0 || centralEnd > eocdOffset || centralEnd > buffer.length) {
    invalid("ZIP central-directory bounds are invalid");
  }

  let cursor = centralOffset;
  let totalUncompressed = 0;
  let hasContentTypes = false;
  let hasWorkbook = false;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || readUInt32(buffer, cursor, "ZIP central-directory signature") !== SIG_CENTRAL) {
      invalid("ZIP central directory is malformed");
    }

    const flags = readUInt16(buffer, cursor + 8, "ZIP flags");
    const method = readUInt16(buffer, cursor + 10, "ZIP compression method");
    const compressedSize = readUInt32(buffer, cursor + 20, "ZIP compressed size");
    const uncompressedSize = readUInt32(buffer, cursor + 24, "ZIP uncompressed size");
    const nameLength = readUInt16(buffer, cursor + 28, "ZIP file-name length");
    const extraLength = readUInt16(buffer, cursor + 30, "ZIP extra-field length");
    const commentLength = readUInt16(buffer, cursor + 32, "ZIP file comment length");
    const localOffset = readUInt32(buffer, cursor + 42, "ZIP local-header offset");

    if ((flags & 0x41) !== 0) invalid("encrypted ZIP entries are not supported");
    if (method !== 0 && method !== 8) invalid("unsupported ZIP compression method");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      invalid("ZIP64 entries exceed the supported XLSX size limits");
    }

    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (nameLength === 0 || recordEnd > centralEnd) invalid("ZIP central-directory entry is truncated");
    const fileName = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (fileName.includes("\0") || fileName.startsWith("/") || fileName.split("/").includes("..")) {
      invalid("ZIP contains an unsafe file path");
    }

    if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      invalid("an entry exceeds the 25 MB decompressed size limit");
    }
    if (localOffset + 30 > centralOffset || readUInt32(buffer, localOffset, "ZIP local-header signature") !== SIG_LOCAL) {
      invalid("ZIP local-file header is missing or invalid");
    }
    const localNameLength = readUInt16(buffer, localOffset + 26, "ZIP local file-name length");
    const localExtraLength = readUInt16(buffer, localOffset + 28, "ZIP local extra-field length");
    const localNameEnd = localOffset + 30 + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    if (localNameEnd > centralOffset || dataStart + compressedSize > centralOffset) {
      invalid("ZIP entry data is outside archive bounds");
    }
    const localName = buffer.subarray(localOffset + 30, localNameEnd).toString("utf8");
    if (localName !== fileName) invalid("ZIP local and central file names do not match");

    let actualUncompressedSize;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) {
      actualUncompressedSize = compressedData.length;
    } else {
      try {
        const expanded = inflateRawSync(compressedData, {
          maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES + 1
        });
        actualUncompressedSize = expanded.length;
      } catch (error) {
        if (error?.code === "ERR_BUFFER_TOO_LARGE") {
          invalid("an entry exceeds the 25 MB decompressed size limit");
        }
        invalid("ZIP entry decompression failed");
      }
    }
    if (actualUncompressedSize !== uncompressedSize) {
      invalid("ZIP entry sizes do not match the archive directory");
    }
    totalUncompressed += actualUncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      invalid("total decompressed workbook size exceeds 50 MB");
    }
    if (actualUncompressedSize > 1024 * 1024) {
      if (compressedSize === 0 || actualUncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        invalid("an entry has an excessive compression ratio");
      }
    }

    const normalizedName = fileName.toLowerCase();
    if (normalizedName === "[content_types].xml") hasContentTypes = true;
    if (normalizedName === "xl/workbook.xml") hasWorkbook = true;

    cursor = recordEnd;
  }

  if (!hasContentTypes || !hasWorkbook) invalid("required XLSX workbook parts are missing");
  return true;
}

export const XLSX_SAFETY_LIMITS = Object.freeze({
  maxCompressedBytes: MAX_COMPRESSED_BYTES,
  maxEntries: MAX_ENTRIES,
  maxEntryUncompressedBytes: MAX_ENTRY_UNCOMPRESSED_BYTES,
  maxTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
  maxCompressionRatio: MAX_COMPRESSION_RATIO
});
