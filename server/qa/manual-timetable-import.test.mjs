import assert from "node:assert/strict";
import { mapManualTimetableRows, normalizeClockTime } from "../services/manualTimetableImport.js";

const ids = {
  session: "507f1f77bcf86cd799439011",
  program: "507f1f77bcf86cd799439012",
  section: "507f1f77bcf86cd799439013",
  faculty: "507f1f77bcf86cd799439014",
  subject: "507f1f77bcf86cd799439015",
  room: "507f1f77bcf86cd799439016"
};

const session = {
  _id: ids.session,
  name: "Academic Year 2026-27",
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  programDates: [{
    program: ids.program,
    startDate: "2026-04-01",
    endDate: "2027-03-31"
  }]
};
const programs = [{ _id: ids.program, name: "MBA", code: "MBA", active: true }];
const sections = [{
  _id: ids.section,
  academicSession: ids.session,
  programId: ids.program,
  program: "MBA",
  semester: "I",
  name: "A",
  capacity: 35,
  maxClassesPerDay: 6
}];
const faculty = [{
  _id: ids.faculty,
  name: "Dr Rao",
  code: "FAC001",
  availableDays: ["Monday", "Tuesday", "Sunday"],
  unavailableSlots: [],
  maxClassesPerDay: 4,
  maxWorkingDays: 5
}];
const subjects = [{
  _id: ids.subject,
  academicSession: ids.session,
  programId: ids.program,
  name: "Business Analytics",
  code: "BA101",
  faculty: ids.faculty,
  section: ids.section,
  classesPerWeek: 2,
  totalSessions: 24,
  duration: 1,
  roomType: "Classroom",
  active: true
}];
const rooms = [{ _id: ids.room, name: "Room 101", type: "Classroom", capacity: 50 }];
const slots = [
  { _id: "slot-mon-1", academicSession: ids.session, program: ids.program, semester: "I", day: "Monday", startTime: "09:00", endTime: "10:00", order: 1, isBreak: false },
  { _id: "slot-mon-2", academicSession: ids.session, program: ids.program, semester: "I", day: "Monday", startTime: "10:00", endTime: "11:00", order: 2, isBreak: false },
  { _id: "slot-tue-1", academicSession: ids.session, program: ids.program, semester: "I", day: "Tuesday", startTime: "09:00", endTime: "10:00", order: 1, isBreak: false },
  { _id: "slot-sun-1", academicSession: ids.session, program: ids.program, semester: "I", day: "Sunday", startTime: "09:00", endTime: "10:00", order: 1, isBreak: false }
];
const settings = { maxConsecutiveFaculty: 2, maxConsecutiveSection: 3, holidayDays: ["Sunday"], avoidSameSubjectSameDay: false };

const row = (overrides = {}) => ({
  rowNumber: 2,
  "Program Code": "MBA",
  "Program": "MBA",
  "Semester": "I",
  "Section": "A",
  "Day": "Monday",
  "Start Time": "09:00",
  "End Time": "10:00",
  "Subject Code": "BA101",
  "Subject": "Business Analytics",
  "Faculty Code": "FAC001",
  "Faculty": "Dr Rao",
  "Room": "Room 101",
  ...overrides
});

const common = { session, faculty, sections, programs, subjects, rooms, slots, settings };

assert.equal(normalizeClockTime("9:05 AM"), "09:05");
assert.equal(normalizeClockTime("13:30"), "13:30");
assert.equal(normalizeClockTime("25:99"), "");
assert.equal(normalizeClockTime(0.375), "09:00");

const valid = mapManualTimetableRows({
  ...common,
  rows: [row(), row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })]
});
assert.equal(valid.errors.length, 0, valid.errors.join("\n"));
assert.equal(valid.entries.length, 2);
assert.equal(valid.requiredSessions, 2);
assert.equal(valid.scheduledSessions, 2);
assert.equal(valid.validation.valid, true);
assert.equal(valid.rows[0].subject, "Business Analytics");
assert.equal(valid.entries[0].section, ids.section);
assert.equal(valid.entries[0].room, ids.room);

const missingCoverage = mapManualTimetableRows({ ...common, rows: [row()] });
assert.ok(missingCoverage.errors.some(message => message.includes("1/2 weekly classes imported")));

const mismatchedFaculty = mapManualTimetableRows({
  ...common,
  rows: [
    row({ Faculty: "Another Faculty", "Faculty Code": "FAC002" }),
    row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })
  ]
});
assert.ok(mismatchedFaculty.errors.some(message => message.includes("Faculty Code/Name does not match")));

const wrongRoom = mapManualTimetableRows({
  ...common,
  rooms: [{ _id: ids.room, name: "Room 101", type: "Classroom", capacity: 20 }],
  rows: [row(), row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })]
});
assert.ok(wrongRoom.errors.some(message => message.includes("capacity is below section")));

const unavailableSlot = mapManualTimetableRows({
  ...common,
  faculty: [{ ...faculty[0], unavailableSlots: ["Monday|09:00-10:00"] }],
  rows: [row(), row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })]
});
assert.ok(unavailableSlot.errors.some(message => message.includes("unavailable")));

const holiday = mapManualTimetableRows({
  ...common,
  rows: [
    row({ Day: "Sunday" }),
    row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })
  ]
});
assert.ok(holiday.errors.some(message => message.includes("Holiday weekday scheduled")));

const duplicate = mapManualTimetableRows({
  ...common,
  subjects: [{ ...subjects[0], classesPerWeek: 1 }],
  rows: [row(), row({ rowNumber: 3, "Start Time": "10:00", "End Time": "11:00" })]
});
assert.ok(duplicate.errors.some(message => message.includes("extra")));
assert.ok(duplicate.errors.some(message => message.includes("Duplicate timetable row")) === false);

const duplicateExact = mapManualTimetableRows({
  ...common,
  subjects: [{ ...subjects[0], classesPerWeek: 2 }],
  rows: [row(), row({ rowNumber: 3 })]
});
assert.ok(duplicateExact.errors.some(message => message.includes("Duplicate timetable row")));

const invalidSlot = mapManualTimetableRows({
  ...common,
  rows: [
    row({ "Start Time": "08:30" }),
    row({ rowNumber: 3, Day: "Tuesday", "Start Time": "09:00", "End Time": "10:00" })
  ]
});
assert.ok(invalidSlot.errors.some(message => message.includes("No configured time slot starts")));

console.log("Manual timetable import mapping and validation tests passed.");
