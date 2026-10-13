import { test, expect } from "@playwright/test";

const admin = {
  id: "user-admin",
  name: "E2E Administrator",
  username: "admin",
  role: "ADMIN",
  faculty: null,
  section: null
};

const sampleProgram = {
  _id: "program-1",
  name: "MBA",
  code: "MBA",
  active: true
};

const sampleFaculty = {
  _id: "faculty-1",
  name: "Ms. Faculty",
  code: "FAC001",
  active: true,
  maxWorkingDays: 5,
  maxClassesPerDay: 5,
  availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  unavailableSlots: []
};

const sampleSection = {
  _id: "section-1",
  name: "A",
  program: "MBA",
  programId: "program-1",
  semester: "I",
  academicSession: "session-1",
  maxClassesPerDay: 5,
  capacity: 40
};

const sampleSubject = {
  _id: "subject-1",
  name: "Mathematics",
  code: "MATH101",
  faculty: "faculty-1",
  section: "section-1",
  program: "MBA",
  academicSession: "session-1",
  totalSessions: 1,
  classesPerWeek: 1
};

const sampleRoom = {
  _id: "room-1",
  name: "Room 101",
  type: "Classroom",
  capacity: 50
};

const sampleSlot = {
  _id: "slot-1",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  order: 1,
  isBreak: false
};

function makeActiveSession(overrides = {}) {
  return {
    _id: "session-1",
    name: "Academic Year 2026-27",
    description: "E2E test session",
    startDate: "2026-04-01",
    endDate: "2027-03-31",
    programDates: [{
      program: "program-1",
      startDate: "2026-04-01",
      endDate: "2027-03-31"
    }],
    holidayDates: [],
    holidayDetails: [],
    active: true,
    ...overrides
  };
}

function makeTimetable() {
  return {
    _id: "timetable-1",
    status: "DRAFT",
    warnings: [],
    approvalHistory: [],
    entries: [{
      _id: "entry-1",
      day: "Monday",
      startTime: "09:00",
      endTime: "10:00",
      order: 1,
      duration: 1,
      subject: { _id: sampleSubject._id, name: sampleSubject.name, code: sampleSubject.code },
      faculty: { _id: sampleFaculty._id, name: sampleFaculty.name, code: sampleFaculty.code },
      section: { _id: sampleSection._id, name: sampleSection.name, program: sampleSection.program, semester: sampleSection.semester },
      room: { _id: sampleRoom._id, name: sampleRoom.name }
    }]
  };
}

