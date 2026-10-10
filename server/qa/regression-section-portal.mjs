import "dotenv/config";
import process from "node:process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { connectDB } from "../config/db.js";
import AcademicSession from "../models/AcademicSession.js";
import Section from "../models/Section.js";
import User from "../models/User.js";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_SECTION_PORTAL_MUTATION || "").trim().toLowerCase() === "true";
const allowRemoteDatabase = String(process.env.QA_ALLOW_REMOTE_DB_MUTATION || "").trim().toLowerCase() === "true";
const hostOf = value => { try { return new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase(); } catch { return ""; } };
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const apiHost = hostOf(base);
const mongoHost = hostOf(env.mongoUri);
const fixturePassword = "QA-Section-Portal-Password-2026!";
let adminToken = "";
let connected = false;
let assignedViewerId = "";
let unassignedViewerId = "";
let assignedUsername = "";
let unassignedUsername = "";
let assignedSectionId = "";
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

async function loginAs(name, secret) {
  const login = await api("/api/auth/login", "", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: name, password: secret })
  });
  return { ...login, token: login.body?.token || "" };
}

async function cleanup() {
  if (!connected) return;
  const errors = [];
  for (const [label, id] of [["assigned Viewer", assignedViewerId], ["unassigned Viewer", unassignedViewerId]]) {
    if (!id) continue;
    try { await User.deleteOne({ _id: id }); }
    catch (error) { errors.push(label + ": " + error.message); }
  }
  if (errors.length) {
    failures.push("Temporary Viewer cleanup");
    console.error("FAIL  Temporary Viewer cleanup — " + errors.join("; "));
  } else if (assignedViewerId || unassignedViewerId) {
    console.log("CLEANUP Temporary assigned and unassigned Viewer accounts removed.");
  }
}

