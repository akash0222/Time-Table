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

async function api(path, options = {}) {
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
  }
  return { response, body };
}

function idOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function programOf(entry) {
  const section = entry?.section && typeof entry.section === "object" ? entry.section : {};
  if (section.program && typeof section.program === "object") return String(section.program.name || section.program.code || "");
  return String(section.program || section.programName || section.programId?.name || "");
}

function semesterOf(entry) {
  const section = entry?.section && typeof entry.section === "object" ? entry.section : {};
  return String(section.semester ?? section.year ?? "");
}

function matches(entry, filters) {
  const program = programOf(entry);
  const semester = semesterOf(entry);
  const section = entry?.section && typeof entry.section === "object" ? entry.section : {};
  const q = String(filters.search || "").trim().toLowerCase();
  if (filters.program && filters.program !== "ALL" && program !== filters.program) return false;
  if (filters.semester && filters.semester !== "ALL" && semester !== filters.semester) return false;
  if (filters.sectionId && filters.sectionId !== "ALL" && idOf(section._id || entry.section) !== filters.sectionId) return false;
  if (q) {
    const haystack = [
      program, semester, section.name, entry.day, entry.startTime, entry.endTime,
      entry.subject?.name, entry.subject?.code, entry.faculty?.name, entry.room?.name
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

async function download(format, sessionId, filters = {}) {
  const params = new URLSearchParams({
    sessionId,
    view: "all",
    program: filters.program ?? "ALL",
    semester: filters.semester ?? "ALL",
    sectionId: filters.sectionId ?? "",
    search: filters.search ?? ""
  });
  const response = await fetch(base + "/api/timetable/export/" + format + "?" + params, {
    headers: { Authorization: "Bearer " + token }
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes };
}

console.log("Time Table export regression checks\nTarget: " + base + "\n");

try {
  if (!password) {
    throw new Error("Set QA_ADMIN_PASSWORD (or DEFAULT_ADMIN_PASSWORD) before running export regression checks.");
  }

  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
  token = login.body?.token || "";
  if (!token) throw new Error("Cannot run authenticated export checks until admin login succeeds.");

  const active = await api("/api/sessions/active");
  check("Active session endpoint", active.response.status === 200, "HTTP " + active.response.status);
  const sessionId = String(active.body?._id || "");
  if (!sessionId) {
    skip("Timetable exports", "No active academic session; create/activate a session and generate a timetable to test exports.");
  } else {
    const latest = await api("/api/timetable/latest?sessionId=" + encodeURIComponent(sessionId));
    check("Current session timetable endpoint", latest.response.status === 200, "HTTP " + latest.response.status);
    const entries = Array.isArray(latest.body?.entries) ? latest.body.entries : [];

    if (!entries.length) {
      skip("Filtered Excel/PDF exports", "No timetable entries exist for the active session.");
    } else {
      const fullExcel = await download("excel", sessionId);
      const excelType = fullExcel.response.headers.get("content-type") || "";
      check(
        "Excel export returns XLSX",
        fullExcel.response.status === 200 &&
          excelType.includes("spreadsheetml") &&
          fullExcel.bytes.length > 100 &&
          fullExcel.bytes.subarray(0, 2).toString() === "PK",
        "HTTP " + fullExcel.response.status + ", " + fullExcel.bytes.length + " bytes"
      );

      let exportedRows = [];
      if (fullExcel.response.status === 200 && fullExcel.bytes.subarray(0, 2).toString() === "PK") {
        try {
          const workbook = XLSX.read(fullExcel.bytes, { type: "buffer" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          exportedRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        } catch (error) {
          failures.push("Excel workbook can be parsed");
          console.error("FAIL  Excel workbook can be parsed — " + error.message);
        }
      }
      check("Excel row count matches current session", exportedRows.length === entries.length,
        "expected " + entries.length + ", received " + exportedRows.length);

      const sample = entries.find(e => e?.section?._id || e?.section) || entries[0];
      const sampleSectionId = idOf(sample?.section?._id || sample?.section);
      const sampleProgram = programOf(sample);
      const sampleSemester = semesterOf(sample);
      const sampleSubject = String(sample?.subject?.name || "").trim();

      const filterCases = [
        ...(sampleProgram ? [{ name: "Program filter", filters: { program: sampleProgram } }] : []),
        ...(sampleSemester ? [{ name: "Semester filter", filters: { semester: sampleSemester } }] : []),
        ...(sampleSectionId ? [{ name: "Section filter", filters: { sectionId: sampleSectionId } }] : []),
        ...(sampleSubject ? [{ name: "Search filter", filters: { search: sampleSubject } }] : []),
        ...(sampleProgram && sampleSemester ? [{ name: "Combined program + semester", filters: { program: sampleProgram, semester: sampleSemester } }] : [])
      ];

      for (const testCase of filterCases) {
        const expected = entries.filter(entry => matches(entry, testCase.filters));
        const file = await download("excel", sessionId, testCase.filters);
        const isZip = file.bytes.subarray(0, 2).toString() === "PK";
        let rows = [];
        if (file.response.status === 200 && isZip) {
          try {
            const wb = XLSX.read(file.bytes, { type: "buffer" });
            rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          } catch {}
        }
        check(testCase.name + " restricts Excel rows",
          file.response.status === 200 && isZip && rows.length === expected.length,
          "expected " + expected.length + ", received " + rows.length + ", HTTP " + file.response.status);
      }

      const pdf = await download("pdf", sessionId, sampleSectionId ? { sectionId: sampleSectionId } : {});
      const pdfType = pdf.response.headers.get("content-type") || "";
      check("Filtered PDF export returns PDF",
        pdf.response.status === 200 && pdfType.includes("application/pdf") &&
          pdf.bytes.length > 100 && pdf.bytes.subarray(0, 5).toString() === "%PDF-",
        "HTTP " + pdf.response.status + ", " + pdf.bytes.length + " bytes");
    }
  }
} catch (error) {
  failures.push(error.message);
  console.error("ERROR  " + error.message);
}

console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
if (failures.length) process.exitCode = 1;
