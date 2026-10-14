import AcademicSession from "../models/AcademicSession.js";
import Program from "../models/Program.js";
import Semester from "../models/Semester.js";
import Section from "../models/Section.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import Room from "../models/Room.js";
import TimeSlot from "../models/TimeSlot.js";
import Student from "../models/Student.js";
import SchedulerSetting from "../models/SchedulerSetting.js";

const SEED_ID = "demo-timetable-seed-2026-27-v1";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SEMESTERS = [
  { name: "Semester I", order: 1 },
  { name: "Semester II", order: 2 }
];

// These dates intentionally differ by program and semester. They are all inside
// the overall session window, and each program uses its own daily start time.
const PROGRAMS = [
  { name: "BBA (ENT)", code: "BBA-ENT", department: "Management", durationYears: 3, firstStart: "2026-07-15", firstEnd: "2026-11-30", secondStart: "2026-12-01", secondEnd: "2027-04-30", startTime: "09:00" },
  { name: "BBA (COM)", code: "BBA-COM", department: "Management", durationYears: 3, firstStart: "2026-07-20", firstEnd: "2026-11-25", secondStart: "2026-12-02", secondEnd: "2027-04-25", startTime: "09:30" },
  { name: "BBA (IM)", code: "BBA-IM", department: "Management", durationYears: 3, firstStart: "2026-08-01", firstEnd: "2026-11-28", secondStart: "2026-12-05", secondEnd: "2027-04-28", startTime: "10:00" },
  { name: "PGDM", code: "PGDM", department: "Management", durationYears: 2, firstStart: "2026-06-15", firstEnd: "2026-11-30", secondStart: "2026-12-01", secondEnd: "2027-05-15", startTime: "09:00" }
];

const dateOnly = value => new Date(`${value}T00:00:00.000Z`);
const dateText = value => value ? new Date(value).toISOString().slice(0, 10) : "";

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

async function findOrCreate(Model, query, payload) {
  const existing = await Model.findOne(query);
  if (existing) return { doc: existing, created: false };
  try {
    return { doc: await Model.create(payload), created: true };
  } catch (error) {
    // Safe if another instance seeds the same records at the same time.
    if (error?.code === 11000) {
      const winner = await Model.findOne(query);
      if (winner) return { doc: winner, created: false };
    }
    throw error;
  }
}

function countResult(stats, name, created) {
  stats[name] ??= { created: 0, alreadyPresent: 0 };
  stats[name][created ? "created" : "alreadyPresent"] += 1;
}

function isSameObjectId(a, b) {
  return String(a?._id || a) === String(b?._id || b);
}

function hasProgramSemesterDate(session, programId, semesterName) {
  return (session.programDates || []).some(row =>
    isSameObjectId(row.program, programId) &&
    String(row.semester || "").trim().toLowerCase() === semesterName.toLowerCase()
  );
}

/**
 * Add demo master data without deleting or replacing application records.
 * A database marker makes this one-time when triggered from server startup.
 */
