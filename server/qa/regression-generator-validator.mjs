import assert from "node:assert/strict";
import { generateBestTimetable } from "../services/generator.js";
import { validateTimetable } from "../services/timetable/validator.js";

const faculty = [{
  _id: "qa-faculty-1",
  name: "QA Faculty",
  maxWorkingDays: 5,
  maxClassesPerDay: 4,
  availableDays: ["Monday"],
  unavailableSlots: []
}];

const sections = [{
  _id: "qa-section-1",
  program: "QA Program",
  semester: "I",
  name: "QA Section",
  maxClassesPerDay: 5,
  capacity: 30
}];

const subjects = [{
  _id: "qa-subject-1",
  name: "QA Subject",
  code: "QA-SUB-1",
  faculty: "qa-faculty-1",
  section: "qa-section-1",
  classesPerWeek: 1,
  duration: 1,
  roomType: "Classroom"
}];

const rooms = [{
  _id: "qa-room-1",
  name: "QA Room",
  type: "Classroom",
  capacity: 30
}];

const slots = [{
  _id: "qa-slot-1",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  order: 1,
  isBreak: false
}];

const result = generateBestTimetable({
  faculty,
  subjects,
  sections,
  rooms,
  slots,
  programs: [],
  settings: {
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    holidayDays: ["Sunday"]
  },
  runs: 1,
  totalMaxMillis: 2000,
  perRunMillis: 1500,
  attemptsPerRun: 10
});

assert.equal(Array.isArray(result.entries), true, "Generator should return an entries array.");
assert.equal(result.entries.length, 1, "The one-session fixture should schedule exactly one class.");
assert.equal(result.validation?.valid, true, "Generated entries should be validated and marked valid.");
assert.equal(result.validation?.stats?.hardErrors, 0, "A valid one-class fixture should have no hard validation errors.");

console.log("PASS  Generator imports timetable validator successfully");
console.log("PASS  One-class fixture is generated");
// Program-scoped generation must treat an existing class as a fixed reservation.
const reservedFacultyClass = {
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  order: 1,
  duration: 1,
  faculty: "qa-faculty-1",
  section: "other-program-section",
  subject: "other-program-subject",
  room: "another-program-room"
};
const blockedByExistingProgram = generateBestTimetable({
  faculty,
  subjects,
  sections,
  rooms,
  slots,
  programs: [],
  settings: {
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    holidayDays: ["Sunday"]
  },
  reservedEntries: [reservedFacultyClass],
  runs: 1,
  totalMaxMillis: 1000,
  perRunMillis: 750,
  attemptsPerRun: 10
});
assert.equal(
  blockedByExistingProgram.entries.length,
  0,
  "Generation must not double-book a faculty member already teaching for another program."
);

const secondFaculty = {
  _id: "qa-faculty-2",
  name: "QA Faculty 2",
  maxWorkingDays: 5,
  maxClassesPerDay: 4,
  availableDays: ["Monday"],
  unavailableSlots: []
};
const reservedRoomClass = {
  ...reservedFacultyClass,
  faculty: "qa-faculty-2",
  room: "qa-room-1"
};
const blockedByExistingRoom = generateBestTimetable({
  faculty: [...faculty, secondFaculty],
  subjects,
  sections,
  rooms,
  slots,
  programs: [],
  settings: {
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    holidayDays: ["Sunday"]
  },
  reservedEntries: [reservedRoomClass],
  runs: 1,
  totalMaxMillis: 1000,
  perRunMillis: 750,
  attemptsPerRun: 10
});
assert.equal(
  blockedByExistingRoom.entries.length,
  0,
  "Generation must not double-book a room already reserved by another program."
);
console.log("PASS  Existing program faculty and room reservations block conflicting placements");

console.log("PASS  Generated candidate passes hard-constraint validation");
console.log("PASS  Validation statistics contain zero hard errors");
// An availability change must invalidate a stored Tuesday class if faculty
// availability currently permits only Monday.
const tuesdaySlot = { ...slots[0], _id: "qa-slot-tuesday", day: "Tuesday" };
const unavailableDayEntry = {
  day: "Tuesday",
  startTime: "09:00",
  endTime: "10:00",
  order: 1,
  duration: 1,
  faculty: "qa-faculty-1",
  section: "qa-section-1",
  subject: "qa-subject-1",
  room: "qa-room-1"
};
const availabilityValidation = validateTimetable({
  entries: [unavailableDayEntry],
  faculty,
  sections,
  subjects,
  rooms,
  slots: [tuesdaySlot],
  programs: [],
  settings: { maxConsecutiveFaculty: 2, maxConsecutiveSection: 3 }
});
assert.equal(availabilityValidation.valid, false, "A class on a faculty-unavailable day must be rejected.");
assert.ok(
  availabilityValidation.errors.some(message => /unavailable on Tuesday/i.test(message)),
  "Validator should report that the faculty member is unavailable on Tuesday."
);

