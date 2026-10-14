import assert from "node:assert/strict";
import {subjectTarget, subjectEligibleWeeks, requiredSessionCount} from "../services/sessionPlanTargets.js";

const weeks = [
  {weekNumber:1, workingDates:["2026-07-01","2026-07-03"]},
  {weekNumber:2, workingDates:["2026-07-06","2026-07-10"]},
  {weekNumber:3, workingDates:["2026-07-13","2026-07-17"]},
  {weekNumber:4, workingDates:["2026-07-20","2026-07-24"]}
];

const earlyProgram = {_programStartDate:"2026-07-01", _programEndDate:"2026-07-10", classesPerWeek:3};
const lateProgram = {_programStartDate:"2026-07-13", _programEndDate:"2026-07-24", classesPerWeek:2};
const fixedTotal = {_programStartDate:"2026-07-13", _programEndDate:"2026-07-24", totalSessions:7, classesPerWeek:2};

assert.equal(subjectEligibleWeeks(earlyProgram, weeks), 2);
assert.equal(subjectEligibleWeeks(lateProgram, weeks), 2);
assert.equal(subjectTarget(earlyProgram, subjectEligibleWeeks(earlyProgram, weeks)), 6);
assert.equal(subjectTarget(lateProgram, subjectEligibleWeeks(lateProgram, weeks)), 4);
assert.equal(subjectTarget(fixedTotal, subjectEligibleWeeks(fixedTotal, weeks)), 7);

// Before this regression fix, a weekly target was multiplied by all four
// session weeks, even when a program only operated during two of them.
assert.equal(requiredSessionCount([earlyProgram, lateProgram], weeks), 10);
assert.equal(requiredSessionCount([earlyProgram, lateProgram, fixedTotal], weeks), 17);

// Subjects without program-specific windows continue to use all session weeks.
assert.equal(subjectEligibleWeeks({classesPerWeek:2}, weeks), 4);
assert.equal(requiredSessionCount([{classesPerWeek:2}], weeks), 8);

console.log("Session plan target regression tests passed.");