export async function seedDemoData({ mongoose } = {}) {
  const db = mongoose?.connection?.db;
  if (!db) throw new Error("Connected Mongoose database is required for demo seeding.");

  const operations = db.collection("_appSeedOperations");
  const completed = await operations.findOne({ _id: SEED_ID });
  if (completed) return { skipped: true, reason: "Demo seed already completed", result: completed.result };

  const stats = {};
  const programDocs = new Map();
  for (const seed of PROGRAMS) {
    const query = { $or: [{ code: seed.code }, { name: seed.name }] };
    const result = await findOrCreate(Program, query, {
      name: seed.name,
      code: seed.code,
      department: seed.department,
      durationYears: seed.durationYears,
      active: true
    });
    programDocs.set(seed.code, result.doc);
    countResult(stats, "programs", result.created);
  }

  const knownNames = ["2026-2027", "2026-27"];
  let session = await AcademicSession.findOne({ name: { $in: knownNames } });
  let createdSession = false;
  if (!session) {
    const anyActiveSession = await AcademicSession.exists({ active: true });
    session = await AcademicSession.create({
      name: "2026-2027",
      description: "DEMO DATA — sample 2026-2027 session with program/semester calendars and different period start times",
      active: !anyActiveSession,
      startDate: dateOnly("2026-06-15"),
      endDate: dateOnly("2027-05-15"),
      programDates: [],
      holidayDates: ["2026-10-02", "2026-10-20", "2026-12-25", "2027-01-26"],
      holidayDetails: [
        { date: "2026-10-02", name: "Gandhi Jayanti", description: "Demo holiday" },
        { date: "2026-10-20", name: "Festival Holiday", description: "Demo holiday" },
        { date: "2026-12-25", name: "Christmas", description: "Demo holiday" },
        { date: "2027-01-26", name: "Republic Day", description: "Demo holiday" }
      ]
    });
    createdSession = true;
  }
  countResult(stats, "academicSessions", createdSession);

  const facultyDocs = [];
  for (let index = 0; index < 8; index++) {
    const number = String(index + 1).padStart(2, "0");
    const result = await findOrCreate(Faculty, { $or: [{ code: `DF${number}` }, { name: `Demo Faculty ${number}` }] }, {
      name: `Demo Faculty ${number}`,
      code: `DF${number}`,
      maxWorkingDays: 5,
      maxClassesPerDay: 4,
      availableDays: DAYS,
      unavailableSlots: []
    });
    facultyDocs.push(result.doc);
    countResult(stats, "faculty", result.created);
  }

  const roomSeeds = [
    { name: "Demo Room 101", type: "Classroom", capacity: 60 },
    { name: "Demo Room 102", type: "Classroom", capacity: 60 },
    { name: "Demo Room 103", type: "Classroom", capacity: 45 },
    { name: "Demo Lab 201", type: "Lab", capacity: 35 }
  ];
  for (const seed of roomSeeds) {
    const result = await findOrCreate(Room, { name: seed.name }, seed);
    countResult(stats, "rooms", result.created);
  }

  // Add only missing program+semester date rows; do not overwrite custom dates.
  let sessionChanged = false;
  for (const seed of PROGRAMS) {
    const program = programDocs.get(seed.code);
    const rows = [
      { semester: "Semester I", start: seed.firstStart, end: seed.firstEnd },
      { semester: "Semester II", start: seed.secondStart, end: seed.secondEnd }
    ];
    for (const row of rows) {
      if (!hasProgramSemesterDate(session, program._id, row.semester)) {
        session.programDates.push({
          program: program._id,
          semester: row.semester,
          startDate: dateOnly(row.start),
          endDate: dateOnly(row.end)
        });
        sessionChanged = true;
      }
    }
  }

  // Expand (never shrink) legacy overall bounds so they include the seeded
  // program-specific windows. Existing custom program/semester ranges survive.
  const allStartDates = PROGRAMS.flatMap(p => [p.firstStart, p.secondStart]).sort();
  const allEndDates = PROGRAMS.flatMap(p => [p.firstEnd, p.secondEnd]).sort();
  const minimumStart = dateOnly(allStartDates[0]);
  const maximumEnd = dateOnly(allEndDates[allEndDates.length - 1]);
  if (!session.startDate || session.startDate > minimumStart) {
    session.startDate = minimumStart;
    sessionChanged = true;
  }
  if (!session.endDate || session.endDate < maximumEnd) {
    session.endDate = maximumEnd;
    sessionChanged = true;
  }
  const otherActiveSession = await AcademicSession.findOne({ active: true, _id: { $ne: session._id } }).select("_id").lean();
  if (!otherActiveSession && !session.active) {
    session.active = true;
    sessionChanged = true;
  }
  if (sessionChanged) await session.save();

  const sectionDocs = [];
  for (const seed of PROGRAMS) {
    const program = programDocs.get(seed.code);
    for (const semester of SEMESTERS) {
      const semesterResult = await findOrCreate(Semester, {
        academicSession: session._id,
        program: program._id,
        name: semester.name
      }, {
        academicSession: session._id,
        program: program._id,
        name: semester.name,
        order: semester.order,
        active: true
      });
      countResult(stats, "semesters", semesterResult.created);

      const sectionResult = await findOrCreate(Section, {
        academicSession: session._id,
        programId: program._id,
        semester: semester.name,
        name: "A"
      }, {
        programId: program._id,
        academicSession: session._id,
        program: program.name,
        semester: semester.name,
        name: "A",
        maxClassesPerDay: 4,
        capacity: 45
      });
      sectionDocs.push({ section: sectionResult.doc, program, semester });
      countResult(stats, "sections", sectionResult.created);
    }
  }

  for (let index = 0; index < sectionDocs.length; index++) {
    const { section, program, semester } = sectionDocs[index];
    for (let subjectIndex = 0; subjectIndex < 2; subjectIndex++) {
      const faculty = facultyDocs[(index * 2 + subjectIndex) % facultyDocs.length];
      const code = `DEMO_${program.code.replace(/[^A-Z0-9]/gi, "").toUpperCase()}_S${semester.order}_${subjectIndex + 1}`;
      const result = await findOrCreate(Subject, {
        academicSession: session._id,
        section: section._id,
        code
      }, {
        academicSession: session._id,
        programId: program._id,
        subjectType: "CORE",
        active: true,
        name: `Demo Subject ${subjectIndex + 1} — ${program.name} ${semester.name}`,
        code,
        faculty: faculty._id,
        section: section._id,
        classesPerWeek: 3,
        duration: 1,
        roomType: subjectIndex === 1 ? "Lab" : "Classroom"
      });
      countResult(stats, "subjects", result.created);
    }
  }

  for (let index = 0; index < sectionDocs.length; index++) {
    const { section } = sectionDocs[index];
    for (let studentNumber = 1; studentNumber <= 3; studentNumber++) {
      const number = String(index + 1).padStart(2, "0");
      const result = await findOrCreate(Student, { admissionNo: `DEMO-${number}-${studentNumber}` }, {
        admissionNo: `DEMO-${number}-${studentNumber}`,
        rollNo: `${number}${String(studentNumber).padStart(2, "0")}`,
        name: `Demo Student ${index + 1}-${studentNumber}`,
        email: `demo.student.${index + 1}.${studentNumber}@example.test`,
        section: section._id,
        program: section.program,
        semester: section.semester,
        active: true
      });
      countResult(stats, "students", result.created);
    }
  }

  let slotCount = 0;
  for (const seed of PROGRAMS) {
    const program = programDocs.get(seed.code);
    for (const semester of SEMESTERS) {
      for (const day of DAYS) {
        for (let period = 0; period < 4; period++) {
          const startTime = addMinutes(seed.startTime, period * 60);
          const endTime = addMinutes(startTime, 50);
          const query = {
            academicSession: session._id,
            program: program._id,
            semester: semester.name,
            day,
            startTime,
            endTime,
            order: period + 1,
            isBreak: false
          };
          const result = await findOrCreate(TimeSlot, query, query);
          countResult(stats, "timeSlots", result.created);
          slotCount++;
        }
      }
    }
  }

  let settingsCreated = false;
  if (!await SchedulerSetting.findOne({ key: "default" })) {
    await SchedulerSetting.create({ key: "default" });
    settingsCreated = true;
  }
  countResult(stats, "schedulerSettings", settingsCreated);

  const collectionCounts = {
    programs: await Program.countDocuments(),
    academicSessions: await AcademicSession.countDocuments(),
    semesters: await Semester.countDocuments({ academicSession: session._id }),
    faculty: await Faculty.countDocuments(),
    subjects: await Subject.countDocuments({ academicSession: session._id }),
    sections: await Section.countDocuments({ academicSession: session._id }),
    rooms: await Room.countDocuments(),
    students: await Student.countDocuments(),
    timeSlots: await TimeSlot.countDocuments({ academicSession: session._id })
  };
  const result = {
    ok: true,
    skipped: false,
    note: "Demo records were added only where missing. Existing records were not deleted or overwritten.",
    session: {
      id: String(session._id),
      name: session.name,
      active: Boolean(session.active),
      startDate: dateText(session.startDate),
      endDate: dateText(session.endDate)
    },
    created: stats,
    counts: collectionCounts,
    expectedProgramScopedTimeSlots: slotCount
  };

  await operations.updateOne(
    { _id: SEED_ID },
    { $setOnInsert: { completedAt: new Date(), result } },
    { upsert: true }
  );
  return result;
}
