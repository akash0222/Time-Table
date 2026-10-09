import "dotenv/config";
import process from "node:process";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import AcademicSession from "../models/AcademicSession.js";
import Program from "../models/Program.js";
import Section from "../models/Section.js";
import Student from "../models/Student.js";
import StudentPromotion from "../models/StudentPromotion.js";
import Subject from "../models/Subject.js";
import Timetable from "../models/Timetable.js";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_PROMOTION_RESTORE_MUTATION || "").trim().toLowerCase() === "true";
const allowRemoteDatabase = String(process.env.QA_ALLOW_REMOTE_DB_MUTATION || "").trim().toLowerCase() === "true";
const hostOf = value => { try { return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { return ""; } };
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const apiHost = hostOf(base);
const mongoHost = hostOf(env.mongoUri);
const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + randomUUID().slice(0, 8).toUpperCase();
const testPrefix = "QA-" + suffix;
let token = "";
let passed = 0;
let skipped = 0;
const failures = [];
let testSessionId = "";
let legacyTimetableId = "";
let connected = false;
const temporaryStudentIds = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log("PASS  " + name + (detail ? " — " + detail : ""));
  } else {
    failures.push(name);
    console.error("FAIL  " + name + (detail ? " — " + detail : ""));
  }
}

function idOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
  } else {
    try { body = await response.text(); } catch {}
  }
  return { response, body };
}

function assertSourceMappingIntegrity(entries, sourceSections, sourceSubjects) {
  const sectionMap = new Map(sourceSections.map(row => [String(row._id), row]));
  const subjectMap = new Map(sourceSubjects.map(row => [String(row._id), row]));
  for (const entry of entries) {
    const sectionId = idOf(entry.section);
    const subjectId = idOf(entry.subject);
    const section = sectionMap.get(sectionId);
    const subject = subjectMap.get(subjectId);
    if (!section || !subject || !entry.faculty || !entry.room) {
      throw new Error("Source timetable has missing Section, Subject, Faculty, or Room mappings; no student fixture was created.");
    }
    if (idOf(subject.section) !== sectionId || idOf(subject.faculty) !== idOf(entry.faculty)) {
      throw new Error("Source timetable entries disagree with their Subject master mappings.");
    }
  }
  const duplicateCodes = new Set();
  const codesSeen = new Set();
  for (const subject of subjectMap.values()) {
    const code = normalize(subject.code);
    if (!code) continue;
    const key = idOf(subject.section) + "|" + code;
    if (codesSeen.has(key)) duplicateCodes.add(key);
    codesSeen.add(key);
  }
  if (duplicateCodes.size) throw new Error("Source subjects have duplicate codes within a section; cannot safely build a clone fixture.");
}

async function makeStudent({ admissionNo, rollNo, name, section, program, semester }) {
  const row = await Student.create({
    admissionNo,
    rollNo,
    name,
    section,
    program,
    semester,
    active: true,
    email: ""
  });
  temporaryStudentIds.push(row._id);
  return row;
}

