import process from "node:process";
import XLSX from "xlsx";

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

async function fileRequest(path) {
  const response = await fetch(base + path, {
    headers: token ? { Authorization: "Bearer " + token } : {}
  });
  return {
    response,
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || ""
  };
}

function isXlsx(bytes, contentType) {
  return contentType.includes("spreadsheetml") && bytes.length > 100 && bytes.subarray(0, 2).toString() === "PK";
}

function readXlsxRowCount(bytes) {
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(worksheet, { defval: "" }).length;
}

console.log("Time Table academic-session isolation regression checks\nTarget: " + base + "\n");

try {
  if (!password) throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running session checks.");

  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
  token = login.body?.token || "";
  if (!token) throw new Error("Cannot run session checks until admin login succeeds.");

  const sessionsResponse = await request("/api/sessions");
  check("Academic sessions endpoint", sessionsResponse.response.status === 200 && Array.isArray(sessionsResponse.body),
    "HTTP " + sessionsResponse.response.status);
  const sessions = Array.isArray(sessionsResponse.body) ? sessionsResponse.body : [];

  const activeSessionResponse = await request("/api/sessions/active");
  check("Active session endpoint", activeSessionResponse.response.status === 200, "HTTP " + activeSessionResponse.response.status);
  const activeSession = activeSessionResponse.body;
  const activeSessionId = String(activeSession?._id || "");
  if (activeSessionId) {
    const activeQuery = "?sessionId=" + encodeURIComponent(activeSessionId);
    const [specificLatest, defaultLatest, defaultAnalytics, defaultConflicts, defaultReport] = await Promise.all([
      request("/api/timetable/latest" + activeQuery),
      request("/api/timetable/latest"),
      request("/api/analytics"),
      request("/api/analytics/conflicts"),
      request("/api/reports/summary")
    ]);
    const specificId = String(specificLatest.body?._id || "");
    const defaultId = String(defaultLatest.body?._id || "");
    check("Default latest timetable uses active session",
      specificLatest.response.status === 200 && defaultLatest.response.status === 200 && defaultId === specificId,
      "active timetable " + (specificId || "none") + ", default " + (defaultId || "none"));
    check("Default analytics uses active session",
      defaultAnalytics.response.status === 200 &&
        Boolean(defaultAnalytics.body?.hasTimetable) === Boolean(specificId) &&
        (!specificId || String(defaultAnalytics.body?.timetableId || "") === specificId),
      "HTTP " + defaultAnalytics.response.status);
    check("Default conflict report uses active session",
      defaultConflicts.response.status === 200 &&
        Boolean(defaultConflicts.body?.hasTimetable) === Boolean(specificId) &&
        (!specificId || String(defaultConflicts.body?.timetableId || "") === specificId),
      "HTTP " + defaultConflicts.response.status);
    check("Default reports page uses active session",
      defaultReport.response.status === 200 &&
        String(defaultReport.body?.session?._id || "") === activeSessionId &&
        String(defaultReport.body?.timetable?._id || "") === specificId,
      "HTTP " + defaultReport.response.status);
  } else {
    skip("Default active-session routing", "There is no active academic session.");
  }

  if (!sessions.length) {
    skip("Session isolation checks", "No academic sessions are configured.");
  } else {
    for (const session of sessions) {
      const sessionId = String(session?._id || "");
      const label = String(session?.name || sessionId);
      if (!sessionId) {
        check("Session has an ID: " + label, false, "No session ID returned.");
        continue;
      }

      const query = "?sessionId=" + encodeURIComponent(sessionId);
      const latest = await request("/api/timetable/latest" + query);
      const latestBody = latest.body || {};
      const currentId = String(latestBody?._id || "");
      const hasTimetable = Boolean(currentId);
      const entries = Array.isArray(latestBody.entries) ? latestBody.entries : [];

      check("Latest timetable is session-scoped: " + label, latest.response.status === 200 &&
        (!hasTimetable || idOf(latestBody.academicSession) === sessionId),
        "HTTP " + latest.response.status + (hasTimetable ? ", timetable " + currentId : ", no current timetable"));

      const status = await request("/api/timetable/status" + query);
      check("Status is session-scoped: " + label, status.response.status === 200 &&
        String(status.body?.timetableId || "") === currentId &&
        String(status.body?.status || "DRAFT") === String(latestBody.status || "DRAFT"),
        "HTTP " + status.response.status + ", status " + String(status.body?.status || "DRAFT"));

      const workflow = await request("/api/timetable/workflow" + query);
      check("Workflow is session-scoped: " + label, workflow.response.status === 200 &&
        String(workflow.body?.timetableId || "") === currentId &&
        String(workflow.body?.status || "DRAFT") === String(latestBody.status || "DRAFT"),
        "HTTP " + workflow.response.status + ", status " + String(workflow.body?.status || "DRAFT"));

      const validation = await request("/api/timetable/validation" + query);
      check("Validation Center is session-scoped: " + label, validation.response.status === 200 &&
        Boolean(validation.body?.hasTimetable) === hasTimetable &&
        (!hasTimetable || String(validation.body?.timetable?._id || "") === currentId),
        "HTTP " + validation.response.status);

      const analytics = await request("/api/analytics" + query);
      check("Analytics is session-scoped: " + label, analytics.response.status === 200 &&
        Boolean(analytics.body?.hasTimetable) === hasTimetable &&
        (!hasTimetable || String(analytics.body?.timetableId || "") === currentId),
        "HTTP " + analytics.response.status);

      const conflicts = await request("/api/analytics/conflicts" + query);
      check("Conflict report is session-scoped: " + label, conflicts.response.status === 200 &&
        Boolean(conflicts.body?.hasTimetable) === hasTimetable &&
        (!hasTimetable || String(conflicts.body?.timetableId || "") === currentId),
        "HTTP " + conflicts.response.status);

      const report = await request("/api/reports/summary" + query);
      const reportId = String(report.body?.timetable?._id || "");
      const reportSessionId = String(report.body?.session?._id || report.body?.session || "");
      const reportTimetableSessionId = idOf(report.body?.timetable?.academicSession);
      check("Reports summary is session-scoped: " + label, report.response.status === 200 &&
        reportId === currentId && reportSessionId === sessionId &&
        (!currentId || reportTimetableSessionId === sessionId) &&
        typeof report.body?.validation?.errors === "number" &&
        typeof report.body?.validation?.warnings === "number" &&
        Array.isArray(report.body?.subjects) &&
        typeof report.body?.summary?.periods === "number",
        "HTTP " + report.response.status + (report.response.status === 200 ? ", report timetable " + (reportId || "none") : ""));

      const structure = await request("/api/academic-structure" + query);
      const knownSectionIds = new Set((structure.body?.sections || []).map(section => String(section._id)));
      check("Report subject mappings belong to this session: " + label,
        structure.response.status === 200 &&
          (report.body?.subjects || []).every(subject => knownSectionIds.has(String(subject.sectionId))),
        "HTTP " + structure.response.status + ", " + (report.body?.subjects || []).length + " subject mapping(s)");

      const versions = await request("/api/timetable/versions" + query);
      const versionRows = Array.isArray(versions.body) ? versions.body : [];
      const versionsMatch = versions.response.status === 200 &&
        versionRows.every(v => idOf(v.academicSession) === sessionId) &&
        (!hasTimetable || versionRows.some(v => String(v._id) === currentId && v.isCurrent === true));
      check("Version list is session-scoped: " + label, versionsMatch,
        "HTTP " + versions.response.status + ", " + versionRows.length + " version(s)");

      const params = new URLSearchParams({ sessionId, view: "all", program: "ALL", semester: "ALL", sectionId: "", search: "" });
      if (hasTimetable && entries.length) {
        const timetableExcel = await fileRequest("/api/timetable/export/excel?" + params);
        let rowCount = -1;
        if (isXlsx(timetableExcel.bytes, timetableExcel.contentType)) {
          try { rowCount = readXlsxRowCount(timetableExcel.bytes); } catch {}
        }
        check("Timetable Excel belongs to session: " + label,
          timetableExcel.response.status === 200 && rowCount === entries.length,
          "HTTP " + timetableExcel.response.status + ", expected " + entries.length + ", received " + rowCount);

        const timetablePdf = await fileRequest("/api/timetable/export/pdf?" + params);
        check("Timetable PDF belongs to session: " + label,
          timetablePdf.response.status === 200 && timetablePdf.contentType.includes("application/pdf") &&
            timetablePdf.bytes.subarray(0, 5).toString() === "%PDF-",
          "HTTP " + timetablePdf.response.status);

        const reportExcel = await fileRequest("/api/reports/export/excel?sessionId=" + encodeURIComponent(sessionId));
        let reportRowCount = -1;
        if (isXlsx(reportExcel.bytes, reportExcel.contentType)) {
          try { reportRowCount = readXlsxRowCount(reportExcel.bytes); } catch {}
        }
        check("Report Excel belongs to session: " + label,
          reportExcel.response.status === 200 && reportRowCount === entries.length,
          "HTTP " + reportExcel.response.status + ", expected " + entries.length + ", received " + reportRowCount);

        const reportPdf = await fileRequest("/api/reports/export/pdf?sessionId=" + encodeURIComponent(sessionId));
        check("Report PDF belongs to session: " + label,
          reportPdf.response.status === 200 && reportPdf.contentType.includes("application/pdf") &&
            reportPdf.bytes.subarray(0, 5).toString() === "%PDF-",
          "HTTP " + reportPdf.response.status);
      } else {
        skip("Exports for " + label, "No current timetable entries in this session.");
      }
    }
  }
} catch (error) {
  failures.push(error.message);
  console.error("ERROR  " + (error.stack || error.message));
}

console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
if (failures.length) process.exitCode = 1;
