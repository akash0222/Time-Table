import assert from "node:assert/strict";
import { buildGenerationReport } from "../services/generationExplainability.js";

const faculty = [{ _id: "faculty-1", name: "Dr Rao", availableDays: ["Monday", "Tuesday"] }];
const sections = [
  { _id: "section-1", program: "BBA", semester: "I", name: "A", capacity: 30 },
  { _id: "section-2", program: "BCA", semester: "I", name: "B", capacity: 25 }
];
const subjects = [
  { _id: "subject-1", name: "Business Communication", faculty: "faculty-1", section: "section-1", classesPerWeek: 2, duration: 1, roomType: "Classroom" },
  { _id: "subject-2", name: "Programming Lab", faculty: "faculty-1", section: "section-2", classesPerWeek: 1, duration: 2, roomType: "Lab" }
];
const rooms = [{ _id: "room-1", name: "Room 101", type: "Classroom", capacity: 60 }];
const slots = [
  { day: "Monday", startTime: "09:00", endTime: "10:00", order: 1 },
  { day: "Monday", startTime: "10:00", endTime: "11:00", order: 2 },
  { day: "Tuesday", startTime: "09:00", endTime: "10:00", order: 1 }
];
const entries = [{
  day: "Monday", startTime: "09:00", endTime: "10:00", order: 1, duration: 1,
  section: "section-1", subject: "subject-1", faculty: "faculty-1", room: "room-1"
}];

const validReport = buildGenerationReport({
  entries, subjects, faculty, sections, rooms, slots, programs: [],
  settings: { avoidSameSubjectSameDay: true, distributeSubjectAcrossDays: true },
  warnings: [], validation: { valid: true, errors: [], warnings: [] },
  scope: { academicSessionName: "2026-27", programNames: ["BBA", "BCA"] },
  generationRuns: 4, generationTimeLimitMs: 30000,
  qualityMetrics: { qualityScore: 88, coveragePercent: 33.3 }
});

assert.equal(validReport.summary.requiredSessions, 3);
assert.equal(validReport.summary.scheduledSessions, 1);
assert.equal(validReport.summary.unscheduledSessions, 2);
assert.equal(validReport.summary.coveragePercent, 33.3);
assert.equal(validReport.summary.hardValidation, "PASSED");
assert.equal(validReport.placements.length, 1);
assert.match(validReport.placements[0].reason, /feasible candidate placement/i);
assert.equal(validReport.unscheduled.length, 2);
assert.match(validReport.unscheduled.find(row => row.subject === "Programming Lab").reason, /No compatible Lab/i);
assert.ok(validReport.checks.every(check => check.status === "PASSED"));

const unknownReport = buildGenerationReport({ entries: [], subjects: [], validation: null });
assert.equal(unknownReport.summary.hardValidation, "NOT VERIFIED");
assert.ok(unknownReport.checks.every(check => check.status === "NOT VERIFIED"));

const invalidReport = buildGenerationReport({
  entries, subjects, faculty, sections, rooms, slots,
  warnings: ["Test warning"], validation: { valid: false, errors: ["Room conflict at Monday 09:00"], warnings: [] }
});
assert.equal(invalidReport.summary.hardValidation, "FAILED");
assert.equal(invalidReport.summary.hardErrorCount, 1);
assert.equal(invalidReport.summary.warningCount, 1);
assert.ok(invalidReport.errors.some(error => /Room conflict/.test(error)));

console.log("Generation explainability regression tests passed.");