async function installApiMocks(page, options = {}) {
  let sessions = [...(options.sessions || [])];
  let activeSession = sessions.find(session => session.active) || null;
  let timetable = options.timetable || { _id: "timetable-empty", status: "DRAFT", entries: [], warnings: [], approvalHistory: [] };
  let timetableStatus = timetable.status || "DRAFT";
  const programs = options.programs || [sampleProgram];
  const faculty = options.faculty || (options.includeSchedulingData ? [sampleFaculty] : []);
  const sections = options.sections || (options.includeSchedulingData ? [sampleSection] : []);
  const subjects = options.subjects || (options.includeSchedulingData ? [sampleSubject] : []);
  const rooms = options.rooms || (options.includeSchedulingData ? [sampleRoom] : []);
  const timeslots = options.timeslots || (options.includeSchedulingData ? [sampleSlot] : []);
  const students = options.students || [];

  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    let body = {};
    try { body = request.postDataJSON?.() || {}; } catch { body = {}; }

    const json = (payload, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });

    if (path === "/auth/login" && method === "POST") {
      if (String(body.username || "").trim().toLowerCase() !== "admin" || body.password !== "correct-test-password") {
        return json({ message: "Invalid username or password." }, 401);
      }
      return json({ token: "playwright-test-token", user: admin });
    }

    if (path === "/auth/me" && method === "GET") return json({ user: admin });
    if (path === "/programs" && method === "GET") return json(programs);
    if (path === "/faculty" && method === "GET") return json(faculty);
    if (path === "/sections" && method === "GET") return json(sections);
    if (path === "/subjects" && method === "GET") return json(subjects);
    if (path === "/rooms" && method === "GET") return json(rooms);
    if (path === "/timeslots" && method === "GET") return json(timeslots);
    if (path === "/students" && method === "GET") return json(students);
    if (path === "/sessions" && method === "GET") return json(sessions);
    if (path === "/sessions/active" && method === "GET") return json(activeSession);
    if (path === "/sessions" && method === "POST") {
      const created = {
        _id: "session-created",
        name: String(body.name || "New Academic Session"),
        description: String(body.description || ""),
        startDate: body.startDate,
        endDate: body.endDate,
        programDates: body.programDates || [],
        holidayDates: [],
        active: false
      };
      sessions = [...sessions, created];
      return json(created, 201);
    }

    const activateMatch = path.match(/^\/sessions\/([^/]+)\/activate$/);
    if (activateMatch && method === "POST") {
      sessions = sessions.map(session => ({ ...session, active: session._id === activateMatch[1] }));
      activeSession = sessions.find(session => session._id === activateMatch[1]) || null;
      return json(activeSession);
    }


    const holidayPreviewMatch = path.match(/^\/sessions\/([^/]+)\/holidays\/preview-import$/);
    if (holidayPreviewMatch && method === "POST") {
      return json({
        fileName: "holidays.csv",
        sessionName: sessions.find(session => session._id === holidayPreviewMatch[1])?.name || "Academic Year 2026-27",
        summary: { total: 4, valid: 2, skipped: 1, invalid: 1 },
        rows: [
          { rowNumber: 2, sourceDate: "2026-08-15", date: "2026-08-15", holidayName: "Independence Day Observed", description: "School holiday", status: "valid", reason: "" },
          { rowNumber: 3, sourceDate: "2026-08-16", date: "2026-08-16", holidayName: "Sunday Entry", status: "skipped", reason: "Sunday is already an automatic holiday." },
          { rowNumber: 4, sourceDate: "2026-12-25", date: "2026-12-25", holidayName: "Christmas", description: "School closed", status: "valid", reason: "" },
          { rowNumber: 5, sourceDate: "not-a-date", date: "", holidayName: "Invalid Row", status: "invalid", reason: "Invalid or missing date." }
        ]
      });
    }

    const holidayPatchMatch = path.match(/^\/sessions\/([^/]+)\/holidays$/);
    if (holidayPatchMatch && method === "PATCH") {
      sessions = sessions.map(session => session._id === holidayPatchMatch[1]
        ? {
            ...session,
            holidayDates: [...(body.holidayDates || [])],
            holidayDetails: [...(body.holidayDetails || session.holidayDetails || [])]
          }
        : session);
      activeSession = sessions.find(session => session.active) || activeSession;
      return json(sessions.find(session => session._id === holidayPatchMatch[1]) || {});
    }

    const sessionDetailMatch = path.match(/^\/academic-sessions\/([^/]+)$/);
    if (sessionDetailMatch && method === "GET") {
      return json(sessions.find(session => session._id === sessionDetailMatch[1]) || activeSession || {});
    }

    if (path === "/academic-structure" && method === "GET") {
      return json({ programs, sections, semesters: [] });
    }
    if (path === "/settings" && method === "GET") {
      return json({
        key: "default",
        maxConsecutiveFaculty: 2,
        maxConsecutiveSection: 3,
        avoidSameSubjectSameDay: true,
        distributeSubjectAcrossDays: true,
        avoidFirstLastPeriod: false,
        holidayDays: ["Sunday"],
        generationRuns: 1,
        generationTimeLimitMs: 1000
      });
    }
    if (path === "/timetable/latest" && method === "GET") return json(timetable);
    if (path === "/timetable/status" && method === "GET") {
      return json({ status: timetableStatus, approvalHistory: timetable.approvalHistory || [] });
    }
    if (path === "/timetable/status" && method === "PATCH") {
      timetableStatus = body.status || timetableStatus;
      timetable = { ...timetable, status: timetableStatus };
      return json({ message: `Status changed to ${timetableStatus}.`, timetable: { status: timetableStatus } });
    }
    if (path === "/timetable/versions" && method === "GET") return json([]);
    if (path === "/timetable/generate" && method === "POST") {
      timetable = makeTimetable();
      timetableStatus = "DRAFT";
      return json(timetable);
    }

    if (method === "GET" && path.startsWith("/")) return json([]);
    return json({ message: "Unhandled E2E mock endpoint: " + method + " " + path }, 500);
  });
}

async function signIn(page, options = {}) {
  await installApiMocks(page, options);
  await page.goto("/");
  await page.locator(".login-form input").nth(0).fill("admin");
  await page.locator(".login-form input").nth(1).fill("correct-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("invalid login shows a useful error and does not authenticate", async ({ page }) => {
  await installApiMocks(page);
  await page.goto("/");
  await page.locator(".login-form input").nth(0).fill("admin");
  await page.locator(".login-form input").nth(1).fill("wrong-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0);
});

test("admin can open and refresh a direct module URL", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-nav="Academic Sessions"]').click();
  await expect(page.getByRole("heading", { name: "Academic Sessions", exact: true })).toBeVisible();
  await expect(page.getByText("Program-wise academic calendar")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Academic Sessions", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/academic-sessions$/);
});

