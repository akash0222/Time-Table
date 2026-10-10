import "dotenv/config";
import process from "node:process";
import crypto from "node:crypto";
import mongoose from "mongoose";
import XLSX from "xlsx";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import AcademicSession from "../models/AcademicSession.js";
import Faculty from "../models/Faculty.js";
import Program from "../models/Program.js";
import Room from "../models/Room.js";
import Section from "../models/Section.js";
import Subject from "../models/Subject.js";
import Timetable from "../models/Timetable.js";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_EXPORT_FILTER_MUTATION || "").trim().toLowerCase() === "true";
const allowRemoteDatabase = String(process.env.QA_ALLOW_REMOTE_DB_MUTATION || "").trim().toLowerCase() === "true";
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const hostOf = value => {
  try { return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase(); }
  catch { return ""; }
};
const apiHost = hostOf(base);
const mongoHost = hostOf(env.mongoUri);
let token = "";
let passed = 0;
let skipped = 0;
const failures = [];
let connected = false;
let fixture = null;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log("PASS  " + name + (detail ? " — " + detail : ""));
  } else {
    failures.push(name);
    console.error("FAIL  " + name + (detail ? " — " + detail : ""));
  }
}

function skip(name, detail = "") {
  skipped += 1;
  console.log("SKIP  " + name + (detail ? " — " + detail : ""));
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(base + path, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach " + base + ". Start the local backend first. " + error.message);
  }
  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    try { body = await response.json(); } catch {}
  }
  return { response, body };
}

