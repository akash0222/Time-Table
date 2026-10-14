import assert from "node:assert/strict";
import { workflowNoteRequired } from "../services/timetableWorkflow.js";

assert.equal(workflowNoteRequired("DRAFT", "SUBMITTED"), false);
assert.equal(workflowNoteRequired("SUBMITTED", "DRAFT"), true);
assert.equal(workflowNoteRequired("SUBMITTED", "APPROVED"), true);
assert.equal(workflowNoteRequired("APPROVED", "SUBMITTED"), true);
assert.equal(workflowNoteRequired("APPROVED", "PUBLISHED"), true);
assert.equal(workflowNoteRequired("PUBLISHED", "DRAFT"), true);
assert.equal(workflowNoteRequired("LOCKED", "PUBLISHED"), true);
assert.equal(workflowNoteRequired("PUBLISHED", "LOCKED"), false);
assert.equal(workflowNoteRequired("DRAFT", "APPROVED"), false);

console.log("Timetable workflow note regression tests passed.");
