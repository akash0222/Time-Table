import assert from "node:assert/strict";
import { holidayImportCell, parseHolidayCsv, parseHolidayImportDate } from "../services/holidayImport.js";

assert.equal(parseHolidayImportDate("2026-08-15"), "2026-08-15");
assert.equal(parseHolidayImportDate("15-08-2026"), "2026-08-15");
assert.equal(parseHolidayImportDate("15/08/2026"), "2026-08-15");
assert.equal(parseHolidayImportDate("15.08.2026"), "2026-08-15");
assert.equal(parseHolidayImportDate("2026-02-30"), "");
assert.equal(parseHolidayImportDate("31-02-2027"), "");
assert.equal(parseHolidayImportDate("not a date"), "");
assert.equal(parseHolidayImportDate(""), "");
assert.equal(parseHolidayImportDate(new Date("2026-08-15T00:00:00.000Z")), "2026-08-15");

const csv = "\uFEFFDate,Holiday Name,Description\r\n2026-08-15,\"Independence, Observed\",School closed\r\n15-08-2026,Duplicate row,\r\n";
assert.deepEqual(parseHolidayCsv(csv), [
  ["Date", "Holiday Name", "Description"],
  ["2026-08-15", "Independence, Observed", "School closed"],
  ["15-08-2026", "Duplicate row", ""]
]);

assert.equal(holidayImportCell({ text: "Christmas" }), "Christmas");
assert.equal(holidayImportCell({ richText: [{ text: "Winter " }, { text: "Break" }] }), "Winter Break");
assert.equal(holidayImportCell(null), "");

console.log("Holiday import parser tests passed.");
