import assert from "node:assert/strict";
import { candidateFor } from "../routes/optimization.js";

const faculty = {
  _id: "faculty-1",
  name: "Dr Rao",
  availableDays: ["Monday", "Tuesday"],
  unavailableSlots: [],
  maxClassesPerDay: 6,
  maxWorkingDays: 5
};
const section = {
  _id: "section-1",
  name: "A",
  capacity: 35,
  maxClassesPerDay: 6
};
const subject = {
  _id: "subject-1",
  name: "Data Structures",
  roomType: "Lab",
  duration: 1
};
const rooms = [
  { _id: "lab-small", name: "Small Lab", type: "Lab", capacity: 30 },
  { _id: "lab-large", name: "Large Lab", type: "Laboratory", capacity: 40 },
  { _id: "classroom", name: "Classroom", type: "Classroom", capacity: 80 }
];
const slots = [
  { _id: "m1", day: "Monday", order: 1, startTime: "09:00", endTime: "10:00" },
  { _id: "m2", day: "Monday", order: 2, startTime: "10:00", endTime: "11:00" },
  { _id: "m3", day: "Monday", order: 3, startTime: "11:00", endTime: "12:00" },
  { _id: "m4", day: "Monday", order: 4, startTime: "12:00", endTime: "13:00" },
  { _id: "t1", day: "Tuesday", order: 1, startTime: "09:00", endTime: "10:00" },
  { _id: "t2", day: "Tuesday", order: 2, startTime: "10:00", endTime: "11:00" }
];
const settings = {
  maxConsecutiveFaculty: 2,
  maxConsecutiveSection: 3,
  avoidSameSubjectSameDay: false
};
const baseEntry = {
  _id: "entry-current",
  subject: subject._id,
  faculty: faculty._id,
  section: section._id,
  room: rooms[1]._id,
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  order: 1,
  duration: 1,
  calendarStartDate: "2026-09-01",
  calendarEndDate: "2027-06-30"
};

const candidateOptions = (overrides = {}) => ({
  holidayDays: ["Sunday"],
  limit: 20,
  ...overrides
});

const capacityCandidates = candidateFor(
  null, subject, faculty, section, rooms, slots, [], settings, candidateOptions()
);
assert.ok(capacityCandidates.length > 0);
assert.ok(capacityCandidates.every(item => item.roomId === "lab-large"),
  "Optimizer must reject labs whose capacity is below the section capacity.");

const holidayCandidates = candidateFor(
  null, subject, faculty, section, rooms, slots, [], settings,
  candidateOptions({ holidayDays: ["Monday"] })
);
assert.ok(holidayCandidates.length > 0);
assert.ok(holidayCandidates.every(item => item.day === "Tuesday"),
  "Configured holiday weekdays must not receive optimization suggestions.");

const unavailableFaculty = {
  ...faculty,
  unavailableSlots: ["Monday|09:00-10:00"]
};
const availabilityCandidates = candidateFor(
  baseEntry, subject, unavailableFaculty, section, rooms, slots, [], settings, candidateOptions()
);
assert.ok(availabilityCandidates.some(item => item.day === "Monday" && item.startTime === "10:00"),
  "A single unavailable period must not block all other periods on the same day.");
assert.ok(!availabilityCandidates.some(item => item.day === "Monday" && item.startTime === "09:00"),
  "The exact unavailable period must remain blocked.");

const overlapEntry = {
  _id: "entry-overlap",
  subject: "subject-other",
  faculty: faculty._id,
  section: "section-other",
  room: "room-other",
  day: "Monday",
  startTime: "09:30",
  endTime: "10:30",
  order: 2,
  duration: 1,
  calendarStartDate: "2026-09-01",
  calendarEndDate: "2027-06-30"
};
const overlapCandidates = candidateFor(
  baseEntry, subject, faculty, section, rooms, slots, [overlapEntry], settings, candidateOptions()
);
assert.ok(!overlapCandidates.some(item => item.day === "Monday" && item.startTime === "09:00"),
  "Actual clock overlap must be rejected even when period order values differ.");

const consecutiveEntries = [
  { ...baseEntry, _id: "consecutive-1", order: 1, startTime: "09:00", endTime: "10:00" },
  { ...baseEntry, _id: "consecutive-2", order: 2, startTime: "10:00", endTime: "11:00" }
];
const consecutiveCandidates = candidateFor(
  null, subject, faculty, section, rooms, slots, consecutiveEntries,
  { ...settings, maxConsecutiveFaculty: 2 }, candidateOptions()
);
assert.ok(!consecutiveCandidates.some(item => item.day === "Monday" && item.order === 3),
  "The optimizer must not extend a faculty consecutive run beyond its configured limit.");

const differentCalendarEntry = {
  ...overlapEntry,
  calendarStartDate: "2027-07-01",
  calendarEndDate: "2028-06-30"
};
const separateCalendarCandidates = candidateFor(
  baseEntry, subject, faculty, section, rooms, slots, [differentCalendarEntry], settings, candidateOptions()
);
assert.ok(separateCalendarCandidates.some(item => item.day === "Monday" && item.startTime === "09:00"),
  "Identical weekly periods in non-overlapping program calendars may be reused.");

console.log("Optimization candidate regression tests passed.");
