import "dotenv/config";
import process from "node:process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import AcademicSession from "../models/AcademicSession.js";
import Faculty from "../models/Faculty.js";
import User from "../models/User.js";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const adminUsername = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const adminPassword = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_FACULTY_PORTAL_MUTATION || "").trim().toLowerCase() === "true";
const allowRemoteDatabase = String(process.env.QA_ALLOW_REMOTE_DB_MUTATION || "").trim().toLowerCase() === "true";
const hostOf = value => { try { return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { return ""; } };
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const apiHost = hostOf(base);
const mongoHost = hostOf(env.mongoUri);
const fixturePassword = "QA-Faculty-Portal-Password-2026!";
let connected = false;
let assignedUserId = "";
let unassignedUserId = "";
let assignedUsername = "";
let unassignedUsername = "";
let assignedFacultyId = "";
let otherFacultyId = "";
let passed = 0;
let skipped = 0;
const failures = [];

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

function suffix() {
  return new Date().toISOString().replace(/\D/g, "").slice(0, 14) + Math.random().toString(36).slice(2, 7);
}

async function api(path, token = "", options = {}) {
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

async function loginAs(username, password) {
  const result = await api("/api/auth/login", "", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return { ...result, token: result.body?.token || "" };
}

async function cleanup() {
  if (!connected) return;
  const errors = [];
  for (const [label, id] of [["assigned Faculty user", assignedUserId], ["unassigned Faculty user", unassignedUserId]]) {
    if (!id) continue;
    try { await User.deleteOne({ _id: id }); }
    catch (error) { errors.push(label + ": " + error.message); }
  }
  if (errors.length) {
    failures.push("Temporary Faculty user cleanup");
    console.error("FAIL  Temporary Faculty user cleanup — " + errors.join("; "));
  } else if (assignedUserId || unassignedUserId) {
    console.log("CLEANUP Temporary assigned and unassigned Faculty accounts removed.");
  }
}

async function run() {
  console.log("Time Table Faculty Portal authorization regression checks");
  console.log("API: " + base);
  console.log("Mongo host: " + (mongoHost || "(unparsed)") + "\n");
  console.log("Safety: creates two temporary Faculty accounts and deletes them in finally. Existing Faculty, user mappings, timetable, session and master data are not changed.\n");

  if (!localHosts.has(apiHost)) {
    skip("Faculty Portal regression", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Faculty Portal regression", 'Set $env:QA_ALLOW_FACULTY_PORTAL_MUTATION="true" to explicitly enable this temporary-user test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Faculty Portal regression", 'MongoDB is remote. Use an isolated staging database and separately opt in to remote DB mutation only after confirmation.');
    return;
  }
  if (!adminPassword) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running this test.");

  await connectDB();
  connected = true;

  const adminLogin = await loginAs(adminUsername, adminPassword);
  check("Admin login", adminLogin.response.status === 200 && Boolean(adminLogin.token), "HTTP " + adminLogin.response.status);
  if (!adminLogin.token) throw new Error("Cannot run Faculty Portal checks without Admin login.");
  const adminToken = adminLogin.token;

  const activeSession = await AcademicSession.findOne({ active: true }).lean();
  if (!activeSession) {
    skip("Faculty Portal assignment checks", "No active academic session is configured.");
    return;
  }
  const latest = await api("/api/timetable/latest?sessionId=" + encodeURIComponent(String(activeSession._id)), adminToken);
  const entries = Array.isArray(latest.body?.entries) ? latest.body.entries : [];
  check("Current timetable is available for the active session", latest.response.status === 200 && entries.length > 0,
    "HTTP " + latest.response.status + ", entries " + entries.length);
  if (!entries.length) {
    skip("Faculty-specific filtering checks", "No current timetable entries are available.");
    return;
  }

  const timetableFacultyIds = [...new Set(entries.map(entry => idOf(entry.faculty)).filter(Boolean))];
  assignedFacultyId = timetableFacultyIds[0] || "";
  if (!assignedFacultyId) throw new Error("Current timetable entries do not contain a Faculty mapping.");

  const otherFaculty = timetableFacultyIds.find(id => id !== assignedFacultyId)
    ? await Faculty.findById(timetableFacultyIds.find(id => id !== assignedFacultyId)).select("name code").lean()
    : await Faculty.findOne({ _id: { $ne: new mongoose.Types.ObjectId(assignedFacultyId) } }).select("name code").lean();
  if (!otherFaculty) {
    skip("Cross-faculty portal denial", "No second Faculty record is available in the local database.");
  } else {
    otherFacultyId = String(otherFaculty._id);
  }

  const assignedFaculty = await Faculty.findById(assignedFacultyId).select("name code").lean();
  if (!assignedFaculty) throw new Error("The assigned Faculty record was not found.");

  const random = suffix().toLowerCase().replace(/[^a-z0-9]/g, "").slice(-18);
  assignedUsername = "qa-faculty-" + random;
  unassignedUsername = "qa-nofaculty-" + random;
  const passwordHash = await bcrypt.hash(fixturePassword, 10);

  const assigned = await User.create({
    name: "QA Assigned Faculty",
    username: assignedUsername,
    passwordHash,
    role: "FACULTY",
    faculty: assignedFaculty._id,
    section: null,
    active: true
  });
  assignedUserId = String(assigned._id);

  const unassigned = await User.create({
    name: "QA Unassigned Faculty",
    username: unassignedUsername,
    passwordHash,
    role: "FACULTY",
    faculty: null,
    section: null,
    active: true
  });
  unassignedUserId = String(unassigned._id);

  const assignedLogin = await loginAs(assignedUsername, fixturePassword);
  check("Assigned Faculty login", assignedLogin.response.status === 200 && Boolean(assignedLogin.token),
    "HTTP " + assignedLogin.response.status);
  if (!assignedLogin.token) throw new Error("Assigned Faculty could not log in.");
  const facultyToken = assignedLogin.token;
  const expectedEntries = entries.filter(entry => idOf(entry.faculty) === assignedFacultyId);

  const portal = await api("/api/faculty-portal", facultyToken);
  const portalEntries = Array.isArray(portal.body?.entries) ? portal.body.entries : [];
  check("Faculty Portal returns the assigned Faculty report",
    portal.response.status === 200 &&
    idOf(portal.body?.faculty) === assignedFacultyId &&
    portal.body?.summary?.classes === expectedEntries.length &&
    Array.isArray(portal.body?.daily) && portal.body.daily.length === 7,
    "HTTP " + portal.response.status + ", expected " + expectedEntries.length + " classes, received " + portalEntries.length);
  check("Faculty Portal entries are limited to the assigned Faculty",
    portalEntries.length === expectedEntries.length &&
    portalEntries.every(entry => idOf(entry.faculty) === assignedFacultyId),
    "entries " + portalEntries.length);

  if (otherFacultyId) {
    const crossPortal = await api("/api/faculty-portal?facultyId=" + encodeURIComponent(otherFacultyId), facultyToken);
    check("Faculty cannot open another Faculty member's portal",
      crossPortal.response.status === 403 &&
      /assigned Faculty portal/i.test(String(crossPortal.body?.message || "")),
      "HTTP " + crossPortal.response.status);

    const personal = await api(
      "/api/personal-timetable?type=FACULTY&id=" + encodeURIComponent(otherFacultyId) +
      "&sessionId=" + encodeURIComponent(String(activeSession._id)),
      facultyToken
    );
    const personalRows = Array.isArray(personal.body?.rows) ? personal.body.rows : [];
    check("Personal timetable ignores another Faculty ID for a Faculty role",
      personal.response.status === 200 &&
      idOf(personal.body?.target) === assignedFacultyId &&
      personalRows.every(row => row.facultyId === assignedFacultyId),
      "HTTP " + personal.response.status + ", target " + idOf(personal.body?.target) + ", rows " + personalRows.length);
  }

  const usersList = await api("/api/auth/users", facultyToken);
  check("Faculty cannot access Admin user management",
    usersList.response.status === 403,
    "HTTP " + usersList.response.status);

  const createUser = await api("/api/auth/users", facultyToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Must Not Be Created", username: "qa-forbidden-" + random, password: fixturePassword, role: "VIEWER" })
  });
  check("Faculty cannot create users",
    createUser.response.status === 403,
    "HTTP " + createUser.response.status);

  const settings = await api("/api/settings", facultyToken, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  check("Faculty cannot change scheduler settings",
    settings.response.status === 403,
    "HTTP " + settings.response.status);

  const generate = await api("/api/timetable/generate", facultyToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ academicSessionId: String(activeSession._id) })
  });
  check("Faculty cannot invoke timetable generation",
    generate.response.status === 403,
    "HTTP " + generate.response.status);

  const unassignedLogin = await loginAs(unassignedUsername, fixturePassword);
  check("Unassigned Faculty login", unassignedLogin.response.status === 200 && Boolean(unassignedLogin.token),
    "HTTP " + unassignedLogin.response.status);
  if (!unassignedLogin.token) throw new Error("Unassigned Faculty could not log in.");
  const unassignedPortal = await api("/api/faculty-portal", unassignedLogin.token);
  check("Unassigned Faculty receives a mapping-required response",
    unassignedPortal.response.status === 400 &&
    /No Faculty is mapped/i.test(String(unassignedPortal.body?.message || "")),
    "HTTP " + unassignedPortal.response.status);
}

async function main() {
  if (!localHosts.has(apiHost)) {
    skip("Faculty Portal regression", "Only allowed against a localhost API.");
    return;
  }
  if (!allowMutation) {
    skip("Faculty Portal regression", 'Set $env:QA_ALLOW_FACULTY_PORTAL_MUTATION="true" to enable the local fixture test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Faculty Portal regression", "Remote database mutation is disabled by default.");
    return;
  }

  try {
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
      catch (error) {
        failures.push("MongoDB disconnect: " + error.message);
        console.error("FAIL  MongoDB disconnect — " + error.message);
      }
    }
  }
  console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
  if (failures.length) process.exitCode = 1;
}

await main();
