import assert from "node:assert/strict";
import { normalizeProgramDates, programDateInputIssue } from "../services/programDateValidation.js";

const p1 = "64b000000000000000000001";
const p2 = "64b000000000000000000002";
const valid = [{ program:p1, startDate:"2026-07-01", endDate:"2027-06-30" }];

assert.equal(programDateInputIssue(normalizeProgramDates(valid)), "");
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:""}])), /valid Start Date and End Date/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:"",startDate:"2026-07-01",endDate:"2027-06-30"}])), /valid program/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-02-30",endDate:"2027-06-30"}])), /valid Start Date and End Date/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2027-06-30",endDate:"2026-07-01"}])), /cannot be before/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"},{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"}])), /only one date range/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"},{program:p2,startDate:"2026-08-01",endDate:"2027-06-30"}])), /./) ;
assert.match(programDateInputIssue([]), /At least one program calendar/);

console.log("Program date validation regression tests passed.");
