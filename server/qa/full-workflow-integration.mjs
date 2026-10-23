import assert from "node:assert/strict";

const base = String(process.env.QA_BASE_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || "");

let token = "";
let passed = 0;

function pass(label, detail = "") {
  passed += 1;
  console.log(`PASS ${label}${detail ? ` — ${detail}` : ""}`);
}

function failDetails(body) {
  if (Buffer.isBuffer(body)) return `binary response (${body.length} bytes)`;
  if (typeof body === "string") return body.slice(0, 500);
  return JSON.stringify(body).slice(0, 1000);
}

async function call(method, path, data, { binary = false, auth = true } = {}) {
  const headers = {};
  if (data !== undefined && !binary) headers["Content-Type"] = "application/json";
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {
    method,
    headers,
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(30000)
  });
  const contentType = response.headers.get("content-type") || "";
  let body;
  if (binary) {
    body = Buffer.from(await response.arrayBuffer());
  } else if (contentType.includes("application/json")) {
    try { body = await response.json(); } catch { body = null; }
  } else {
    body = await response.text();
  }
  return { response, body, contentType };
}

function expectStatus(label, result, status) {
  assert.equal(
    result.response.status,
    status,
    `${label}: expected HTTP ${status}, got HTTP ${result.response.status}; ${failDetails(result.body)}`
  );
  pass(label, `HTTP ${status}`);
  return result.body;
}

async function post(path, payload, label) {
  const result = await call("POST", path, payload);
  return expectStatus(label, result, 201);
}

async function get(path, label) {
  return expectStatus(label, await call("GET", path), 200);
}

console.log("Time-Table full-workflow integration test");
console.log("Target: " + base);
assert.ok(password.length >= 10, "Set a disposable QA_ADMIN_PASSWORD before running integration tests.");

