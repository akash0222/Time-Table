import "dotenv/config";
import process from "node:process";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
let token = "";
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

async function run() {
  console.log("Time Table personal timetable response regression checks");
  console.log("API: " + base + "\n");
  console.log("Safety: read-only. This test reads the active session and timetable and does not mutate application data.\n");
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running this test.");

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  token = login.body?.token || "";
  check("Admin login", login.response.status === 200 && Boolean(token), "HTTP " + login.response.status);
  if (!token) throw new Error("Cannot run personal timetable checks until admin login succeeds.");

  const sessionResult = await api("/api/sessions/active");
  const session = sessionResult.body;
  const sessionId = idOf(session);
  check("Active academic session is available", sessionResult.response.status === 200 && Boolean(sessionId),
    "HTTP " + sessionResult.response.status + (session?.name ? ", " + session.name : ""));
  if (!sessionId) {
    skip("Personal timetable response checks", "No active session is configured.");
    return;
  }

  const latestResult = await api("/api/timetable/latest?sessionId=" + encodeURIComponent(sessionId));
  const latest = latestResult.body || {};
  const entries = Array.isArray(latest.entries) ? latest.entries : [];
  check("Current timetable for active session is readable",
    latestResult.response.status === 200 && idOf(latest.academicSession) === sessionId && entries.length > 0,
    "HTTP " + latestResult.response.status + ", entries " + entries.length);
  if (latestResult.response.status !== 200 || !entries.length) {
    skip("Selected faculty and section response tests", "No current timetable entries are available.");
    return;
  }

  const facultyId = idOf(entries.find(entry => idOf(entry.faculty))?.faculty);
  const sectionId = idOf(entries.find(entry => idOf(entry.section))?.section);
  if (!facultyId || !sectionId) throw new Error("Current timetable entries must contain Faculty and Section mappings.");

  const queryBase = "&sessionId=" + encodeURIComponent(sessionId);
  const facultyResult = await api("/api/personal-timetable?type=FACULTY&id=" + encodeURIComponent(facultyId) + queryBase);
  const facultyReport = facultyResult.body || {};
  const expectedFacultyRows = entries.filter(entry => idOf(entry.faculty) === facultyId);
  const facultyRows = Array.isArray(facultyReport.rows) ? facultyReport.rows : [];
  check("Admin-selected Faculty timetable returns frontend-compatible response",
    facultyResult.response.status === 200 &&
    facultyReport.type === "FACULTY" &&
    idOf(facultyReport.target) === facultyId &&
    Array.isArray(facultyReport.rows) &&
    Array.isArray(facultyReport.entries) &&
    Array.isArray(facultyReport.weekly) &&
    facultyReport.weekly.length === 7 &&
    facultyReport.summary?.classes === expectedFacultyRows.length,
    "HTTP " + facultyResult.response.status + ", expected " + expectedFacultyRows.length + " classes, received " + facultyRows.length);
  check("Faculty rows are scoped to the selected Faculty",
    facultyRows.length === expectedFacultyRows.length && facultyRows.every(row => row.facultyId === facultyId),
    "rows " + facultyRows.length);
  check("Faculty profile and today's schedule have displayable metadata",
    Boolean(facultyReport.target?.name) &&
    Boolean(facultyReport.session?.name) &&
    Boolean(facultyReport.timetable?.status) &&
    ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].includes(facultyReport.today?.day) &&
    Array.isArray(facultyReport.today?.rows),
    "target " + String(facultyReport.target?.name || "(missing)") + ", day " + String(facultyReport.today?.day || "(missing)"));

  const sectionResult = await api("/api/personal-timetable?type=SECTION&id=" + encodeURIComponent(sectionId) + queryBase);
  const sectionReport = sectionResult.body || {};
  const expectedSectionRows = entries.filter(entry => idOf(entry.section) === sectionId);
  const sectionRows = Array.isArray(sectionReport.rows) ? sectionReport.rows : [];
  check("Admin-selected Section timetable returns frontend-compatible response",
    sectionResult.response.status === 200 &&
    sectionReport.type === "SECTION" &&
    idOf(sectionReport.target) === sectionId &&
    Array.isArray(sectionReport.rows) &&
    Array.isArray(sectionReport.weekly) &&
    sectionReport.weekly.length === 7 &&
    sectionReport.summary?.classes === expectedSectionRows.length,
    "HTTP " + sectionResult.response.status + ", expected " + expectedSectionRows.length + " classes, received " + sectionRows.length);
  check("Section rows are scoped to the selected Section",
    sectionRows.length === expectedSectionRows.length && sectionRows.every(row => row.sectionId === sectionId),
    "rows " + sectionRows.length);
  check("Section target label includes its academic mapping",
    Boolean(sectionReport.target?.name) && Boolean(sectionReport.target?.program) && Boolean(sectionReport.target?.semester),
    [sectionReport.target?.program,sectionReport.target?.semester,sectionReport.target?.name].filter(Boolean).join(" · "));

  const noneSelected = await api("/api/personal-timetable?type=SECTION" + queryBase);
  check("Admin without a selected target receives an empty selection state",
    noneSelected.response.status === 200 &&
    noneSelected.body?.target === null &&
    Array.isArray(noneSelected.body?.rows) &&
    noneSelected.body.rows.length === 0 &&
    noneSelected.body?.summary?.classes === 0,
    "HTTP " + noneSelected.response.status + ", rows " + (noneSelected.body?.rows?.length ?? "missing"));
}

async function main() {
  try {
    await run();
  } catch (error) {
    failures.push(error.message);
    console.error("ERROR  " + (error.stack || error.message));
  }
  console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
  if (failures.length) process.exitCode = 1;
}

await main();