test("admin can create an academic session with program-wise dates", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-nav="Academic Sessions"]').click();
  await page.locator(".field").filter({ hasText: "Academic Session Name" }).locator("input").fill("E2E Academic 2026-27");
  await page.locator(".field").filter({ hasText: "Description" }).locator("input").fill("Created by automated browser test");
  await page.locator('input[type="date"]').nth(0).fill("2026-04-01");
  await page.locator('input[type="date"]').nth(1).fill("2027-03-31");
  await page.getByRole("button", { name: "+ Add Academic Session" }).click();
  await expect(page.getByText("Academic session created with program-wise dates.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Academic 2026-27" })).toBeVisible();
});

test("admin can configure a holiday for an academic session", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await page.locator('[data-nav="Holiday Management"]').click();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Configured Holiday Dates")).toBeVisible();
  await page.locator("#holiday-name").fill("Independence Day");
  await page.locator("#holiday-date").fill("2026-08-15");
  await page.getByRole("button", { name: "Add Holiday" }).click();
  await expect(page.getByText("2026-08-15")).toBeVisible();
  await expect(page.getByText("Independence Day", { exact: true })).toBeVisible();
  await expect(page.getByText("Configured Holidays").locator("..").getByText("1")).toBeVisible();
  await page.reload();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Independence Day", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit holiday 2026-08-15" }).click();
  await page.getByRole("textbox", { name: "Holiday name for 2026-08-15" }).fill("Independence Day 2026");
  await page.getByRole("textbox", { name: "Description for 2026-08-15" }).fill("Campus closed for the national holiday.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Independence Day 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Campus closed for the national holiday.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Independence Day 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Campus closed for the national holiday.", { exact: true })).toBeVisible();
});


test("admin can preview and import a holiday list from a CSV file", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await page.locator('[data-nav="Holiday Management"]').click();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();

  await page.locator("#holiday-upload-file").setInputFiles({
    name: "holidays.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Holiday Name,Description\n2026-08-15,Independence Day Observed,School holiday\n2026-08-16,Sunday Entry,Should be skipped")
  });
  await page.getByRole("button", { name: "Preview Holiday List" }).click();

  await expect(page.getByText("Ready to import")).toBeVisible();
  await expect(page.getByText("Invalid Row", { exact: true })).toBeVisible();
  await expect(page.getByText("Sunday is already an automatic holiday.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 2 Valid Dates" })).toBeEnabled();

  await page.getByRole("button", { name: "Import 2 Valid Dates" }).click();
  await expect(page.getByText("2026-08-15")).toBeVisible();
  await expect(page.getByText("2026-12-25")).toBeVisible();
  await expect(page.getByText("Christmas", { exact: true })).toBeVisible();
  await expect(page.getByText("Independence Day Observed", { exact: true })).toBeVisible();
  await expect(page.getByText("2 holiday date(s) imported into Academic Year 2026-27. Duplicates and Sunday dates were skipped.")).toBeVisible();
});


test("admin can download saved full-session timetable as Excel and PDF", async ({ page }) => {
  const activeSession = makeActiveSession();
  const plan = {
    _id: "session-plan-1",
    version: 1,
    status: "DRAFT",
    weeks: [{ weekNumber: 1 }],
    totalEntries: 1
  };
  const exportCalls = [];

  await signIn(page, { sessions: [activeSession] });
  await page.route("**/api/session-plans**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");

    if (request.method() === "GET" && path === "/session-plans") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([plan])
      });
    }

    const exportMatch = path.match(/^\/session-plans\/session-plan-1\/export\/(excel|pdf)$/);
    if (request.method() === "GET" && exportMatch) {
      const format = exportMatch[1];
      exportCalls.push({ format, query: url.searchParams.toString() });
      return route.fulfill({
        status: 200,
        headers: {
          "content-disposition": `attachment; filename="full-session-timetable-test-v1.${format === "excel" ? "xlsx" : "pdf"}"`,
          "access-control-expose-headers": "content-disposition"
        },
        contentType: format === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
        body: format === "excel" ? Buffer.from("PK\\u0003\\u0004test-xlsx") : Buffer.from("%PDF-1.4 test-pdf")
      });
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unexpected session plan request: " + request.method() + " " + path })
    });
  });

  await page.locator('[data-nav="Full Session Timetable"]').click();
  await expect(page.getByRole("heading", { name: "Full Academic Session Timetable", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Version 1 · DRAFT · 1 weeks/ })).toBeVisible();

  const excelDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const excelDownload = await excelDownloadPromise;
  expect(excelDownload.suggestedFilename()).toBe("full-session-timetable-test-v1.xlsx");

  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe("full-session-timetable-test-v1.pdf");

  expect(exportCalls.map(call => call.format)).toEqual(["excel", "pdf"]);
});

test("admin can generate and submit a timetable for review", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession], includeSchedulingData: true });
  await page.getByRole("button", { name: /Generate Timetable/ }).first().click();
  await expect(page.getByRole("heading", { name: "Section-wise Timetable", exact: true })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Submit for Review/ }).click();
  await expect(page.locator(".status-badge.submitted")).toBeVisible();
});