async function cleanup() {
  if (!connected) return;
  const errors = [];
  const studentFilter = { admissionNo: { $regex: "^" + testPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } };
  try {
    await StudentPromotion.deleteMany({
      $or: [
        ...(testSessionId ? [{ academicSession: testSessionId }] : []),
        { student: { $in: temporaryStudentIds } }
      ]
    });
  } catch (error) { errors.push("promotion history: " + error.message); }
  try { await Student.deleteMany({ $or: [studentFilter, { _id: { $in: temporaryStudentIds } }] }); }
  catch (error) { errors.push("temporary students: " + error.message); }
  if (testSessionId) {
    try { await Timetable.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary timetable versions: " + error.message); }
    try { await Subject.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary subjects: " + error.message); }
    try { await Section.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary sections: " + error.message); }
    try { await AcademicSession.deleteOne({ _id: testSessionId, name: { $regex: /^QA-RESTORE-PROMOTION-/ } }); }
    catch (error) { errors.push("temporary academic session: " + error.message); }
  }
  if (legacyTimetableId) {
    try { await Timetable.deleteOne({ _id: legacyTimetableId }); }
    catch (error) { errors.push("temporary legacy timetable: " + error.message); }
  }
  if (errors.length) {
    failures.push("Temporary test data cleanup");
    console.error("FAIL  Temporary test data cleanup — " + errors.join("; "));
  } else {
    console.log("CLEANUP Temporary students, promotion history, session, sections, subjects and timetable versions removed.");
  }
}

async function run() {
  console.log("Safety: mutating regression. It creates temporary QA students and a temporary academic session, and deletes those records in finally. The active session and its timetable are not changed. Use only an isolated local/staging database.\n");

  if (!localHosts.has(apiHost)) {
    skip("Promotion and restoration mutation tests", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Promotion and restoration mutation tests", 'Set $env:QA_ALLOW_PROMOTION_RESTORE_MUTATION="true" to explicitly enable this test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Promotion and restoration mutation tests", 'MongoDB is remote. Confirm an isolated staging database, then set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" as a separate opt-in.');
    return;
  }
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running this suite.");

  await connectDB();
  connected = true;

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
  token = login.body?.token || "";
  if (!token) throw new Error("Cannot run the tests until admin login succeeds.");

  const activeSessionResponse = await api("/api/sessions/active");
  const activeSession = activeSessionResponse.body;
  check("Active academic session is available", activeSessionResponse.response.status === 200 && Boolean(activeSession?._id),
    "HTTP " + activeSessionResponse.response.status);
  if (!activeSession?._id) throw new Error("No active academic session is available.");

  const source = await Timetable.findOne({ academicSession: activeSession._id, isCurrent: true }).sort({ createdAt: -1 }).lean();
  if (!source || !Array.isArray(source.entries) || source.entries.length === 0) {
    throw new Error("Active academic session has no current timetable entries.");
  }
  const sectionIds = [...new Set(source.entries.map(entry => idOf(entry.section)).filter(Boolean))];
  const subjectIds = [...new Set(source.entries.map(entry => idOf(entry.subject)).filter(Boolean))];
  const [sourceSections, sourceSubjects] = await Promise.all([
    Section.find({ _id: { $in: sectionIds } }).populate("programId", "name code").lean(),
    Subject.find({ _id: { $in: subjectIds } }).lean()
  ]);
  assertSourceMappingIntegrity(source.entries, sourceSections, sourceSubjects);
  const sectionMap = new Map(sourceSections.map(row => [String(row._id), row]));
  const subjectMap = new Map(sourceSubjects.map(row => [String(row._id), row]));
  const firstEntry = source.entries[0];
  const sourceSection = sectionMap.get(idOf(firstEntry.section));
  const programName = String(sourceSection?.programId?.name || sourceSection?.program || "").trim();
  if (!sourceSection || !programName) throw new Error("Unable to resolve the source section and program.");

  const testSession = await AcademicSession.create({
    name: "QA-RESTORE-PROMOTION-" + suffix,
    active: false,
    description: "Temporary session for isolated promotion and restoration regression checks."
  });
  testSessionId = String(testSession._id);

  const targetSectionBySource = new Map();
  for (const sourceSectionId of sectionIds) {
    const sourceRow = sectionMap.get(sourceSectionId);
    const targetRow = await Section.create({
      programId: sourceRow.programId?._id || sourceRow.programId || null,
      academicSession: testSession._id,
      program: String(sourceRow.program || sourceRow.programId?.name || ""),
      semester: String(sourceRow.semester),
      name: String(sourceRow.name),
      maxClassesPerDay: Number(sourceRow.maxClassesPerDay || 6),
      capacity: Math.max(0, Number(sourceRow.capacity || 0))
    });
    targetSectionBySource.set(sourceSectionId, targetRow);
  }

  const targetSubjectBySource = new Map();
  const classesPerSubject = new Map();
  for (const entry of source.entries) {
    const id = idOf(entry.subject);
    classesPerSubject.set(id, (classesPerSubject.get(id) || 0) + 1);
  }
  for (const subjectId of subjectIds) {
    const sourceRow = subjectMap.get(subjectId);
    const targetSection = targetSectionBySource.get(idOf(sourceRow?.section));
    if (!sourceRow || !targetSection) throw new Error("A target subject cannot be mapped to its target section.");
    const targetRow = await Subject.create({
      academicSession: testSession._id,
      programId: sourceRow.programId || targetSection.programId || null,
      subjectType: sourceRow.subjectType || "CORE",
      active: sourceRow.active !== false,
      name: sourceRow.name,
      code: sourceRow.code || "",
      faculty: sourceRow.faculty,
      section: targetSection._id,
      classesPerWeek: Math.max(1, Number(sourceRow.classesPerWeek || classesPerSubject.get(subjectId) || 1)),
      totalSessions: Math.max(0, Number(sourceRow.totalSessions || 0)),
      maxClassesPerWeek: Math.max(0, Number(sourceRow.maxClassesPerWeek || 0)),
      duration: Math.min(3, Math.max(1, Number(sourceRow.duration || 1))),
      roomType: ["Classroom", "Lab", "Any"].includes(sourceRow.roomType) ? sourceRow.roomType : "Classroom"
    });
    targetSubjectBySource.set(subjectId, targetRow);
  }

  const promotionTarget = await Section.create({
    programId: sourceSection.programId?._id || sourceSection.programId || null,
    academicSession: testSession._id,
    program: programName,
    semester: String(sourceSection.semester) + "-QA-" + suffix,
    name: "QA Promotion Target",
    maxClassesPerDay: 6,
    capacity: 1
  });

  const sourceStudents = await Promise.all([
    makeStudent({ admissionNo: testPrefix + "-MOVE-001", rollNo: testPrefix + "-R001", name: "QA Promotion Student One", section: sourceSection._id, program: programName, semester: sourceSection.semester }),
    makeStudent({ admissionNo: testPrefix + "-CAP-001", rollNo: testPrefix + "-R002", name: "QA Capacity Student Two", section: sourceSection._id, program: programName, semester: sourceSection.semester }),
    makeStudent({ admissionNo: testPrefix + "-CAP-002", rollNo: testPrefix + "-R003", name: "QA Capacity Student Three", section: sourceSection._id, program: programName, semester: sourceSection.semester })
  ]);
  const movingStudent = sourceStudents[0];
  const capacityStudents = sourceStudents.slice(1);

  const preview = await api("/api/student-promotions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentIds: [String(movingStudent._id)],
      toSection: String(promotionTarget._id),
      academicSessionId: testSessionId,
      sourceAcademicSessionId: String(activeSession._id),
      action: "PROMOTED"
    })
  });
  const previewOk = preview.response.status === 200 &&
    preview.body?.ok === true &&
    preview.body?.students?.length === 1 &&
    idOf(preview.body?.target?._id) === String(promotionTarget._id);
  check("Promotion preview validates correct source/target sessions",
    previewOk,
    "HTTP " + preview.response.status +
      ", ok=" + String(preview.body?.ok) +
      ", students=" + String(preview.body?.students?.length) +
      ", target=" + idOf(preview.body?.target?._id) +
      ", expectedTarget=" + String(promotionTarget._id) +
      ", issues=" + JSON.stringify(preview.body?.issues || []) +
      ", warnings=" + JSON.stringify(preview.body?.warnings || []) +
      (preview.body?.message ? ", message=" + String(preview.body.message) : ""));

  const moved = await api("/api/student-promotions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentIds: [String(movingStudent._id)],
      toSection: String(promotionTarget._id),
      academicSessionId: testSessionId,
      sourceAcademicSessionId: String(activeSession._id),
      action: "PROMOTED",
      remarks: "Temporary QA promotion."
    })
  });
  check("Bulk promotion updates one test student",
    moved.response.status === 200 && moved.body?.ok === true && moved.body?.updated === 1,
    "HTTP " + moved.response.status + (moved.body?.message ? " — " + moved.body.message : ""));
  const studentAfterMove = await Student.findById(movingStudent._id).lean();
  check("Promoted student points to the target-session section",
    idOf(studentAfterMove?.section) === String(promotionTarget._id));

  const historyRows = await StudentPromotion.find({
    academicSession: testSession._id,
    student: movingStudent._id
  }).sort({ createdAt: -1 }).lean();
  check("Promotion history is recorded for the test student",
    historyRows.length === 1 && historyRows[0].status === "COMPLETED",
    "history rows " + historyRows.length);

  if (historyRows[0]?._id) {
    const rollback = await api("/api/student-promotions/rollback/" + String(historyRows[0]._id), { method: "POST" });
    check("Admin rollback restores the source section",
      rollback.response.status === 200 && Boolean(rollback.body?.ok),
      "HTTP " + rollback.response.status + (rollback.body?.message ? " — " + rollback.body.message : ""));
    const studentAfterRollback = await Student.findById(movingStudent._id).lean();
    const historyAfterRollback = await StudentPromotion.findById(historyRows[0]._id).lean();
    check("Rollback restores the original student mapping and records audit status",
      idOf(studentAfterRollback?.section) === idOf(sourceSection._id) &&
        historyAfterRollback?.status === "ROLLED_BACK" &&
        Boolean(historyAfterRollback?.rolledBackAt));
    const duplicateRollback = await api("/api/student-promotions/rollback/" + String(historyRows[0]._id), { method: "POST" });
    check("Duplicate rollback is rejected",
      duplicateRollback.response.status === 400,
      "HTTP " + duplicateRollback.response.status);
  } else {
    check("Admin rollback restores the source section", false, "No promotion history row was recorded.");
    check("Rollback restores the original student mapping and records audit status", false, "No promotion history row was recorded.");
    check("Duplicate rollback is rejected", false, "No promotion history row was recorded.");
  }

  const capacityPreview = await api("/api/student-promotions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentIds: capacityStudents.map(row => String(row._id)),
      toSection: String(promotionTarget._id),
      academicSessionId: testSessionId,
      sourceAcademicSessionId: String(activeSession._id),
      action: "PROMOTED"
    })
  });
  check("Promotion preview flags capacity overflow",
    capacityPreview.response.status === 200 && capacityPreview.body?.ok === false &&
      (capacityPreview.body?.issues || []).some(issue => /capacity/i.test(issue)),
    "HTTP " + capacityPreview.response.status + ", available " + String(capacityPreview.body?.target?.available));

  const rejectedCapacityMove = await api("/api/student-promotions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentIds: capacityStudents.map(row => String(row._id)),
      toSection: String(promotionTarget._id),
      academicSessionId: testSessionId,
      sourceAcademicSessionId: String(activeSession._id),
      action: "PROMOTED",
      remarks: "Capacity guard regression."
    })
  });
  check("Bulk promotion rejects capacity overflow",
    rejectedCapacityMove.response.status === 400 && /capacity/i.test(String(rejectedCapacityMove.body?.message || "")),
    "HTTP " + rejectedCapacityMove.response.status);
  const capacityStudentsAfter = await Student.find({ _id: { $in: capacityStudents.map(row => row._id) } }).lean();
  check("Capacity rejection leaves both test students unmoved",
    capacityStudentsAfter.length === 2 && capacityStudentsAfter.every(row => idOf(row.section) === idOf(sourceSection._id)));

  const wrongSource = await api("/api/student-promotions/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studentIds: [String(capacityStudents[0]._id)],
      toSection: String(promotionTarget._id),
      academicSessionId: testSessionId,
      sourceAcademicSessionId: testSessionId,
      action: "PROMOTED",
      remarks: "Wrong source session regression."
    })
  });
  check("Promotion rejects a mismatched source academic session",
    wrongSource.response.status === 400,
    "HTTP " + wrongSource.response.status);

  const cloneResponse = await api("/api/timetable/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceTimetableId: String(source._id),
      targetSessionId: testSessionId,
      versionLabel: "QA restore source " + suffix,
      notes: "Temporary restoration regression fixture."
    })
  });
  check("Temporary timetable fixture can be cloned", cloneResponse.response.status === 201 && Boolean(cloneResponse.body?._id),
    "HTTP " + cloneResponse.response.status + (cloneResponse.body?.message ? " — " + cloneResponse.body.message : ""));
  if (cloneResponse.response.status !== 201 || !cloneResponse.body?._id) {
    throw new Error("Could not create the temporary timetable required for restore tests.");
  }

  const sourceClone = cloneResponse.body;
  const restore = await api("/api/timetable/" + String(sourceClone._id) + "/restore", { method: "POST" });
  check("Restore creates a new timetable version",
    restore.response.status === 201 && Boolean(restore.body?._id) &&
      String(restore.body?._id) !== String(sourceClone._id),
    "HTTP " + restore.response.status + (restore.body?.message ? " — " + restore.body.message : ""));
  if (restore.response.status === 201 && restore.body?._id) {
    const restored = restore.body;
    const versions = await api("/api/timetable/versions?sessionId=" + encodeURIComponent(testSessionId));
    const rows = Array.isArray(versions.body) ? versions.body : [];
    const oldVersion = rows.find(row => String(row._id) === String(sourceClone._id));
    const newVersion = rows.find(row => String(row._id) === String(restored._id));
    check("Restored version is current DRAFT and source clone is historical",
      Boolean(newVersion?.isCurrent) && newVersion?.status === "DRAFT" &&
        oldVersion?.isCurrent === false &&
        Number(newVersion?.version) === Number(sourceClone.version) + 1,
      "versions " + rows.length + ", restored version " + String(newVersion?.version));
    check("Restore preserves all cloned entries",
      Array.isArray(restored.entries) && restored.entries.length === source.entries.length,
      "expected " + source.entries.length + ", received " + String(restored.entries?.length));
    check("Restore keeps timetable in the temporary academic session",
      idOf(restored.academicSession) === testSessionId);
  } else {
    check("Restored version is current DRAFT and source clone is historical", false, "Restore did not return a new timetable.");
    check("Restore preserves all cloned entries", false, "Restore did not return a new timetable.");
    check("Restore keeps timetable in the temporary academic session", false, "Restore did not return a new timetable.");
  }

  const legacy = await Timetable.create({
    entries: [],
    version: 999999,
    versionLabel: "QA legacy restore guard " + suffix,
    isCurrent: true,
    status: "DRAFT",
    createdBy: "QA regression",
    notes: "Temporary legacy record without session; removed automatically."
  });
  legacyTimetableId = String(legacy._id);
  const legacyRestore = await api("/api/timetable/" + legacyTimetableId + "/restore", { method: "POST" });
  check("Restore rejects legacy timetable without a session mapping",
    legacyRestore.response.status === 409,
    "HTTP " + legacyRestore.response.status);
  const versionsAfterLegacy = await api("/api/timetable/versions?sessionId=" + encodeURIComponent(testSessionId));
  const rowsAfterLegacy = Array.isArray(versionsAfterLegacy.body) ? versionsAfterLegacy.body : [];
  check("Legacy restore rejection leaves target session versions unchanged",
    versionsAfterLegacy.response.status === 200 &&
      rowsAfterLegacy.length === 2 &&
      rowsAfterLegacy.filter(row => row.isCurrent === true).length === 1 &&
      rowsAfterLegacy.some(row => String(row._id) === String(restore.body?._id) && row.isCurrent === true),
    "target versions " + rowsAfterLegacy.length);
}

async function main() {
  console.log("Time Table student-promotion and timetable-restore regression checks");
  console.log("API: " + base);
  console.log("Mongo host: " + (mongoHost || "(unparsed)") + "\n");
  if (!localHosts.has(apiHost)) {
    skip("Promotion and restoration mutation tests", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Promotion and restoration mutation tests", 'Set $env:QA_ALLOW_PROMOTION_RESTORE_MUTATION="true" to explicitly enable this test.\n');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Promotion and restoration mutation tests", 'MongoDB is remote. Confirm an isolated staging database, then set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" as a separate opt-in.\n');
    return;
  }
  try {
    await run();
  } catch (error) {
    failures.push(error.message);
    console.error("ERROR  " + error.message);
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
