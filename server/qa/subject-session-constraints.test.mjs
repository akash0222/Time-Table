import assert from "node:assert/strict";
import {subjectWeeklyLimitIssue, SUBJECT_WEEKLY_LIMIT_ERROR} from "../services/subjectSessionConstraints.js";

assert.equal(subjectWeeklyLimitIssue({classesPerWeek:3,totalSessions:0,maxClassesPerWeek:1}),SUBJECT_WEEKLY_LIMIT_ERROR);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:3,totalSessions:0,maxClassesPerWeek:3}),null);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:3,totalSessions:0,maxClassesPerWeek:0}),null);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:3,totalSessions:24,maxClassesPerWeek:1}),SUBJECT_WEEKLY_LIMIT_ERROR);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:3,totalSessions:24,maxClassesPerWeek:3}),null);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:1,totalSessions:0,maxClassesPerWeek:1}),null);
assert.equal(subjectWeeklyLimitIssue({classesPerWeek:0,totalSessions:0,maxClassesPerWeek:0}),null);

console.log("Subject weekly-limit regression tests passed.");
