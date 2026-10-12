import assert from "node:assert/strict";
import {
  canAccessAttendanceEntry,
  canAccessAttendanceSection,
  canAccessAttendanceStudent
} from "../services/attendanceAccess.js";

const faculty = {_id:"faculty-a"};
const assignedSection = {_id:"section-a"};
const otherSection = {_id:"section-b"};
const entryA = {_id:"entry-a", faculty:"faculty-a", section:"section-a"};
const entryB = {_id:"entry-b", faculty:"faculty-b", section:"section-b"};
const studentA = {_id:"student-a", section:"section-a"};
const studentB = {_id:"student-b", section:"section-b"};

assert.equal(canAccessAttendanceEntry("VIEWER", {section:assignedSection}, entryA), true);
assert.equal(canAccessAttendanceEntry("VIEWER", {section:assignedSection}, entryB), false);
assert.equal(canAccessAttendanceEntry("VIEWER", null, entryA), false);
assert.equal(canAccessAttendanceEntry("FACULTY", {faculty}, entryA), true);
assert.equal(canAccessAttendanceEntry("FACULTY", {faculty}, entryB), false);
assert.equal(canAccessAttendanceEntry("ADMIN", null, entryB), true);
assert.equal(canAccessAttendanceEntry("SCHEDULER", null, entryB), true);
assert.equal(canAccessAttendanceEntry("UNKNOWN", null, entryB), false);

const facultyAssignments = [entryA];
assert.equal(canAccessAttendanceStudent("VIEWER", {section:assignedSection}, studentA), true);
assert.equal(canAccessAttendanceStudent("VIEWER", {section:assignedSection}, studentB), false);
assert.equal(canAccessAttendanceStudent("FACULTY", {faculty}, studentA, facultyAssignments), true);
assert.equal(canAccessAttendanceStudent("FACULTY", {faculty}, studentB, facultyAssignments), false);
assert.equal(canAccessAttendanceStudent("VIEWER", null, studentA), false);

assert.equal(canAccessAttendanceSection("VIEWER", {section:assignedSection}, "section-a"), true);
assert.equal(canAccessAttendanceSection("VIEWER", {section:assignedSection}, "section-b"), false);
assert.equal(canAccessAttendanceSection("FACULTY", {faculty}, "section-a", facultyAssignments), true);
assert.equal(canAccessAttendanceSection("FACULTY", {faculty}, "section-b", facultyAssignments), false);
assert.equal(canAccessAttendanceSection("ADMIN", null, "section-b"), true);

console.log("Attendance access isolation tests passed.");
