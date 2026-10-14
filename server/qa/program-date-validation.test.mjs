import assert from "node:assert/strict";
import { normalizeProgramDates, programDateInputIssue, sessionDateBounds, sessionDateBoundsIssue } from "../services/programDateValidation.js";

const p1 = "64b000000000000000000001";
const p2 = "64b000000000000000000002";
const valid = [{ program:p1, startDate:"2026-07-01", endDate:"2027-06-30" }];

assert.equal(programDateInputIssue(normalizeProgramDates(valid)), "");
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:""}])), /valid Start Date and End Date/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:"",startDate:"2026-07-01",endDate:"2027-06-30"}])), /valid program/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-02-30",endDate:"2027-06-30"}])), /valid Start Date and End Date/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2027-06-30",endDate:"2026-07-01"}])), /cannot be before/);
assert.match(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"},{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"}])), /only one date range/);
assert.equal(programDateInputIssue(normalizeProgramDates([{program:p1,semester:"Semester I",startDate:"2026-07-01",endDate:"2027-06-30"},{program:p1,semester:"Semester III",startDate:"2026-08-01",endDate:"2027-06-30"}])), "");
assert.equal(programDateInputIssue(normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"},{program:p2,startDate:"2026-08-01",endDate:"2027-06-30"}])), "");
assert.match(programDateInputIssue([]), /At least one program calendar/);

// Overall academic session dates must be preserved and contain every program/semester calendar.
const oneCalendar=normalizeProgramDates([{program:p1,startDate:"2026-07-01",endDate:"2027-06-30"}]);
assert.deepEqual(sessionDateBounds(oneCalendar,"2026-04-01","2027-03-31"),{startDate:"2026-04-01",endDate:"2027-03-31"});
assert.equal(sessionDateBoundsIssue(oneCalendar,"2026-04-01","2027-06-30"),"");
assert.match(sessionDateBoundsIssue(oneCalendar,"2026-08-01","2027-06-30"),/must include every program\/semester/);
assert.match(sessionDateBoundsIssue(oneCalendar,"2026-04-01","2027-05-31"),/must include every program\/semester/);
assert.match(sessionDateBoundsIssue(oneCalendar,"2026-02-30","2027-06-30"),/valid Start Date and End Date/);
assert.match(sessionDateBoundsIssue(oneCalendar,"2027-07-01","2027-06-30"),/cannot be before/);
assert.deepEqual(sessionDateBounds(oneCalendar,"",""),{startDate:"2026-07-01",endDate:"2027-06-30"});

console.log("Program date and academic-session bounds validation regression tests passed.");
