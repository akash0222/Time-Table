import process from "node:process";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const unknownId = "000000000000000000000000";
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

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(base + path, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach " + base + ". Start the backend and verify MongoDB/env configuration. " + error.message);
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

console.log("Time Table read-only hardening regression checks\nTarget: " + base + "\n");
console.log("Safety: this suite only reads records and sends invalid preview/lookup requests; it does not create, update, delete, publish, or restore application data.\n");

try {
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running hardening checks.");

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
  token = login.body?.token || "";
  if (!token) throw new Error("Cannot run authenticated checks until admin login succeeds.");

  const [sessionsResult, activeResult, shareableResult, shareLinksResult, promotionHistory] = await Promise.all([
    request("/api/sessions"),
    request("/api/sessions/active"),
    request("/api/shareable-timetables"),
    request("/api/share-links"),
    request("/api/student-promotions/history?limit=5")
  ]);

  check("Academic sessions read", sessionsResult.response.status === 200 && Array.isArray(sessionsResult.body),
    "HTTP " + sessionsResult.response.status);
  check("Active academic session read", activeResult.response.status === 200,
    "HTTP " + activeResult.response.status);
  check("Shareable timetable listing is protected and readable by admin",
    shareableResult.response.status === 200 && Array.isArray(shareableResult.body),
    "HTTP " + shareableResult.response.status);
  check("Share-link management listing is protected and readable by admin",
    shareLinksResult.response.status === 200 && Array.isArray(shareLinksResult.body),
    "HTTP " + shareLinksResult.response.status);
  check("Student promotion history is readable",
    promotionHistory.response.status === 200 && Array.isArray(promotionHistory.body),
    "HTTP " + promotionHistory.response.status);

  const emptyPreview = await request("/api/student-promotions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentIds: [], toSection: unknownId, academicSessionId: unknownId })
  });
  check("Promotion preview rejects empty student selection",
    emptyPreview.response.status === 400,
    "HTTP " + emptyPreview.response.status);

  const incompletePreview = await request("/api/student-promotions/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentIds: [unknownId], toSection: "", academicSessionId: unknownId })
  });
  check("Promotion preview rejects missing target section",
    incompletePreview.response.status === 400,
    "HTTP " + incompletePreview.response.status);

  const publicShare = await request("/api/public/share/qa-nonexistent-token-read-only");
  check("Unknown public share token is rejected",
    publicShare.response.status === 404,
    "HTTP " + publicShare.response.status);

  const missingRestore = await request("/api/timetable/" + unknownId + "/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  check("Restore rejects an unknown timetable version without mutation",
    missingRestore.response.status === 404,
    "HTTP " + missingRestore.response.status);

  const missingHistoryIds = await request("/api/timetable/change-history");
  check("Change history requires both version IDs",
    missingHistoryIds.response.status === 400,
    "HTTP " + missingHistoryIds.response.status);

  const unknownHistoryIds = await request("/api/timetable/change-history?fromId=" + unknownId + "&toId=" + unknownId);
  check("Change history rejects unknown version IDs",
    unknownHistoryIds.response.status === 404,
    "HTTP " + unknownHistoryIds.response.status);

  const sessions = Array.isArray(sessionsResult.body) ? sessionsResult.body : [];
  const versionSets = await Promise.all(sessions.map(async session => {
    const sid = String(session?._id || "");
    if (!sid) return { sid: "", rows: [] };
    const result = await request("/api/timetable/versions?sessionId=" + encodeURIComponent(sid));
    return { sid, rows: result.response.status === 200 && Array.isArray(result.body) ? result.body : [] };
  }));
  let crossSessionPair = null;
  for (let i = 0; i < versionSets.length && !crossSessionPair; i += 1) {
    for (let j = i + 1; j < versionSets.length && !crossSessionPair; j += 1) {
      if (versionSets[i].sid !== versionSets[j].sid && versionSets[i].rows.length && versionSets[j].rows.length) {
        crossSessionPair = { from: versionSets[i].rows[0], to: versionSets[j].rows[0] };
      }
    }
  }

  if (crossSessionPair) {
    const cross = await request("/api/timetable/change-history?fromId=" +
      encodeURIComponent(String(crossSessionPair.from._id)) + "&toId=" +
      encodeURIComponent(String(crossSessionPair.to._id)));
    check("Change history blocks comparisons across academic sessions",
      cross.response.status === 409,
      "HTTP " + cross.response.status);
  } else {
    skip("Change history blocks comparisons across academic sessions",
      "Need timetable versions in at least two different academic sessions to run this data-dependent check.");
  }

} catch (error) {
  failures.push(error.message);
  console.error("ERROR  " + error.message);
}

console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
if (failures.length) process.exitCode = 1;