const blockedDayGeneration = generateBestTimetable({
  faculty,
  subjects,
  sections,
  rooms,
  slots: [tuesdaySlot],
  programs: [],
  settings: {
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    holidayDays: ["Sunday"]
  },
  runs: 1,
  totalMaxMillis: 2000,
  perRunMillis: 1500,
  attemptsPerRun: 10
});
assert.equal(
  blockedDayGeneration.entries.length,
  0,
  "Generator must not place a class on a day the faculty member cannot work."
);

console.log("PASS  Faculty-unavailable day is rejected by the hard-constraint validator");
console.log("PASS  Generator refuses to schedule a class on a faculty-unavailable day");

const programA={_id:"qa-program-a",name:"QA Program A",code:"QPA"};
const programB={_id:"qa-program-b",name:"QA Program B",code:"QPB"};
const sectionA={...sections[0],_id:"qa-section-a",program:"QA Program A",programId:"qa-program-a"};
const sectionB={...sections[0],_id:"qa-section-b",program:"QA Program B",programId:"qa-program-b"};
const subjectA={...subjects[0],_id:"qa-subject-a",section:"qa-section-a",faculty:"qa-faculty-1"};
const subjectB={...subjects[0],_id:"qa-subject-b",section:"qa-section-b",faculty:"qa-faculty-1"};
const roomB={...rooms[0],_id:"qa-room-2",name:"QA Room 2"};
const programSlots=[
  {...slots[0],_id:"qa-slot-program-a",program:"qa-program-a",order:1,startTime:"09:00",endTime:"10:00"},
  {...slots[0],_id:"qa-slot-program-b",program:"qa-program-b",order:2,startTime:"09:30",endTime:"10:30"}
];
const overlappingProgramEntries=[
  {...unavailableDayEntry,_id:"qa-entry-a",day:"Monday",startTime:"09:00",endTime:"10:00",order:1,duration:1,section:"qa-section-a",subject:"qa-subject-a",faculty:"qa-faculty-1",room:"qa-room-1"},
  {...unavailableDayEntry,_id:"qa-entry-b",day:"Monday",startTime:"09:30",endTime:"10:30",order:2,duration:1,section:"qa-section-b",subject:"qa-subject-b",faculty:"qa-faculty-1",room:"qa-room-2"}
];
const overlapValidation=validateTimetable({
  entries:overlappingProgramEntries,
  faculty,
  sections:[sectionA,sectionB],
  subjects:[subjectA,subjectB],
  rooms:[...rooms,roomB],
  slots:programSlots,
  programs:[programA,programB],
  settings:{maxConsecutiveFaculty:2,maxConsecutiveSection:3}
});
assert.equal(overlapValidation.valid,false,"Program-specific classes with overlapping clock times must be rejected.");
assert.ok(
  overlapValidation.errors.some(message=>/Faculty time-overlap conflict/i.test(message)),
  "Validator must detect faculty double-booking even when program period orders differ."
);
console.log("PASS  Validator detects clock-time overlap across program-specific period layouts");

const blockedByProgramClockOverlap=generateBestTimetable({
  faculty,
  subjects:[subjectB],
  sections:[sectionB],
  rooms,
  slots:[programSlots[1]],
  programs:[programA,programB],
  reservedEntries:[overlappingProgramEntries[0]],
  settings:{
    maxConsecutiveFaculty:2,
    maxConsecutiveSection:3,
    avoidSameSubjectSameDay:true,
    distributeSubjectAcrossDays:true,
    avoidFirstLastPeriod:false,
    holidayDays:["Sunday"]
  },
  runs:1,
  totalMaxMillis:1000,
  perRunMillis:750,
  attemptsPerRun:10
});
assert.equal(
  blockedByProgramClockOverlap.entries.length,
  0,
  "Generation must reserve faculty clock intervals even if another program uses a different period order."
);
console.log("PASS  Generator reserves overlapping clock intervals across programs");

console.log("\nResult: regression checks passed, 0 failed.");
