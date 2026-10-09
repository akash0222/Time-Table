import "dotenv/config";
import process from "node:process";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import AcademicSession from "../models/AcademicSession.js";
import Faculty from "../models/Faculty.js";
import Program from "../models/Program.js";
import Room from "../models/Room.js";
import SchedulerSetting from "../models/SchedulerSetting.js";
import Section from "../models/Section.js";
import Subject from "../models/Subject.js";
import TimeSlot from "../models/TimeSlot.js";
import Timetable from "../models/Timetable.js";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_CLONE_MUTATION || "").trim().toLowerCase() === "true";
const allowRemoteDatabase = String(process.env.QA_ALLOW_REMOTE_DB_MUTATION || "").trim().toLowerCase() === "true";
const hostOf = value => { try { return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { return ""; } };
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const apiHost = hostOf(base);
const mongoHost = hostOf(env.mongoUri);
let token = "";
let passed = 0;
let skipped = 0;
const failures = [];
let testSessionId = "";
let settingsOverrideAdded = false;
let connected = false;

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

function idOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sectionKey(section) {
  const programId = idOf(section?.programId);
  const programName = normalize(section?.programId?.name || section?.program);
  return `${programId || programName}| ${normalize(section?.semester)}| ${normalize(section?.name)}`;
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

function assertSourceMappings(entries, sourceSections, sourceSubjects) {
  const sectionMap = new Map(sourceSections.map(section => [String(section._id), section]));
  const subjectMap = new Map(sourceSubjects.map(subject => [String(subject._id), subject]));
  const subjectCountById = new Map();
  for (const entry of entries) {
    const sectionId = idOf(entry.section);
    const subjectId = idOf(entry.subject);
    const facultyId = idOf(entry.faculty);
    const roomId = idOf(entry.room);
    const section = sectionMap.get(sectionId);
    const subject = subjectMap.get(subjectId);
    if (!section || !subject || !facultyId || !roomId) {
      throw new Error("Source timetable has a missing Section, Subject, Faculty, or Room mapping; no test fixture was created.");
    }
    if (idOf(subject.section) !== sectionId) {
      throw new Error("Source subject " + (subject.name || subjectId) + " is mapped to a different section than its timetable entry.");
    }
    if (idOf(subject.faculty) !== facultyId) {
      throw new Error("Source subject " + (subject.name || subjectId) + " and its timetable entry use different Faculty IDs.");
    }
    subjectCountById.set(subjectId, (subjectCountById.get(subjectId) || 0) + 1);
  }

  const usedSubjects = [...subjectMap.values()];
  const codesBySection = new Map();
  const namelessCodeKeys = new Map();
  for (const subject of usedSubjects) {
    const sid = idOf(subject.section);
    const code = normalize(subject.code);
    const nameType = normalize(subject.name) + "|" + normalize(subject.subjectType);
    if (code) {
      const key = sid + "|" + code;
      codesBySection.set(key, (codesBySection.get(key) || 0) + 1);
    } else {
      const key = sid + "|" + nameType;
      namelessCodeKeys.set(key, (namelessCodeKeys.get(key) || 0) + 1);
    }
  }
  if ([...codesBySection.values()].some(count => count > 1)) {
    throw new Error("The source timetable contains duplicate subject codes within a section. Correct those mappings before running a positive clone test.");
  }
  if ([...namelessCodeKeys.values()].some(count => count > 1)) {
    throw new Error("The source timetable contains subjects without codes that are ambiguous by name/type within a section.");
  }
  return subjectCountById;
}

async function cleanup() {
  if (!connected) return;
  const errors = [];
  if (testSessionId) {
    try { await Timetable.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary timetable versions: " + error.message); }
    try { await Subject.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary subjects: " + error.message); }
    try { await Section.deleteMany({ academicSession: testSessionId }); }
    catch (error) { errors.push("temporary sections: " + error.message); }
    if (settingsOverrideAdded) {
      try {
        await SchedulerSetting.updateOne(
          { key: "default" },
          { $pull: { sessionOverrides: { academicSession: new mongoose.Types.ObjectId(testSessionId) } } }
        );
      } catch (error) { errors.push("temporary scheduler settings: " + error.message); }
    }
    try { await AcademicSession.deleteOne({ _id: testSessionId, name: { $regex: /^QA-CLONE-TEST-/ } }); }
    catch (error) { errors.push("temporary academic session: " + error.message); }
  }
  if (errors.length) {
    failures.push("Temporary test data cleanup");
    console.error("FAIL  Temporary test data cleanup — " + errors.join("; "));
  } else if (testSessionId) {
    console.log("CLEANUP Temporary QA session, sections, subjects and cloned timetable removed.");
  }
}

async function run() {
  console.log("Time Table cross-session clone regression checks");
  console.log("API: " + base);
  console.log("Mongo host: " + (mongoHost || "(unparsed)") + "\n");
  console.log("Safety: mutating regression; it creates a unique temporary academic session and removes its records in finally. The API and database must both be local unless remote-database mutation is explicitly enabled.\n");

  if (!["localhost", "127.0.0.1", "::1"].includes(apiHost)) {
    skip("Cross-session clone mutation tests", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Cross-session clone mutation tests", 'Set $env:QA_ALLOW_CLONE_MUTATION="true" to explicitly enable this test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Cross-session clone mutation tests", 'MongoDB is remote. Confirm this is an isolated staging database, then set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" as a separate opt-in.');
    return;
  }
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running clone regression checks.");

  await connectDB();
  connected = true;

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
  token = login.body?.token || "";
  if (!token) throw new Error("Cannot run clone tests until admin login succeeds.");

  const activeSession = await AcademicSession.findOne({ active: true }).lean();
  if (!activeSession) throw new Error("No active academic session is configured.");
  const source = await Timetable.findOne({ academicSession: activeSession._id, isCurrent: true })
    .sort({ createdAt: -1 }).lean();
  if (!source || !Array.isArray(source.entries) || source.entries.length === 0) {
    throw new Error("The active academic session has no current timetable entries to use as a clone source.");
  }

  const sourceSectionIds = [...new Set(source.entries.map(entry => idOf(entry.section)).filter(Boolean))];
  const sourceSubjectIds = [...new Set(source.entries.map(entry => idOf(entry.subject)).filter(Boolean))];
  const [sourceSections, sourceSubjects, sourceSettings] = await Promise.all([
    Section.find({ _id: { $in: sourceSectionIds } }).populate("programId", "name code").lean(),
    Subject.find({ _id: { $in: sourceSubjectIds } }).lean(),
    SchedulerSetting.findOne({ key: "default" }).lean()
  ]);
  const classesPerSubject = assertSourceMappings(source.entries, sourceSections, sourceSubjects);
  const sourceSectionMap = new Map(sourceSections.map(section => [String(section._id), section]));
  const sourceSubjectMap = new Map(sourceSubjects.map(subject => [String(subject._id), subject]));

  const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14) + "-" + cryptoRandomSuffix();
  const testSession = await AcademicSession.create({
    name: "QA-CLONE-TEST-" + suffix,
    active: false,
    description: "Temporary session created only by the guarded clone regression test."
  });
  testSessionId = String(testSession._id);

  const targetSectionBySource = new Map();
  for (const sourceSectionId of sourceSectionIds) {
    const sourceSection = sourceSectionMap.get(sourceSectionId);
    const programName = String(sourceSection?.program || sourceSection?.programId?.name || "").trim();
    if (!sourceSection || !programName || !String(sourceSection.semester || "").trim() || !String(sourceSection.name || "").trim()) {
      throw new Error("Source Section is missing Program, Semester, or Section name; safe mapping cannot be constructed.");
    }
    const targetSection = await Section.create({
      programId: sourceSection.programId?._id || sourceSection.programId || null,
      academicSession: testSession._id,
      program: programName,
      semester: String(sourceSection.semester),
      name: String(sourceSection.name),
      maxClassesPerDay: Number(sourceSection.maxClassesPerDay || 6),
      capacity: Math.max(0, Number(sourceSection.capacity || 0))
    });
    targetSectionBySource.set(sourceSectionId, targetSection);
  }

  const targetSubjectBySource = new Map();
  for (const sourceSubjectId of sourceSubjectIds) {
    const sourceSubject = sourceSubjectMap.get(sourceSubjectId);
    const sourceSectionId = idOf(sourceSubject?.section);
    const targetSection = targetSectionBySource.get(sourceSectionId);
    if (!sourceSubject || !targetSection) {
      throw new Error("A referenced source subject or its target section could not be mapped.");
    }
    const targetSubject = await Subject.create({
      academicSession: testSession._id,
      programId: sourceSubject.programId || targetSection.programId || null,
      subjectType: sourceSubject.subjectType || "CORE",
      active: sourceSubject.active !== false,
      name: sourceSubject.name,
      code: sourceSubject.code || "",
      faculty: sourceSubject.faculty,
      section: targetSection._id,
      classesPerWeek: Math.max(1, Number(sourceSubject.classesPerWeek || classesPerSubject.get(sourceSubjectId) || 1)),
      totalSessions: Math.max(0, Number(sourceSubject.totalSessions || 0)),
      maxClassesPerWeek: Math.max(0, Number(sourceSubject.maxClassesPerWeek || 0)),
      duration: Math.min(3, Math.max(1, Number(sourceSubject.duration || 1))),
      roomType: ["Classroom", "Lab", "Any"].includes(sourceSubject.roomType) ? sourceSubject.roomType : "Classroom"
    });
    targetSubjectBySource.set(sourceSubjectId, targetSubject);
  }

  const sourceOverride = (sourceSettings?.sessionOverrides || []).find(
    item => String(item.academicSession) === String(activeSession._id)
  );
  if (sourceSettings && sourceOverride) {
    const override = { academicSession: testSession._id };
    for (const field of [
      "maxConsecutiveFaculty", "maxConsecutiveSection", "avoidSameSubjectSameDay",
      "distributeSubjectAcrossDays", "avoidFirstLastPeriod", "holidayDays",
      "generationRuns", "generationTimeLimitMs", "generationAttempts"
    ]) {
      if (sourceOverride[field] !== undefined) override[field] = sourceOverride[field];
    }
    await SchedulerSetting.updateOne({ _id: sourceSettings._id }, { $push: { sessionOverrides: override } });
    settingsOverrideAdded = true;
  }

  const successfulClone = await api("/api/timetable/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceTimetableId: String(source._id),
      targetSessionId: testSessionId,
      versionLabel: "QA successful clone " + suffix,
      notes: "Temporary test; removed automatically."
    })
  });
  check("Mapped cross-session clone succeeds",
    successfulClone.response.status === 201 && Boolean(successfulClone.body?._id),
    "HTTP " + successfulClone.response.status + (successfulClone.response.status === 201 ? "" : " — " + (successfulClone.body?.message || "unexpected response")));
  if (successfulClone.response.status !== 201 || !successfulClone.body?._id) {
    throw new Error("Successful clone setup failed: " + (successfulClone.body?.message || "unexpected API response"));
  }

  const cloned = successfulClone.body;
  const clonedEntries = Array.isArray(cloned.entries) ? cloned.entries : [];
  const targetSectionIds = new Set([...targetSectionBySource.values()].map(section => String(section._id)));
  const targetSubjectIds = new Set([...targetSubjectBySource.values()].map(subject => String(subject._id)));
  check("Clone is scoped to the temporary target session", idOf(cloned.academicSession) === testSessionId);
  check("Clone preserves the full number of sessions", clonedEntries.length === source.entries.length,
    "source " + source.entries.length + ", cloned " + clonedEntries.length);
  check("Cloned entries use target-session sections and subjects",
    clonedEntries.every(entry => targetSectionIds.has(idOf(entry.section)) && targetSubjectIds.has(idOf(entry.subject))));
  check("Cloned entries use the target subjects' Faculty mappings",
    clonedEntries.every(entry => {
      const sourceSubjectId = [...targetSubjectBySource.entries()].find(([, targetSubject]) => String(targetSubject._id) === idOf(entry.subject))?.[0];
      const targetSubject = sourceSubjectId ? targetSubjectBySource.get(sourceSubjectId) : null;
      return Boolean(targetSubject) && idOf(entry.faculty) === idOf(targetSubject.faculty);
    }));
  check("Clone preserves scheduled times and rooms",
    (() => {
      const signature = (entry, sectionId, subjectId, facultyId) => [
        entry.day, entry.startTime, entry.endTime, Number(entry.order), Number(entry.duration || 1),
        sectionId, subjectId, facultyId, idOf(entry.room)
      ].join("|");
      const expected = source.entries.map(entry => signature(
        entry,
        String(targetSectionBySource.get(idOf(entry.section))._id),
        String(targetSubjectBySource.get(idOf(entry.subject))._id),
        idOf(targetSubjectBySource.get(idOf(entry.subject)).faculty)
      )).sort();
      const actual = clonedEntries.map(entry => signature(entry, idOf(entry.section), idOf(entry.subject), idOf(entry.faculty))).sort();
      return expected.length === actual.length && expected.every((value, index) => value === actual[index]);
    })());
  check("Successful clone starts as current DRAFT",
    cloned.status === "DRAFT" && cloned.isCurrent === true,
    "status " + cloned.status + ", current " + String(cloned.isCurrent));

  const crossHistory = await api("/api/timetable/change-history?fromId=" +
    encodeURIComponent(String(source._id)) + "&toId=" + encodeURIComponent(String(cloned._id)));
  check("Change history rejects versions from different academic sessions",
    crossHistory.response.status === 409,
    "HTTP " + crossHistory.response.status);

  const versionsBeforeRejectedClone = await api("/api/timetable/versions?sessionId=" + encodeURIComponent(testSessionId));
  const versionRowsBefore = Array.isArray(versionsBeforeRejectedClone.body) ? versionsBeforeRejectedClone.body : [];
  check("Successful clone appears as the only current target version",
    versionsBeforeRejectedClone.response.status === 200 &&
      versionRowsBefore.length === 1 &&
      idOf(versionRowsBefore[0]._id) === idOf(cloned._id) &&
      versionRowsBefore[0].isCurrent === true,
    "versions " + versionRowsBefore.length);

  const firstSourceSubjectId = sourceSubjectIds[0];
  const firstTargetSubject = targetSubjectBySource.get(firstSourceSubjectId);
  await Subject.create({
    academicSession: testSession._id,
    programId: firstTargetSubject.programId || null,
    subjectType: firstTargetSubject.subjectType,
    active: true,
    name: firstTargetSubject.name,
    code: firstTargetSubject.code || "",
    faculty: firstTargetSubject.faculty,
    section: firstTargetSubject.section,
    classesPerWeek: firstTargetSubject.classesPerWeek,
    totalSessions: firstTargetSubject.totalSessions,
    maxClassesPerWeek: firstTargetSubject.maxClassesPerWeek,
    duration: firstTargetSubject.duration,
    roomType: firstTargetSubject.roomType
  });

  const ambiguousClone = await api("/api/timetable/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceTimetableId: String(source._id), targetSessionId: testSessionId })
  });
  check("Ambiguous target Subject mapping is rejected",
    ambiguousClone.response.status === 409,
    "HTTP " + ambiguousClone.response.status + (ambiguousClone.body?.message ? " — " + ambiguousClone.body.message : ""));

  const versionsAfterRejectedClone = await api("/api/timetable/versions?sessionId=" + encodeURIComponent(testSessionId));
  const versionRowsAfter = Array.isArray(versionsAfterRejectedClone.body) ? versionsAfterRejectedClone.body : [];
  const currentBefore = versionRowsBefore.filter(row => row.isCurrent === true).map(row => String(row._id)).sort();
  const currentAfter = versionRowsAfter.filter(row => row.isCurrent === true).map(row => String(row._id)).sort();
  check("Rejected ambiguous clone leaves target versions unchanged",
    versionsAfterRejectedClone.response.status === 200 &&
      versionRowsAfter.length === versionRowsBefore.length &&
      currentBefore.length === currentAfter.length &&
      currentBefore.every((id, index) => id === currentAfter[index]) &&
      currentAfter.includes(String(cloned._id)),
    "before " + versionRowsBefore.length + ", after " + versionRowsAfter.length);
}

function cryptoRandomSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function main() {
  const apiHostIsLocal = localHosts.has(apiHost);
  if (!apiHostIsLocal) {
    console.log("SKIP  Cross-session clone mutation tests — only allowed against a localhost API.\n");
    return;
  }
  if (!allowMutation) {
    console.log('SKIP  Cross-session clone mutation tests — set $env:QA_ALLOW_CLONE_MUTATION="true" to explicitly enable this test.\n');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    console.log('SKIP  Cross-session clone mutation tests — MongoDB is remote. Use an isolated staging database and set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" only after confirming the target database.\n');
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
