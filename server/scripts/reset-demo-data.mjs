/**
 * Destructive demo reset for the Time Table application.
 *
 * Usage (from server/):
 *   DEMO_RESET_CONFIRM=DELETE_DUMMY_DATA_AND_SEED_DEMO node scripts/reset-demo-data.mjs
 *
 * Requires MONGO_URI in server/.env. A JSON backup is written before any deletion.
 * User accounts are retained so the existing admin login continues to work.
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import AcademicSession from "../models/AcademicSession.js";
import Program from "../models/Program.js";
import Semester from "../models/Semester.js";
import Section from "../models/Section.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import Room from "../models/Room.js";
import TimeSlot from "../models/TimeSlot.js";
import Student from "../models/Student.js";
import Timetable from "../models/Timetable.js";
import SchedulerSetting from "../models/SchedulerSetting.js";
import AttendanceSession from "../models/AttendanceSession.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import StudentPromotion from "../models/StudentPromotion.js";
import SessionPlan from "../models/SessionPlan.js";
import ShareLink from "../models/ShareLink.js";
import FeeHead from "../models/FeeHead.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";

const CONFIRM = "DELETE_DUMMY_DATA_AND_SEED_DEMO";
if (process.env.DEMO_RESET_CONFIRM !== CONFIRM) {
  console.error(`Refusing to run. Set DEMO_RESET_CONFIRM=${CONFIRM} only after confirming this database contains disposable demo data.`);
  process.exit(2);
}
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing. Set it in server/.env or the environment.");
  process.exit(2);
}

const models = [
  AcademicSession, Program, Semester, Section, Faculty, Subject, Room, TimeSlot, Student,
  Timetable, SchedulerSetting, AttendanceSession, AuditLog, Notification, StudentPromotion,
  SessionPlan, ShareLink, FeeHead, FeeInvoice, FeePayment
];
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const semesterWindows = [
  { name: "Semester I", order: 1, start: "2026-07-01", end: "2026-11-30" },
  { name: "Semester II", order: 2, start: "2026-12-01", end: "2027-04-30" }
];
const programSeeds = [
  { name: "BBA (ENT)", code: "BBA-ENT", department: "Management", durationYears: 3, firstStart: "2026-07-15", firstEnd: "2026-11-30", secondStart: "2026-12-01", secondEnd: "2027-04-30", startTime: "09:00" },
  { name: "BBA (COM)", code: "BBA-COM", department: "Management", durationYears: 3, firstStart: "2026-07-20", firstEnd: "2026-11-25", secondStart: "2026-12-02", secondEnd: "2027-04-25", startTime: "09:30" },
  { name: "BBA (IM)", code: "BBA-IM", department: "Management", durationYears: 3, firstStart: "2026-08-01", firstEnd: "2026-11-28", secondStart: "2026-12-05", secondEnd: "2027-04-28", startTime: "10:00" },
  { name: "PGDM", code: "PGDM", department: "Management", durationYears: 2, firstStart: "2026-06-15", firstEnd: "2026-11-30", secondStart: "2026-12-01", secondEnd: "2027-05-15", startTime: "09:00" }
];

const addMinutes = (hhmm, minutes) => {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

await mongoose.connect(process.env.MONGO_URI);
try {
  const db = mongoose.connection.db;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const backup = {};
  for (const collection of collections) {
    const name = collection.name;
    backup[name] = await db.collection(name).find({}).toArray();
  }
  const backupDir = path.resolve(process.cwd(), "backups");
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `pre-demo-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600 });
  console.log(`Backup created: ${backupPath}`);

  // Preserve users (login accounts). Clear all other application collections.
  for (const collection of collections) {
    if (collection.name === "users" || collection.name === "system.profile") continue;
    await db.collection(collection.name).deleteMany({});
  }
  await db.collection("users").updateMany({}, { $set: { faculty: null, section: null } });
  console.log("Cleared existing application records; user accounts were retained and faculty/section links reset.");

  const programs = await Program.insertMany(programSeeds.map(({ name, code, department, durationYears }) => ({
    name, code, department, durationYears, active: true
  })));
  const programByCode = new Map(programs.map(p => [p.code, p]));

  const session = await AcademicSession.create({
    name: "2026-27",
    description: "DEMO DATA — academic year 2026-27 with program and semester-specific calendars",
    active: true,
    programDates: programSeeds.flatMap(seed => {
      const program = programByCode.get(seed.code);
      return [
        { program: program._id, semester: "Semester I", startDate: new Date(seed.firstStart), endDate: new Date(seed.firstEnd) },
        { program: program._id, semester: "Semester II", startDate: new Date(seed.secondStart), endDate: new Date(seed.secondEnd) }
      ];
    }),
    holidayDates: ["2026-10-02", "2026-10-20", "2026-12-25", "2027-01-26"],
    holidayDetails: [
      { date: "2026-10-02", name: "Gandhi Jayanti", description: "Demo holiday" },
      { date: "2026-10-20", name: "Festival Holiday", description: "Demo holiday" },
      { date: "2026-12-25", name: "Christmas", description: "Demo holiday" },
      { date: "2027-01-26", name: "Republic Day", description: "Demo holiday" }
    ]
  });

  const semesterDocs = await Semester.insertMany(programs.flatMap(program =>
    semesterWindows.map(s => ({ academicSession: session._id, program: program._id, name: s.name, order: s.order, active: true }))
  ));
  const faculty = await Faculty.insertMany([
    { name: "Demo Faculty 01", code: "DF01", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 02", code: "DF02", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 03", code: "DF03", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 04", code: "DF04", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 05", code: "DF05", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 06", code: "DF06", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 07", code: "DF07", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days },
    { name: "Demo Faculty 08", code: "DF08", maxWorkingDays: 5, maxClassesPerDay: 4, availableDays: days }
  ]);
  await Room.insertMany([
    { name: "Demo Room 101", type: "Classroom", capacity: 60 },
    { name: "Demo Room 102", type: "Classroom", capacity: 60 },
    { name: "Demo Room 103", type: "Classroom", capacity: 45 },
    { name: "Demo Lab 201", type: "Lab", capacity: 35 }
  ]);

  const sections = [];
  for (const program of programs) {
    for (const semesterName of ["Semester I", "Semester II"]) {
      sections.push(await Section.create({
        programId: program._id,
        academicSession: session._id,
        program: program.name,
        semester: semesterName,
        name: "A",
        maxClassesPerDay: 4,
        capacity: 45
      }));
    }
  }

  const subjects = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    for (let n = 0; n < 2; n++) {
      subjects.push(await Subject.create({
        academicSession: session._id,
        programId: section.programId,
        subjectType: "CORE",
        active: true,
        name: `Demo Subject ${n + 1} — ${section.program} ${section.semester}`,
        code: `D${String(i + 1).padStart(2, "0")}S${n + 1}`,
        faculty: faculty[(i + n) % faculty.length]._id,
        section: section._id,
        classesPerWeek: 3,
        duration: 1,
        roomType: "Classroom"
      }));
    }
  }

  await Student.insertMany(sections.flatMap((section, i) => [1, 2, 3].map(n => ({
    admissionNo: `DEMO-${String(i + 1).padStart(2, "0")}-${n}`,
    rollNo: `${String(i + 1).padStart(2, "0")}${String(n).padStart(2, "0")}`,
    name: `Demo Student ${i + 1}-${n}`,
    email: `demo.student.${i + 1}.${n}@example.test`,
    section: section._id,
    program: section.program,
    semester: section.semester,
    active: true
  }))));

  const slots = [];
  for (let i = 0; i < programSeeds.length; i++) {
    const seed = programSeeds[i];
    const program = programByCode.get(seed.code);
    for (const sem of semesterWindows) {
      const base = seed.startTime;
      for (const day of days) {
        for (let period = 0; period < 4; period++) {
          const startTime = addMinutes(base, period * 60);
          slots.push({
            academicSession: session._id,
            program: program._id,
            semester: sem.name,
            day,
            startTime,
            endTime: addMinutes(startTime, 50),
            order: period + 1,
            isBreak: false
          });
        }
      }
    }
  }
  await TimeSlot.insertMany(slots);
  await SchedulerSetting.create({ academicSession: session._id });

  const counts = {};
  for (const model of models) counts[model.collection.collectionName] = await model.countDocuments();
  console.log(JSON.stringify({
    ok: true,
    backupPath,
    retainedUsers: await mongoose.connection.db.collection("users").countDocuments(),
    seeded: {
      academicSessions: 1, programs: programs.length, semesters: semesterDocs.length,
      sections: sections.length, faculty: faculty.length, subjects: subjects.length,
      rooms: await Room.countDocuments(), students: await Student.countDocuments(),
      timeSlots: await TimeSlot.countDocuments(), schedulerSettings: await SchedulerSetting.countDocuments()
    },
    counts
  }, null, 2));
} catch (error) {
  console.error("Demo reset failed. A backup should exist if deletion began.", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
