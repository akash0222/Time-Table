import assert from "node:assert/strict";
import {
  attendanceRecordMatchesClass,
  canAccessAttendanceEntry,
  canAccessAttendanceSection,
  canAccessAttendanceStudent
} from "../services/attendanceAccess.js";
import { currentUserClaims } from "../middleware/auth.js";

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



const savedAttendance = { _id: "attendance-1", timetable: "timetable-a", timetableEntryId: "entry-a" };
assert.equal(attendanceRecordMatchesClass(savedAttendance, "timetable-a", "entry-a"), true);
assert.equal(attendanceRecordMatchesClass(savedAttendance, "timetable-a", "entry-b"), false);
assert.equal(attendanceRecordMatchesClass(savedAttendance, "timetable-b", "entry-a"), false);
assert.equal(attendanceRecordMatchesClass(null, "timetable-a", "entry-a"), false);

// Authorization claims always reflect the current database account record,
// including role and section/faculty mappings changed after an earlier login.
const currentClaims = currentUserClaims({
  _id: "user-1",
  username: "viewer1",
  name: "Current Viewer",
  role: "VIEWER",
  active: true,
  faculty: null,
  section: assignedSection
});
assert.deepEqual(currentClaims, {
  id: "user-1",
  username: "viewer1",
  name: "Current Viewer",
  role: "VIEWER",
  faculty: null,
  section: "section-a"
});

console.log("Attendance access isolation tests passed.");
