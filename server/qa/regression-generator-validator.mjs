import assert from "node:assert/strict";
import { generateBestTimetable } from "../services/generator.js";

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
console.log("PASS  Generated candidate passes hard-constraint validation");
console.log("PASS  Validation statistics contain zero hard errors");
console.log("\nResult: 4 passed, 0 failed.");
