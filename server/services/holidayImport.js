export function parseHolidayImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmyMatch = text.match(/^(\d{1,2})[\/. -](\d{1,2})[\/. -](\d{4})$/);
  let year, month, day;
  if (isoMatch) {
    year = Number(isoMatch[1]); month = Number(isoMatch[2]); day = Number(isoMatch[3]);
  } else if (dmyMatch) {
    day = Number(dmyMatch[1]); month = Number(dmyMatch[2]); year = Number(dmyMatch[3]);
  } else {
    return "";
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
  return parsed.toISOString().slice(0, 10);
}

export function parseHolidayCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const input = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some(value => String(value).trim())) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(value => String(value).trim())) rows.push(row);
  return rows;
}

export function holidayImportCell(value) {
  if (value == null) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.text !== undefined) return value.text;
    if (value.result !== undefined) return value.result;
    if (value.richText) return value.richText.map(part => part.text || "").join("");
    if (value.hyperlink) return value.text || value.hyperlink;
  }
  return value;
}
