import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { assertSafeXlsxBuffer, XLSX_SAFETY_LIMITS } from "../services/xlsxSafety.js";

function createZip(entries) {
  const locals = [];
  const central = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const payload = entry.payload || Buffer.alloc(entry.compressedSize ?? 4, 0x41);
    const method = entry.method ?? 0;
    const uncompressedSize = entry.uncompressedSize ?? payload.length;

    const local = Buffer.alloc(30 + name.length + payload.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    payload.copy(local, 30 + name.length);
    locals.push(local);

    const header = Buffer.alloc(46 + name.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt32LE(0, 16);
    header.writeUInt32LE(payload.length, 20);
    header.writeUInt32LE(uncompressedSize, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(localOffset, 42);
    name.copy(header, 46);
    central.push(header);
    localOffset += local.length;
  }

  const centralBytes = Buffer.concat(central);
  const centralOffset = localOffset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, end]);
}

const minimalXlsxParts = [
  { name: "[Content_Types].xml" },
  { name: "xl/workbook.xml" },
  { name: "xl/worksheets/sheet1.xml" }
];

assert.equal(assertSafeXlsxBuffer(createZip(minimalXlsxParts)), true);
console.log("PASS accepts a small XLSX-shaped ZIP archive");

assert.throws(
  () => assertSafeXlsxBuffer(Buffer.from("not a ZIP archive")),
  /too short|end-of-directory/i
);
console.log("PASS rejects non-ZIP uploads");

assert.throws(
  () => assertSafeXlsxBuffer(createZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", compressedSize: 1, uncompressedSize: XLSX_SAFETY_LIMITS.maxEntryUncompressedBytes + 1 }
  ])),
  /25 MB decompressed size limit/
);
console.log("PASS rejects ZIP entries with excessive uncompressed size");

const expandedPayload = Buffer.alloc(XLSX_SAFETY_LIMITS.maxEntryUncompressedBytes + 1024, 0x41);
const compressedBomb = deflateRawSync(expandedPayload);
assert.throws(
  () => assertSafeXlsxBuffer(createZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/sheet1.xml", method: 8, payload: compressedBomb, uncompressedSize: 1 }
  ])),
  /25 MB decompressed size limit/
);
console.log("PASS rejects high-expansion DEFLATE data even when ZIP size metadata is misleading");

const tooMany = [
  ...minimalXlsxParts,
  ...Array.from({ length: XLSX_SAFETY_LIMITS.maxEntries - 2 }, (_, i) => ({ name: `xl/worksheets/extra-${i}.xml` }))
];
assert.throws(() => assertSafeXlsxBuffer(createZip(tooMany)), /too many entries/);
console.log("PASS rejects archives with excessive entry counts");

assert.throws(
  () => assertSafeXlsxBuffer(createZip([
    { name: "[Content_Types].xml" },
    { name: "xl/workbook.xml" },
    { name: "xl/worksheets/../evil.xml" }
  ])),
  /unsafe file path/
);
console.log("PASS rejects unsafe archive paths");

console.log("XLSX upload safety checks passed.");