try {
  const anonymous = await call("GET", "/api/sessions", undefined, { auth: false });
  expectStatus("Anonymous access is rejected", anonymous, 401);

  const login = expectStatus(
    "Disposable test administrator can log in",
    await call("POST", "/api/auth/login", { username, password }, { auth: false }),
    200
  );
  assert.ok(login.token, "Login did not return a JWT token.");
  token = login.token;

  const me = await get("/api/auth/me", "Authenticated identity loads");
  assert.equal(me.user?.username, username, "Unexpected user identity.");
  assert.equal(me.user?.role, "ADMIN", "QA account must have ADMIN role.");
  pass("Admin role confirmed");

  const adminToken = token;
  const qaViewerPassword = "DisposableViewer-Only-Password-123!";
  const qaViewer = await post("/api/auth/users", {
    name: "QA Read-only Viewer",
    username: "qa-readonly",
    password: qaViewerPassword,
    role: "VIEWER"
  }, "Create isolated read-only QA account");
  assert.equal(qaViewer.role, "VIEWER");
  const viewerLogin = expectStatus(
    "Read-only QA account can authenticate",
    await call("POST", "/api/auth/login", {
      username: "qa-readonly",
      password: qaViewerPassword
    }, { auth: false }),
    200
  );
  token = viewerLogin.token;
  const viewerIdentity = await get("/api/auth/me", "Read-only QA identity loads");
  assert.equal(viewerIdentity.user?.role, "VIEWER");
  expectStatus(
    "Read-only QA account cannot create time slots",
    await call("POST", "/api/timeslots/bulk", { slots: [] }),
    403
  );
  expectStatus(
    "Read-only QA account cannot access administrator health",
    await call("GET", "/api/system/health"),
    403
  );
  token = adminToken;
  pass("Read-only QA account is unable to perform protected writes");

  const program = await post("/api/programs", {
    name: "QA Integration Program",
    code: "QA-INTEG",
    department: "QA",
    durationYears: 2,
    active: true
  }, "Create temporary test program");

  const session = await post("/api/sessions", {
    name: "QA Integration Session 2026-27",
    description: "Disposable integration-test data; isolated MongoDB only.",
    programDates: [{
      program: program._id,
      startDate: "2026-10-01",
      endDate: "2027-09-30"
    }]
  }, "Create temporary academic session");

  const activatedSession = expectStatus(
    "Activate temporary academic session",
    await call("POST", `/api/sessions/${session._id}/activate`, {}),
    200
  );
  assert.equal(String(activatedSession._id), String(session._id));

  const rejectedUnconfiguredSection = await call("POST", "/api/academic-structure/sections", {
    programId: program._id,
    academicSession: session._id,
    semester: "Unconfigured Semester",
    name: "QA-BAD",
    maxClassesPerDay: 6,
    capacity: 60
  });
  expectStatus("Reject section mapping without a semester master", rejectedUnconfiguredSection, 400);
  assert.match(rejectedUnconfiguredSection.body?.message || "", /semester configured/i);

  const semester = await post("/api/semesters", {
    academicSession: session._id,
    program: program._id,
    name: "Semester I",
    order: 1,
    active: true
  }, "Create program/session semester master");
  assert.equal(String(semester.academicSession?._id || semester.academicSession), String(session._id));
  assert.equal(String(semester.program?._id || semester.program), String(program._id));

  const section = await post("/api/academic-structure/sections", {
    programId: program._id,
    academicSession: session._id,
    semester: "Semester I",
    name: "QA-A",
    maxClassesPerDay: 6,
    capacity: 60
  }, "Create program/session/semester/section mapping");

  const firstStudent = await post("/api/students", {
    admissionNo: "QA-STU-001",
    rollNo: "QA-ROLL-001",
    name: "QA Student One",
    section: section._id,
    academicSessionId: session._id
  }, "Create a student with a valid section mapping");
  assert.equal(String(firstStudent.section?._id || firstStudent.section), String(section._id));
  assert.equal(String(firstStudent.section?.academicSession?._id || firstStudent.section?.academicSession || ""), String(session._id));
  pass("Student section mapping is session-scoped");

  const caseDuplicateAdmission = await call("POST", "/api/students", {
    admissionNo: "qa-stu-001",
    rollNo: "QA-ROLL-CASE",
    name: "QA Duplicate Admission Case",
    section: section._id,
    academicSessionId: session._id
  });
  expectStatus("Reject admission numbers that differ only by letter case", caseDuplicateAdmission, 400);
  assert.match(caseDuplicateAdmission.body?.message || "", /Admission No must be unique regardless of letter case/i);

  const duplicateRoll = await call("POST", "/api/students", {
    admissionNo: "QA-STU-002",
    rollNo: "qa-roll-001",
    name: "QA Student Duplicate Roll",
    section: section._id,
    academicSessionId: session._id
  });
  expectStatus("Reject duplicate roll numbers within a section", duplicateRoll, 400);
  assert.match(duplicateRoll.body?.message || "", /Roll No .* already exists/i);

  const updatedStudent = await call("PUT", `/api/students/${firstStudent._id}`, {
    name: "QA Student One Updated",
    section: section._id,
    program: "Wrong Program",
    semester: "Wrong Semester",
    academicSessionId: session._id
  });
  expectStatus("Update student without overwriting section-derived academic mapping", updatedStudent, 200);
  assert.equal(String(updatedStudent.body?.program || ""), program.name);
  assert.equal(String(updatedStudent.body?.semester || ""), "Semester I");

  const sourceSection = await post("/api/academic-structure/sections", {
    programId: program._id,
    academicSession: session._id,
    semester: "Semester I",
    name: "QA-SOURCE",
    maxClassesPerDay: 6,
    capacity: 10
  }, "Create a second section for student movement tests");
  const sameRollSourceStudent = await post("/api/students", {
    admissionNo: "QA-MOVE-001",
    rollNo: "QA-ROLL-001",
    name: "QA Source Student",
    section: sourceSection._id,
    academicSessionId: session._id
  }, "Create student in source section with a target-conflicting roll number");

  const bulkMapDuplicateRoll = await call("POST", "/api/students/bulk-map", {
    studentIds: [sameRollSourceStudent._id],
    toSection: section._id,
    academicSessionId: session._id
  });
  expectStatus("Reject bulk mapping that duplicates a destination section roll number", bulkMapDuplicateRoll, 400);
  assert.match(bulkMapDuplicateRoll.body?.message || "", /Roll No .* already exists/i);

  const promotionDuplicateRoll = await call("POST", "/api/student-promotions/bulk", {
    studentIds: [sameRollSourceStudent._id],
    toSection: section._id,
    academicSessionId: session._id,
    sourceAcademicSessionId: session._id,
    action: "TRANSFERRED",
    remarks: "QA duplicate roll-number test"
  });
  expectStatus("Reject promotion that duplicates a destination section roll number", promotionDuplicateRoll, 400);
  assert.match(promotionDuplicateRoll.body?.message || "", /Roll No .* already exists/i);

  const capacitySection = await post("/api/academic-structure/sections", {
    programId: program._id,
    academicSession: session._id,
    semester: "Semester I",
    name: "QA-CAPACITY",
    maxClassesPerDay: 6,
    capacity: 1
  }, "Create one-seat section for capacity validation");
  await post("/api/students", {
    admissionNo: "QA-CAP-001",
    rollNo: "CAP-ROLL-001",
    name: "QA Capacity Student",
    section: capacitySection._id,
    academicSessionId: session._id
  }, "Create student within section capacity");
  const overCapacity = await call("POST", "/api/students", {
    admissionNo: "QA-CAP-002",
    rollNo: "CAP-ROLL-002",
    name: "QA Over Capacity Student",
    section: capacitySection._id,
    academicSessionId: session._id
  });
  expectStatus("Reject active student creation beyond section capacity", overCapacity, 400);
  assert.match(overCapacity.body?.message || "", /capacity/i);

  const facultyA = await post("/api/faculty", {
    name: "QA Faculty Alpha",
    code: "QA-FA",
    maxWorkingDays: 5,
    maxClassesPerDay: 4,
    availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    unavailableSlots: []
  }, "Create first faculty");

  const facultyB = await post("/api/faculty", {
    name: "QA Faculty Beta",
    code: "QA-FB",
    maxWorkingDays: 5,
    maxClassesPerDay: 4,
    availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    unavailableSlots: []
  }, "Create second faculty");

  const room = await post("/api/rooms", {
    name: "QA Integration Room",
    type: "Classroom",
    capacity: 60
  }, "Create timetable room");


  const slotBatchBase = {
    academicSession: session._id,
    program: program._id,
    semester: "Semester I",
    day: "Saturday",
    startTime: "09:00",
    endTime: "10:00",
    order: 1,
    isBreak: false
  };
  const beforeBatchRows = await get("/api/timeslots", "Read time slots before batch validation");
  const slotScopeCount = rows => rows.filter(row =>
    String(row.academicSession?._id || row.academicSession || "") === String(session._id) &&
    String(row.program?._id || row.program || "") === String(program._id) &&
    String(row.day) === "Saturday"
  ).length;
  const beforeBatchCount = slotScopeCount(beforeBatchRows);
  const rejectedBatch = await call("POST", "/api/timeslots/bulk", {
    slots: [
      slotBatchBase,
      { ...slotBatchBase, order: 2, startTime: "09:30", endTime: "10:30" }
    ]
  });
  expectStatus("Reject overlapping bulk time slots", rejectedBatch, 400);
  const afterRejectedBatchRows = await get("/api/timeslots", "Verify rejected batch changed no data");
  assert.equal(slotScopeCount(afterRejectedBatchRows), beforeBatchCount, "Rejected batch must not insert any time slots.");
  pass("Rejected time-slot batch leaves the database unchanged");

  const acceptedBatch = expectStatus(
    "Create valid bulk time-slot batch",
    await call("POST", "/api/timeslots/bulk", {
      slots: [
        slotBatchBase,
        { ...slotBatchBase, order: 2, startTime: "10:00", endTime: "11:00" }
      ]
    }),
    201
  );
  assert.equal(acceptedBatch.ok, true);
  assert.equal(acceptedBatch.created, 2);
  pass("Bulk time-slot endpoint creates all validated slots");

  const conflictingWithSaved = await call("POST", "/api/timeslots/bulk", {
    slots: [
      { ...slotBatchBase, startTime: "09:30", endTime: "10:30" }
    ]
  });
  expectStatus("Reject a bulk slot conflicting with an existing slot", conflictingWithSaved, 409);
  const afterSavedConflictRows = await get("/api/timeslots", "Verify saved conflict changes no data");
  assert.equal(
    slotScopeCount(afterSavedConflictRows),
    beforeBatchCount + 2,
    "A conflicting batch must leave the previously saved slots untouched and add no rows."
  );
  pass("Conflict against saved data leaves all records unchanged");

  // Scoped slots replace broader fallback schedules for this program/semester.
  // Remove the fixture immediately so it cannot affect the later generator checks.
  for (const slot of acceptedBatch.slots) {
    expectStatus(
      "Remove temporary batch time slot",
      await call("DELETE", `/api/timeslots/${slot._id}`, {}),
      200
    );
  }

  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const starts = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
  let slotCount = 0;
  for (const day of weekdays) {
    for (let i = 0; i < starts.length; i += 1) {
      const [hour, minute] = starts[i].split(":").map(Number);
      const endHour = hour + 1;
      const end = `${String(endHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      await post("/api/timeslots", {
        day,
        startTime: starts[i],
        endTime: end,
        order: i + 1,
        isBreak: false
      }, `Create ${day} time slot ${i + 1}`);
      slotCount += 1;
    }
  }
  assert.equal(slotCount, 30);
  pass("30 usable weekday time slots configured");

  const subjectA = await post("/api/subject-mappings", {
    academicSession: session._id,
    programId: program._id,
    section: section._id,
    faculty: facultyA._id,
    name: "QA Mathematics",
    code: "QA-MATH",
    subjectType: "CORE",
    classesPerWeek: 2,
    maxClassesPerWeek: 2,
    totalSessions: 0,
    duration: 1,
    roomType: "Classroom",
    active: true
  }, "Map first subject to section and faculty");

  const subjectB = await post("/api/subject-mappings", {
    academicSession: session._id,
    programId: program._id,
    section: section._id,
    faculty: facultyB._id,
    name: "QA Computing",
    code: "QA-COMP",
    subjectType: "CORE",
    classesPerWeek: 2,
    maxClassesPerWeek: 2,
    totalSessions: 0,
    duration: 1,
    roomType: "Classroom",
    active: true
  }, "Map second subject to section and faculty");

  const structure = await get(
    `/api/academic-structure?sessionId=${encodeURIComponent(session._id)}`,
    "Academic structure can read the new session"
  );
  assert.ok(Array.isArray(structure.programs));
  assert.ok(structure.sections.some(item => String(item._id) === String(section._id)));
  pass("Program and section linkage persisted");

  const readiness = await get(
    `/api/timetable/readiness?sessionId=${encodeURIComponent(session._id)}&programIds=${encodeURIComponent(program._id)}`,
    "Generation readiness check"
  );
  assert.notEqual(readiness.status, "NOT_READY", JSON.stringify(readiness.issues));
  assert.equal(readiness.summary?.errors, 0, JSON.stringify(readiness.issues));
  assert.equal(readiness.summary?.requiredSessions, 4);
  pass("Readiness reports 4 schedulable weekly sessions", readiness.status);

  const generated = expectStatus(
    "Generate timetable with program/session scope",
    await call("POST", "/api/timetable/generate", {
      academicSessionId: session._id,
      programIds: [program._id],
      generationRuns: 8,
      generationTimeLimitMs: 10000
    }),
    200
  );
  assert.ok(generated._id, "Generated timetable was not persisted.");
  assert.ok(Array.isArray(generated.entries));
  assert.equal(generated.entries.length, 4, `Expected 4 entries, got ${generated.entries.length}. ${JSON.stringify(generated.warnings || [])}`);
  assert.equal(generated.status, "DRAFT");
  pass("Exactly 4 required classes scheduled and saved", generated.entries.length.toString());

  const latest = await get(
    `/api/timetable/latest?sessionId=${encodeURIComponent(session._id)}`,
    "Current timetable loads"
  );
  assert.equal(String(latest._id), String(generated._id));
  assert.equal(latest.entries.length, 4);
  pass("Saved timetable can be re-read");

  const validation = await get(
    `/api/timetable/validation?sessionId=${encodeURIComponent(session._id)}`,
    "Validation Center loads generated timetable"
  );
  assert.equal(validation.hasTimetable, true);
  assert.equal(validation.summary?.errors, 0, JSON.stringify(validation.issues));
  assert.equal(validation.summary?.entries, 4);
  pass("Validation Center reports no hard errors");

  const analytics = await get(
    `/api/analytics?sessionId=${encodeURIComponent(session._id)}`,
    "Session analytics load"
  );
  assert.ok(analytics.summary && typeof analytics.summary === "object");
  pass("Analytics summary is returned");

  const submitted = expectStatus(
    "Submit draft timetable",
    await call("PATCH", "/api/timetable/status", { sessionId: session._id, status: "SUBMITTED" }),
    200
  );
  assert.equal(submitted.timetable?.status, "SUBMITTED");

  const approved = expectStatus(
    "Approve submitted timetable",
    await call("PATCH", "/api/timetable/status", {
      sessionId: session._id,
      status: "APPROVED",
      note: "Automated QA approval in disposable database."
    }),
    200
  );
  assert.equal(approved.timetable?.status, "APPROVED");

  const published = expectStatus(
    "Publish approved timetable",
    await call("PATCH", "/api/timetable/status", {
      sessionId: session._id,
      status: "PUBLISHED",
      note: "Automated QA publication in disposable database."
    }),
    200
  );
  assert.equal(published.timetable?.status, "PUBLISHED");
  pass("Workflow transitions DRAFT → SUBMITTED → APPROVED → PUBLISHED");

  const excel = await call(
    "GET",
    `/api/timetable/export/excel?sessionId=${encodeURIComponent(session._id)}`,
    undefined,
    { binary: true }
  );
  expectStatus("Export published timetable to Excel", excel, 200);
  assert.match(excel.contentType, /spreadsheetml\.sheet/i);
  assert.ok(excel.body.length > 100);
  assert.equal(excel.body.subarray(0, 2).toString("ascii"), "PK", "Excel file does not have a ZIP signature.");
  pass("Excel file response has a valid XLSX signature");

  const pdf = await call(
    "GET",
    `/api/timetable/export/pdf?sessionId=${encodeURIComponent(session._id)}`,
    undefined,
    { binary: true }
  );
  expectStatus("Export published timetable to PDF", pdf, 200);
  assert.match(pdf.contentType, /application\/pdf/i);
  assert.ok(pdf.body.subarray(0, 4).toString("ascii") === "%PDF");
  pass("PDF export has a valid PDF signature");

  const share = await post("/api/share-links", {
    timetableId: generated._id,
    scope: "FULL",
    expiresIn: "1d"
  }, "Create time-limited published timetable share link");
  assert.ok(share.token);
  const publicShare = expectStatus(
    "Public share link can render published timetable",
    await call("GET", `/api/public/share/${share.token}`, undefined, { auth: false }),
    200
  );
  assert.equal(publicShare.timetable?.status, "PUBLISHED");
  assert.equal(publicShare.entries?.length, 4);
  pass("Public share returns only the published timetable entries");

  const exportCurrent = await get(
    `/api/timetable/status?sessionId=${encodeURIComponent(session._id)}`,
    "Workflow status can be read after publication"
  );
  assert.equal(exportCurrent.status, "PUBLISHED");
  assert.equal(String(exportCurrent.timetableId), String(generated._id));
  pass("Published workflow state persists");

  console.log(`\nSUCCESS: ${passed} integration checks passed; 0 failures.`);
  console.log("All test data exists only in the disposable MongoDB service container and disappears when the job finishes.");
} catch (error) {
  console.error("\nINTEGRATION TEST FAILED:", error?.stack || error?.message || error);
  process.exitCode = 1;
}