async function run() {
  console.log("Time Table Section Portal authorization and response regression checks");
  console.log("API: " + base);
  console.log("Mongo host: " + (mongoHost || "(unparsed)") + "\n");
  console.log("Safety: creates two temporary Viewer accounts and deletes them in finally. No existing user mapping, timetable, session, or section is modified.\n");

  if (!localHosts.has(apiHost)) {
    skip("Section Portal regression", "Only allowed against a localhost API. Current host: " + (apiHost || "invalid URL"));
    return;
  }
  if (!allowMutation) {
    skip("Section Portal regression", 'Set $env:QA_ALLOW_SECTION_PORTAL_MUTATION="true" to explicitly enable this temporary-user test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Section Portal regression", 'MongoDB is remote. Use an isolated staging database and separately set $env:QA_ALLOW_REMOTE_DB_MUTATION="true" only after confirmation.');
    return;
  }
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running this test.");

  await connectDB();
  connected = true;

  const adminLogin = await loginAs(username, password);
  adminToken = adminLogin.token;
  check("Admin login", adminLogin.response.status === 200 && Boolean(adminToken), "HTTP " + adminLogin.response.status);
  if (!adminToken) throw new Error("Cannot run Section Portal checks without Admin login.");

  const activeSession = await AcademicSession.findOne({ active: true }).lean();
  if (!activeSession) {
    skip("Section Portal mapping and isolation", "No active academic session is configured.");
    return;
  }
  const section = await Section.findOne({ academicSession: activeSession._id }).lean()
    || await Section.findOne().lean();
  if (!section) {
    skip("Section Portal mapping and isolation", "No Section record exists in the local database.");
    return;
  }
  assignedSectionId = String(section._id);
  const nameSuffix = suffix().toLowerCase().replace(/[^a-z0-9]/g, "").slice(-16);
  assignedUsername = "qa-section-" + nameSuffix;
  unassignedUsername = "qa-nosection-" + nameSuffix;
  const passwordHash = await bcrypt.hash(fixturePassword, 10);

  const assigned = await User.create({
    name: "QA Section Portal Viewer",
    username: assignedUsername,
    passwordHash,
    role: "VIEWER",
    faculty: null,
    section: section._id,
    active: true
  });
  assignedViewerId = String(assigned._id);

  const unassigned = await User.create({
    name: "QA Unassigned Viewer",
    username: unassignedUsername,
    passwordHash,
    role: "VIEWER",
    faculty: null,
    section: null,
    active: true
  });
  unassignedViewerId = String(unassigned._id);

  const assignedLogin = await loginAs(assignedUsername, fixturePassword);
  check("Assigned Viewer login", assignedLogin.response.status === 200 && Boolean(assignedLogin.token), "HTTP " + assignedLogin.response.status);
  if (!assignedLogin.token) throw new Error("Assigned Viewer could not log in.");
  const assignedToken = assignedLogin.token;

  const list = await api("/api/section-portal/sections", assignedToken);
  check("Viewer section list is restricted to the current database mapping",
    list.response.status === 200 && Array.isArray(list.body) && list.body.length === 1 && idOf(list.body[0]) === assignedSectionId,
    "HTTP " + list.response.status + ", returned " + (Array.isArray(list.body) ? list.body.length : "non-array") + " section(s)");

  const portal = await api("/api/section-portal?sectionId=" + encodeURIComponent(assignedSectionId), assignedToken);
  const rows = portal.body?.timetableRows;
  check("Assigned Section Portal loads successfully",
    portal.response.status === 200 && idOf(portal.body?.section) === assignedSectionId &&
    Array.isArray(rows) && Array.isArray(portal.body?.daily) &&
    portal.body?.summary && typeof portal.body.summary.scheduledClasses === "number" &&
    typeof portal.body.summary.weeklyPeriods === "number" && "session" in portal.body,
    "HTTP " + portal.response.status + ", " + (Array.isArray(rows) ? rows.length : "missing") + " timetable row(s)");

  check("Section timetable rows expose frontend-compatible display fields",
    Array.isArray(rows) && rows.every(row =>
      typeof row.id === "string" && typeof row.day === "string" &&
      typeof row.subject === "string" && typeof row.faculty === "string" &&
      typeof row.room === "string" && typeof row.duration === "number"),
    "rows " + (Array.isArray(rows) ? rows.length : "missing"));

  const forbiddenId = new mongoose.Types.ObjectId().toString();
  const other = await api("/api/section-portal?sectionId=" + encodeURIComponent(forbiddenId), assignedToken);
  check("Viewer is forbidden from requesting another section",
    other.response.status === 403 && /assigned Section/i.test(String(other.body?.message || "")),
    "HTTP " + other.response.status);

  const assignedListAfter = await api("/api/section-portal/sections", assignedToken);
  check("Attempt to request another section does not broaden the Viewer section list",
    assignedListAfter.response.status === 200 && Array.isArray(assignedListAfter.body) &&
    assignedListAfter.body.length === 1 && idOf(assignedListAfter.body[0]) === assignedSectionId,
    "returned " + (Array.isArray(assignedListAfter.body) ? assignedListAfter.body.length : "non-array") + " section(s)");

  const unassignedLogin = await loginAs(unassignedUsername, fixturePassword);
  check("Unassigned Viewer login", unassignedLogin.response.status === 200 && Boolean(unassignedLogin.token), "HTTP " + unassignedLogin.response.status);
  if (!unassignedLogin.token) throw new Error("Unassigned Viewer could not log in.");
  const unassignedList = await api("/api/section-portal/sections", unassignedLogin.token);
  check("Unassigned Viewer cannot enumerate sections",
    unassignedList.response.status === 400 && /No Section is mapped/i.test(String(unassignedList.body?.message || "")),
    "HTTP " + unassignedList.response.status);
  const unassignedPortal = await api("/api/section-portal?sectionId=" + encodeURIComponent(assignedSectionId), unassignedLogin.token);
  check("Unassigned Viewer cannot access a manually requested section",
    unassignedPortal.response.status === 400 && /No Section is mapped/i.test(String(unassignedPortal.body?.message || "")),
    "HTTP " + unassignedPortal.response.status);
}

async function main() {
  if (!localHosts.has(apiHost)) {
    skip("Section Portal regression", "Only allowed against a localhost API.");
    return;
  }
  if (!allowMutation) {
    skip("Section Portal regression", 'Set $env:QA_ALLOW_SECTION_PORTAL_MUTATION="true" to enable the local fixture test.');
    return;
  }
  if (!localHosts.has(mongoHost) && !allowRemoteDatabase) {
    skip("Section Portal regression", "Remote database mutation is disabled by default.");
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
