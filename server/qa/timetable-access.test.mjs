import assert from "node:assert/strict";
import { filterTimetableEntriesForUser } from "../services/timetableAccess.js";

const entries = [
  { _id: "a", faculty: "faculty-a", section: "section-a", subject: "Math" },
  { _id: "b", faculty: "faculty-b", section: "section-a", subject: "English" },
  { _id: "c", faculty: "faculty-b", section: "section-b", subject: "Science" }
];

assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "ADMIN" }),
  entries,
  "Admin can view all timetable entries"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "SCHEDULER" }),
  entries,
  "Scheduler can view all timetable entries"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "FACULTY", faculty: "faculty-a" }),
  [entries[0]],
  "Faculty only sees their assigned classes"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "VIEWER", section: "section-a" }),
  entries.slice(0, 2),
  "Viewer only sees classes assigned to their section"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "FACULTY" }),
  [],
  "Unmapped faculty cannot see any timetable entries"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "VIEWER" }),
  [],
  "Unmapped viewer cannot see any timetable entries"
);
assert.deepEqual(
  filterTimetableEntriesForUser(entries, { role: "UNKNOWN", section: "section-a" }),
  [],
  "Unknown roles do not receive timetable entries"
);
assert.deepEqual(
  filterTimetableEntriesForUser(null, { role: "ADMIN" }),
  [],
  "Malformed entry payloads fail closed"
);

console.log("Timetable role-scope regression checks passed.");