async function exportExcel(filters = {}) {
  const params = new URLSearchParams({
    sessionId: String(fixture.session._id),
    view: "all",
    program: filters.program ?? "ALL",
    semester: filters.semester ?? "ALL",
    sectionId: filters.sectionId ?? "",
    search: filters.search ?? ""
  });
  const response = await fetch(base + "/api/timetable/export/excel?" + params, {
    headers: { Authorization: "Bearer " + token }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "";
  let rows = [];
  const validWorkbook = bytes.subarray(0, 2).toString() === "PK" && contentType.includes("spreadsheetml");
  if (validWorkbook) {
    try {
      const workbook = XLSX.read(bytes, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } catch {}
  }
  return { response, bytes, contentType, validWorkbook, rows };
}

function rowSignature(row) {
  return [
    row.Day, row.Start, row.End, row.Program, row.Semester, row.Section,
    row.Subject, row.SubjectCode, row.Faculty, row.Room
  ].map(value => String(value ?? "").trim()).join("\u001f");
}

async function createFixture() {
  const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const session = await AcademicSession.create({
    name: "QA-EXPORT-FILTER-" + suffix,
    active: false,
    description: "Temporary session used by the guarded export filter regression test."
  });
  fixture = {
    suffix,
    session,
    programs: [],
    sections: [],
    faculty: [],
    rooms: [],
    subjects: [],
    timetable: null
  };

  const programs = await Program.create([
    { name: "QA Export Program A " + suffix, code: "QAEPA-" + suffix, department: "QA", durationYears: 4, active: true },
    { name: "QA Export Program B " + suffix, code: "QAEPB-" + suffix, department: "QA", durationYears: 4, active: true }
  ]);
  fixture.programs.push(...programs);

  const sections = await Section.create([
    {
      programId: programs[0]._id, academicSession: session._id,
      program: programs[0].name, semester: "I", name: "QA Section A " + suffix,
      maxClassesPerDay: 6, capacity: 30
    },
    {
      programId: programs[1]._id, academicSession: session._id,
      program: programs[1].name, semester: "VI", name: "QA Section B " + suffix,
      maxClassesPerDay: 6, capacity: 30
    }
  ]);
  fixture.sections.push(...sections);

  const faculty = await Faculty.create([
    { name: "QA Export Faculty A " + suffix, code: "QAEFA-" + suffix },
    { name: "QA Export Faculty B " + suffix, code: "QAEFB-" + suffix }
  ]);
  fixture.faculty.push(...faculty);

  const rooms = await Room.create([
    { name: "QA Export Room A " + suffix, type: "Classroom", capacity: 30 },
    { name: "QA Export Room B " + suffix, type: "Classroom", capacity: 30 }
  ]);
  fixture.rooms.push(...rooms);

  const subjects = await Subject.create([
    {
      academicSession: session._id, programId: programs[0]._id, subjectType: "CORE", active: true,
      name: "QA Export Subject A " + suffix, code: "QAE-SA-" + suffix,
      faculty: faculty[0]._id, section: sections[0]._id, classesPerWeek: 1,
      maxClassesPerWeek: 1, duration: 1, roomType: "Classroom"
    },
    {
      academicSession: session._id, programId: programs[1]._id, subjectType: "CORE", active: true,
      name: "QA Export Subject B " + suffix, code: "QAE-SB-" + suffix,
      faculty: faculty[1]._id, section: sections[1]._id, classesPerWeek: 1,
      maxClassesPerWeek: 1, duration: 1, roomType: "Classroom"
    }
  ]);
  fixture.subjects.push(...subjects);

  fixture.timetable = await Timetable.create({
    academicSession: session._id,
    version: 1,
    versionLabel: "QA Export Filter Fixture",
    isCurrent: true,
    status: "DRAFT",
    createdBy: "qa-export-filter-regression",
    entries: [
      {
        day: "Monday", startTime: "09:00", endTime: "10:00", order: 1, duration: 1,
        section: sections[0]._id, subject: subjects[0]._id, faculty: faculty[0]._id, room: rooms[0]._id
      },
      {
        day: "Tuesday", startTime: "10:00", endTime: "11:00", order: 2, duration: 1,
        section: sections[1]._id, subject: subjects[1]._id, faculty: faculty[1]._id, room: rooms[1]._id
      }
    ]
  });
}

async function cleanup() {
  if (!connected || !fixture) return;
  const errors = [];
  const actions = [
    ["temporary timetable", () => Timetable.deleteMany({ academicSession: fixture.session._id })],
    ["temporary subjects", () => Subject.deleteMany({ academicSession: fixture.session._id })],
    ["temporary sections", () => Section.deleteMany({ academicSession: fixture.session._id })],
    ["temporary faculty", () => Faculty.deleteMany({ _id: { $in: fixture.faculty.map(row => row._id) } })],
    ["temporary rooms", () => Room.deleteMany({ _id: { $in: fixture.rooms.map(row => row._id) } })],
    ["temporary programs", () => Program.deleteMany({ _id: { $in: fixture.programs.map(row => row._id) } })],
    ["temporary academic session", () => AcademicSession.deleteOne({ _id: fixture.session._id, name: { $regex: /^QA-EXPORT-FILTER-/ } })]
  ];
  for (const [label, action] of actions) {
    try { await action(); }
    catch (error) { errors.push(label + ": " + error.message); }
  }
  if (errors.length) {
    failures.push("Temporary test fixture cleanup");
    console.error("FAIL  Temporary test fixture cleanup — " + errors.join("; "));
  } else {
    console.log("CLEANUP Temporary QA session, timetable, programs, sections, subjects, faculty and rooms removed.");
  }
}

async function run() {
  console.log("Time Table isolated multi-program / multi-semester export regression checks");
  console.log("API: " + base);
  console.log("Mongo host: " + (mongoHost || "(unparsed)") + "\n");
  console.log("Safety: creates a unique inactive QA session and removes its fixture records; never activates it or changes the active timetable.\n");

  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running export-filter regression checks.");

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  token = login.body?.token || "";
  check("Admin login", login.response.status === 200 && Boolean(token), "HTTP " + login.response.status);
  if (!token) throw new Error("Cannot run export filter checks until admin login succeeds.");

  await createFixture();

  const full = await exportExcel();
  check("Fixture timetable exports as a valid XLSX", full.response.status === 200 && full.validWorkbook,
    "HTTP " + full.response.status + ", " + full.bytes.length + " bytes");
  check("Full export contains both fixture entries", full.validWorkbook && full.rows.length === 2,
    "expected 2, received " + full.rows.length);
  if (!full.validWorkbook || full.rows.length !== 2) {
    throw new Error("The test fixture could not be read from the export route; remaining filter assertions would be misleading.");
  }

  const programA = String(fixture.programs[0].name);
  const programB = String(fixture.programs[1].name);
  const semesterA = String(fixture.sections[0].semester);
  const semesterB = String(fixture.sections[1].semester);
  const subjectA = String(fixture.subjects[0].name);
  const subjectB = String(fixture.subjects[1].name);

  const cases = [
    { name: "Program A filter isolates Program A", filters: { program: programA }, expectedProgram: programA, expectedSemester: semesterA, expectedSubject: subjectA },
    { name: "Program B filter isolates Program B", filters: { program: programB }, expectedProgram: programB, expectedSemester: semesterB, expectedSubject: subjectB },
    { name: "Semester I filter isolates Semester I", filters: { semester: semesterA }, expectedProgram: programA, expectedSemester: semesterA, expectedSubject: subjectA },
    { name: "Semester VI filter isolates Semester VI", filters: { semester: semesterB }, expectedProgram: programB, expectedSemester: semesterB, expectedSubject: subjectB },
    { name: "Combined Program A + Semester I filter", filters: { program: programA, semester: semesterA }, expectedProgram: programA, expectedSemester: semesterA, expectedSubject: subjectA },
    { name: "Combined Program B + Semester VI filter", filters: { program: programB, semester: semesterB }, expectedProgram: programB, expectedSemester: semesterB, expectedSubject: subjectB },
    { name: "Search filter selects the matching subject", filters: { search: subjectB }, expectedProgram: programB, expectedSemester: semesterB, expectedSubject: subjectB }
  ];

  for (const testCase of cases) {
    const file = await exportExcel(testCase.filters);
    const row = file.rows.length === 1 ? file.rows[0] : null;
    const valid = file.response.status === 200 && file.validWorkbook && Boolean(row);
    check(testCase.name + " returns one Excel row",
      valid,
      "HTTP " + file.response.status + ", received " + file.rows.length);
    if (valid) {
      check(testCase.name + " row matches all expected columns",
        String(row.Program) === testCase.expectedProgram &&
          String(row.Semester) === testCase.expectedSemester &&
          String(row.Subject) === testCase.expectedSubject,
        "program=" + String(row.Program) + ", semester=" + String(row.Semester) + ", subject=" + String(row.Subject));
    }
  }

  const noMatch = await exportExcel({ program: "QA Export Program That Does Not Exist" });
  check("Non-matching filter is reported as not found",
    noMatch.response.status === 404,
    "HTTP " + noMatch.response.status);
}

async function main() {
  if (!localHosts.has(apiHost)) {
    skip("Mutating export-filter regression", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Mutating export-filter regression", 'Set $env:QA_ALLOW_EXPORT_FILTER_MUTATION="true" to explicitly enable temporary QA fixture creation.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Mutating export-filter regression", 'MongoDB is remote. Use an isolated staging database and set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" only after confirming the target database.');
    return;
  }

  try {
    await connectDB();
    connected = true;
    await run();
  } catch (error) {
    failures.push(error.message);
    console.error("ERROR  " + (error.stack || error.message));
  } finally {
    try { await cleanup(); }
    catch (error) {
      failures.push("Cleanup threw an unexpected error: " + error.message);
      console.error("FAIL  Cleanup — " + error.message);
    }
    if (connected) {
      try { await mongoose.disconnect(); }
      catch (error) { failures.push("MongoDB disconnect: " + error.message); }
    }
  }
  console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
  if (failures.length) process.exitCode = 1;
}

await main();
