import assert from "node:assert/strict";
import { holidayDateRangeIssue } from "../services/sessionPlanHolidayDates.js";

const start = new Date("2026-04-01T00:00:00.000Z");
const end = new Date("2027-03-31T00:00:00.000Z");

assert.equal(holidayDateRangeIssue(["2026-04-01", "2026-08-15", "2027-03-31"], start, end), "");
assert.equal(
  holidayDateRangeIssue(["2026-03-31"], start, end),
  "Holiday 2026-03-31 is outside the selected academic session range 2026-04-01 to 2027-03-31."
);
assert.equal(
  holidayDateRangeIssue(["2027-04-01"], start, end),
  "Holiday 2027-04-01 is outside the selected academic session range 2026-04-01 to 2027-03-31."
);
assert.equal(holidayDateRangeIssue(["2026-02-30"], start, end), "Invalid date: 2026-02-30");
assert.equal(holidayDateRangeIssue(["15-08-2026"], start, end), "Invalid date: 15-08-2026");
assert.equal(holidayDateRangeIssue(["2026-08-15", "2026-08-15"], start, end), "");

console.log("Full-session holiday range validation tests passed.");
