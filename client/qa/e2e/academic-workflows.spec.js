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
  let workflow = options.workflow || null;
  let versions = options.versions || [];
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
    if (path === "/reports/summary" && method === "GET") return json(options.report || {
      session: { _id: "session-1", name: "Academic Year 2026-27", active: true },
      timetable: { _id: "timetable-1", status: "DRAFT", version: 1, versionLabel: "Version 1" },
      summary: { requiredSessions: 4, scheduledSessions: 3, coverage: 75, unscheduledSessions: 1, periods: 4 },
      faculty: [
        {
          id: "faculty-1", name: "Ms. Faculty", classes: 3, periods: 4, workingDays: 2, utilization: 100,
          capacityConfigured: true, maxClassesPerDay: 2, maxWorkingDays: 2,
          capacityClasses: 4, capacityUtilization: 75, loadStatus: "WITHIN_CAPACITY",
          availablePeriods: 18, freePeriods: 14,
          dailyBreakdown: [
            { day: "Monday", classes: 2, periods: 3, availablePeriods: 4, freePeriods: 1, capacityClasses: 2, capacityUtilization: 100 },
            { day: "Tuesday", classes: 1, periods: 1, availablePeriods: 4, freePeriods: 3, capacityClasses: 2, capacityUtilization: 50 }
          ],
          subjectBreakdown: [{
            id: "subject-1", name: "Mathematics", code: "MATH101", section: "MBA · I · A",
            required: 2, scheduled: 1, unscheduled: 1
          }]
        },
        {
          id: "faculty-2", name: "Dr. Overloaded", classes: 6, periods: 8, workingDays: 4, utilization: 200,
          capacityConfigured: true, maxClassesPerDay: 1, maxWorkingDays: 4,
          capacityClasses: 4, capacityUtilization: 150, loadStatus: "OVER_CAPACITY",
          availablePeriods: 24, freePeriods: 16, dailyBreakdown: [], subjectBreakdown: []
        },
        {
          id: "faculty-3", name: "Dr. Limits Missing", classes: 0, periods: 0, workingDays: 0, utilization: 0,
          capacityConfigured: false, maxClassesPerDay: null, maxWorkingDays: null,
          capacityClasses: null, capacityUtilization: null, loadStatus: "LIMITS_NOT_CONFIGURED",
          availablePeriods: 24, freePeriods: 24, dailyBreakdown: [], subjectBreakdown: []
        },
        {
          id: "faculty-4", name: "Ms. No Periods", classes: 0, periods: 0, workingDays: 0, utilization: 0,
          capacityConfigured: true, maxClassesPerDay: 3, maxWorkingDays: 5,
          capacityClasses: 0, capacityUtilization: null, loadStatus: "NO_AVAILABLE_CAPACITY",
          availablePeriods: 0, freePeriods: 0, dailyBreakdown: [], subjectBreakdown: []
        }
      ],
      rooms: [{ id: "room-1", name: "Room 101", type: "Classroom", classes: 3, periods: 4, utilization: 100 }],
      sections: [{ id: "section-1", label: "MBA · I · A", classes: 3, periods: 4, required: 4, coverage: 75 }],
      daily: [
        { day: "Monday", classes: 2, periods: 3 }, { day: "Tuesday", classes: 1, periods: 1 },
        { day: "Wednesday", classes: 0, periods: 0 }, { day: "Thursday", classes: 0, periods: 0 },
        { day: "Friday", classes: 0, periods: 0 }, { day: "Saturday", classes: 0, periods: 0 },
        { day: "Sunday", classes: 0, periods: 0 }
      ],
      validation: { errors: 1, warnings: 0, issues: [{ severity: "error", category: "Unscheduled sessions", message: "1 required session remains unscheduled." }] },
      subjects: [
        { id: "subject-1", name: "Mathematics", code: "MATH101", faculty: "Ms. Faculty", facultyId: "faculty-1", section: "MBA · I · A", sectionId: "section-1", required: 2, scheduled: 1, unscheduled: 1 },
        { id: "subject-2", name: "Business Analytics", code: "BA102", faculty: "", facultyId: "", section: "MBA · I · A", sectionId: "section-1", required: 2, scheduled: 2, unscheduled: 0 }
      ]
    });
    if (path === "/timetable/readiness" && method === "GET") {
      if (options.readiness) return json(options.readiness);
      const configured = Boolean(options.includeSchedulingData);
      return json({
        session: activeSession ? { _id: activeSession._id, name: activeSession.name, active: true } : null,
        status: configured ? "READY" : "NOT_READY",
        summary: {
          sections: configured ? sections.length : 0,
          subjects: configured ? subjects.length : 0,
          faculty: configured ? faculty.length : 0,
          rooms: configured ? rooms.length : 0,
          usableSlots: configured ? timeslots.length : 0,
          workingDays: configured ? 1 : 0,
          requiredSessions: configured ? 1 : 0,
          invalidSubjects: 0,
          errors: configured ? 0 : 1,
          warnings: 0
        },
        issues: configured ? [] : [{
          severity: "ERROR",
          category: "Subject Mapping",
          message: "No active subject mappings are configured for this academic session."
        }]
      });
    }
    if (path === "/timetable/latest" && method === "GET") return json(timetable);
    if (path === "/timetable/status" && method === "GET") {
      return json({ status: timetableStatus, approvalHistory: timetable.approvalHistory || [] });
    }
    if (path === "/timetable/workflow" && method === "GET") {
      const actionsByStatus = {
        DRAFT: [{status:"SUBMITTED",roles:["ADMIN","SCHEDULER"],allowed:true}],
        SUBMITTED: [{status:"DRAFT",roles:["ADMIN","SCHEDULER"],requiresNote:true,allowed:true},{status:"APPROVED",roles:["ADMIN"],allowed:true}],
        APPROVED: [{status:"SUBMITTED",roles:["ADMIN"],requiresNote:true,allowed:true},{status:"PUBLISHED",roles:["ADMIN"],requiresNote:true,allowed:true}],
        PUBLISHED: [{status:"LOCKED",roles:["ADMIN"],allowed:true},{status:"DRAFT",roles:["ADMIN"],requiresNote:true,allowed:true}],
        LOCKED: [{status:"PUBLISHED",roles:["ADMIN"],requiresNote:true,allowed:true}]
      };
      return json({...workflow,status:timetableStatus,role:admin.role,timetableId:timetable?._id||null,version:timetable?.version||1,versionLabel:timetable?.versionLabel||"Version 1",actions:workflow?.actions||actionsByStatus[timetableStatus]||[],history:workflow?.history||timetable.approvalHistory||[]});
    }
    if (path === "/timetable/status" && method === "PATCH") {
      timetableStatus = body.status || timetableStatus;
      timetable = { ...timetable, status: timetableStatus };
      const historyEntry={from:workflow?.status||"DRAFT",to:timetableStatus,note:body.note||"",username:admin.username,role:admin.role,changedAt:"2026-10-13T09:00:00.000Z"};
      workflow={...(workflow||{}),status:timetableStatus,history:[...(workflow?.history||[]),historyEntry]};
      return json({ message: `Status changed to ${timetableStatus}.`, timetable: { status: timetableStatus } });
    }
    if (path === "/timetable/versions" && method === "GET") return json(versions);
    if (path === "/timetable/versions/compare" && method === "GET") return json(options.comparison || {
      sessionId:activeSession?._id||"session-1",
      from:{_id:"version-1",version:1,versionLabel:"Version 1",status:"PUBLISHED",totalEntries:3},
      to:{_id:"version-2",version:2,versionLabel:"Version 2",status:"DRAFT",totalEntries:4},
      summary:{added:1,removed:0,changed:1,unchanged:2},
      changes:[
        {type:"CHANGED",key:"section-1|subject-1",subject:"Mathematics",section:"MBA · I · A",before:{day:"Monday",startTime:"09:00",endTime:"10:00",faculty:"Ms. Faculty",room:"Room 101"},after:{day:"Tuesday",startTime:"10:00",endTime:"11:00",faculty:"Mr. Faculty",room:"Room 202"},fields:[{field:"Day",before:"Monday",after:"Tuesday"},{field:"Faculty",before:"Ms. Faculty",after:"Mr. Faculty"},{field:"Room",before:"Room 101",after:"Room 202"}]},
        {type:"ADDED",key:"section-1|subject-2",subject:"Business Analytics",section:"MBA · I · A",before:null,after:{day:"Wednesday",startTime:"11:00",endTime:"12:00",faculty:"Ms. Faculty",room:"Room 101"},fields:[]}
      ]
    });
    const restoreVersionMatch=path.match(/^\/timetable\/([^/]+)\/restore$/);
    if (restoreVersionMatch && method === "POST") {
      versions = versions.map(version => ({...version,isCurrent:false}));
      const restored={_id:"version-restored",version:Math.max(0,...versions.map(v=>Number(v.version||0)))+1,versionLabel:"Version 3 · Restored",status:"DRAFT",isCurrent:true,totalEntries:timetable.entries?.length||1,createdAt:"2026-10-13T09:00:00.000Z",notes:body.note};
      versions=[restored,...versions];
      timetable={...timetable,_id:restored._id,version:restored.version,versionLabel:restored.versionLabel,status:"DRAFT"};
      timetableStatus="DRAFT";
      workflow={...(workflow||{}),status:"DRAFT",timetableId:restored._id,version:restored.version,versionLabel:restored.versionLabel,history:[...(workflow?.history||[]),{from:"VERSION_RESTORE",to:"DRAFT",note:body.note,username:admin.username,role:admin.role,changedAt:restored.createdAt}]};
      return json(timetable,201);
    }
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

const moduleForPage = {
  "Academic Sessions":"Academic Setup",
  "Academic Structure":"Academic Setup",
  "Holiday Management":"Academic Setup",
  "Master Data Settings":"Academic Setup",
  "Subject & Faculty Mapping":"Academic Setup",
  "Program & Section Mapping":"Academic Setup",
  "Generation Readiness":"Timetable & Scheduling",
  "Availability":"Timetable & Scheduling",
  "Optimization":"Timetable & Scheduling",
  "Full Session Timetable":"Timetable & Scheduling",
  "All Program Timetables":"Timetable & Scheduling",
  "Timetable":"Timetable & Scheduling",
  "Approval & Versions":"Timetable & Scheduling",
  "Calendar View":"Timetable & Scheduling",
  "Students":"Students & Operations",
  "Student Mapping":"Students & Operations",
  "Student Profile":"Students & Operations",
  "Student Promotion":"Students & Operations",
  "Attendance":"Students & Operations",
  "Fees":"Students & Operations",
  "My Timetable":"Portals & Communication",
  "Faculty Portal":"Portals & Communication",
  "Section Portal":"Portals & Communication",
  "Notifications":"Portals & Communication",
  "Excel Import":"Tools & Sharing",
  "Import Center":"Tools & Sharing",
  "Templates & Clone":"Tools & Sharing",
  "Public Sharing":"Tools & Sharing",
  "Reports":"Reports & Audit",
  "Analytics":"Reports & Audit",
  "Validation":"Reports & Audit",
  "Audit Logs":"Reports & Audit",
  "Change History":"Reports & Audit",
  "User Management":"Administration",
  "Settings":"Administration"
};

async function navigateToPage(page, pageName) {
  const moduleName = moduleForPage[pageName];
  if (!moduleName) throw new Error("No navigation module configured for " + pageName);
  await page.locator(`.nav-module-button[data-nav-module="${moduleName}"]`).click();
  if (pageName !== "Dashboard") {
    await page.locator(".nav-flyout-panel").getByRole("button", { name: pageName, exact: true }).click();
  }
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
  await navigateToPage(page, "Academic Sessions");
  await expect(page.getByRole("heading", { name: "Create Academic Session", exact: true })).toBeVisible();
  await expect(page.getByText("Set the session year and overall dates, then configure program/semester calendar overrides.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create Academic Session", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/academic-sessions$/);
});

test("clears stale academic structure when backend records disappear while the tab is open", async ({ page }) => {
  const programs = [{ ...sampleProgram }];
  const sections = [{ ...sampleSection }];
  await signIn(page, { programs, sections });
  await navigateToPage(page, "Academic Structure");
  await expect(page.getByText("Program → Semester → Section", { exact: true })).toBeVisible();
  await expect(page.getByText("MBA", { exact: true }).first()).toBeVisible();

  // Simulate the records being cleared while the tab remains open.
  programs.splice(0, programs.length);
  sections.splice(0, sections.length);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByText("Create an active Program first.", { exact: true })).toBeVisible({ timeout: 8000 });
  await expect(page.getByText("MBA", { exact: true })).toHaveCount(0);
});

test("admin can create an academic session with program-wise dates", async ({ page }) => {
  await signIn(page);
  await navigateToPage(page, "Academic Sessions");
  await page.locator("#session-start-year").fill("2028");
  await page.locator(".field").filter({ hasText: "Description (optional)" }).locator("input").fill("Created by automated browser test");
  await page.locator("#session-start-date").fill("2028-04-01");
  await page.locator("#session-end-date").fill("2029-03-31");
  await page.getByRole("button", { name: "+ Add Academic Session" }).click();
  await expect(page.getByText("Academic session created with program-wise dates.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "2028-2029" })).toBeVisible();
});

test("admin can configure a holiday for an academic session", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await navigateToPage(page, "Holiday Management");
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
  await navigateToPage(page, "Holiday Management");
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
        body: format === "excel" ? Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x74, 0x65, 0x73, 0x74]) : Buffer.from("%PDF-1.4 test-pdf")
      });
    }

    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ message: "Unexpected session plan request: " + request.method() + " " + path })
    });
  });

  await navigateToPage(page, "Full Session Timetable");
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

test("admin can review capacity-based faculty workload, overload alerts and daily detail", async ({ page }) => {
  await signIn(page, { sessions: [makeActiveSession()] });
  await navigateToPage(page, "Reports");

  await expect(page.getByRole("heading", { name: "Academic Reports", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faculty Workload", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subject Session Coverage", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Room Load", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Section Workload", exact: true })).toBeVisible();
  await expect(page.getByText("Ms. Faculty", { exact: true }).first()).toBeVisible();

  const facultyPanel=page.locator(".report-panel").filter({has:page.getByRole("heading",{name:"Faculty Workload",exact:true})});
  await expect(facultyPanel.getByText("1", { exact: true }).first()).toBeVisible();
  await expect(facultyPanel.getByText("Over capacity", { exact: true }).first()).toBeVisible();
  await expect(facultyPanel.getByText("Limits not configured", { exact: true }).first()).toBeVisible();
  await expect(facultyPanel.getByText("No available capacity", { exact: true }).first()).toBeVisible();
  const noPeriodsRow=facultyPanel.locator("tr").filter({hasText:"Ms. No Periods"}).first();
  await expect(noPeriodsRow).toContainText("No available periods");
  await expect(noPeriodsRow).not.toContainText("Not configured");
  await expect(facultyPanel.getByRole("columnheader", {name:"Weekly Capacity"})).toBeVisible();
  await expect(facultyPanel.getByRole("columnheader", {name:"Capacity Used"})).toBeVisible();

  const msFacultyRow=facultyPanel.locator("tr").filter({hasText:"Ms. Faculty"}).first();
  await expect(msFacultyRow).toContainText("4 classes");
  await expect(msFacultyRow).toContainText("75% used");
  await msFacultyRow.getByRole("button", { name: /Details/ }).click();
  await expect(page.getByRole("heading", { name: "Workload summary", exact: true })).toBeVisible();
  await expect(page.getByText("14", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subject allocation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily teaching load", exact: true })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/free \/ .* available periods/).first()).toBeVisible();

  await page.getByLabel("Filter subject coverage").selectOption("UNASSIGNED");
  await expect(page.getByText("Business Analytics", { exact: true })).toBeVisible();
  await expect(page.getByText("Not assigned", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Filter subject coverage").selectOption("GAP");
  await expect(page.getByText("Mathematics", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Business Analytics", { exact: true })).toHaveCount(0);
});

test("admin can review approval status, compare timetable versions and require workflow remarks", async ({ page }) => {
  const activeSession=makeActiveSession();
  await signIn(page,{
    sessions:[activeSession],
    timetable:{_id:"version-2",version:2,versionLabel:"Version 2",status:"SUBMITTED",entries:[{}],warnings:[],approvalHistory:[]},
    workflow:{
      timetableId:"version-2",version:2,versionLabel:"Version 2",status:"SUBMITTED",
      actions:[
        {status:"DRAFT",roles:["ADMIN","SCHEDULER"],requiresNote:true,allowed:true},
        {status:"APPROVED",roles:["ADMIN"],allowed:true}
      ],
      history:[{_id:"approval-1",from:"DRAFT",to:"SUBMITTED",note:"Please review before approval.",username:"scheduler-one",role:"SCHEDULER",changedAt:"2026-10-13T09:00:00.000Z"}]
    },
    versions:[
      {_id:"version-2",version:2,versionLabel:"Version 2",status:"SUBMITTED",isCurrent:true,totalEntries:4,createdAt:"2026-10-13T09:00:00.000Z"},
      {_id:"version-1",version:1,versionLabel:"Version 1",status:"PUBLISHED",isCurrent:false,totalEntries:3,createdAt:"2026-10-12T09:00:00.000Z"}
    ]
  });

  await navigateToPage(page, "Approval & Versions");
  await expect(page.getByRole("heading",{name:"Timetable Approval & Versions",exact:true})).toBeVisible();
  await expect(page.locator(".approval-status-pill.submitted").first()).toContainText("Submitted for review");
  await expect(page.getByText("scheduler-one",{exact:false})).toBeVisible();
  await expect(page.getByText("Please review before approval.")).toBeVisible();

  await page.getByRole("button",{name:"Compare versions"}).click();
  await expect(page.getByText("2 changes · 2 unchanged")).toBeVisible();
  await expect(page.getByText("Mathematics",{exact:true})).toBeVisible();
  await expect(page.getByText("Business Analytics",{exact:true})).toBeVisible();
  await expect(page.getByText("Mr. Faculty",{exact:false}).first()).toBeVisible();
  await expect(page.getByText("Room 202",{exact:false}).first()).toBeVisible();

  await page.getByRole("button",{name:/Return to draft/}).click();
  await expect(page.getByRole("alert")).toContainText("Enter remarks of at least 3 characters");
  await page.getByLabel("Workflow remarks").fill("Return to scheduler for timetable corrections.");
  await page.getByRole("button",{name:/Return to draft/}).click();
  await expect(page.locator(".approval-status-pill.draft").first()).toContainText("Draft");
});

test("admin can safely restore an old timetable version as a new draft with a recorded reason", async ({ page }) => {
  const activeSession=makeActiveSession();
  await signIn(page,{
    sessions:[activeSession],
    timetable:{_id:"version-2",version:2,versionLabel:"Version 2",status:"DRAFT",entries:[{}],warnings:[],approvalHistory:[]},
    workflow:{timetableId:"version-2",version:2,versionLabel:"Version 2",status:"DRAFT",actions:[{status:"SUBMITTED",roles:["ADMIN","SCHEDULER"],allowed:true}],history:[]},
    versions:[
      {_id:"version-2",version:2,versionLabel:"Version 2",status:"DRAFT",isCurrent:true,totalEntries:4,createdAt:"2026-10-13T09:00:00.000Z"},
      {_id:"version-1",version:1,versionLabel:"Version 1",status:"PUBLISHED",isCurrent:false,totalEntries:3,createdAt:"2026-10-12T09:00:00.000Z"}
    ]
  });
  await navigateToPage(page, "Approval & Versions");
  await expect(page.getByRole("heading",{name:"Version History & Safe Restore",exact:true})).toBeVisible();

  const oldVersionRow=page.locator("tr").filter({hasText:"Version 1"}).first();
  await expect(oldVersionRow).toBeVisible();
  await page.getByLabel("Workflow remarks").fill("Restore earlier room allocation after faculty change.");
  page.once("dialog",dialog=>dialog.accept());
  await oldVersionRow.getByRole("button",{name:"Restore as Draft"}).click();
  await expect(page.getByText("Version 3 · Restored",{exact:true}).first()).toBeVisible();
  await expect(page.getByText(/A new Draft was created/)).toBeVisible();
  await expect(page.locator("tr").filter({hasText:"Version 1"}).getByRole("button",{name:"Restore as Draft"})).toBeVisible();
});

test("dashboard action center shows real readiness blockers and links to the fix", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });

  const actionCenter = page.locator(".dashboard-action-center");
  await expect(actionCenter.getByRole("heading", { name: "Action Center", exact: true })).toBeVisible();
  await expect(actionCenter.getByText("1 error", { exact: true })).toBeVisible();
  await expect(actionCenter.getByText("Generation blocked", { exact: true })).toBeVisible();
  await expect(actionCenter.getByText("No active subject mappings are configured for this academic session.")).toBeVisible();

  await actionCenter.getByRole("button", { name: "Review Subject Mapping" }).click();
  await expect(page).toHaveURL(/\/subject-and-faculty-mapping$/);
  await page.locator('.nav-module-button[data-nav-module="Academic Setup"]').click();
  await expect(page.locator('.nav-flyout-panel [data-nav="Subject & Faculty Mapping"]')).toHaveClass(/active/);
});

test("generation is stopped when pre-generation readiness reports blockers", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });

  let generationRequests = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/timetable/generate")) {
      generationRequests += 1;
    }
  });

  await page.getByRole("button", { name: /Generate Timetable/ }).first().click();
  await page.getByRole("button", { name: /Generate selected/ }).click();
  await expect(page.getByRole("heading", { name: "Generation Readiness", exact: true })).toBeVisible();
  await expect(page.getByText(/Generation blocked: 1 setup error/)).toBeVisible();
  await expect(page.getByText("No active subject mappings are configured for this academic session.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Fix issue/ })).toBeVisible();
  expect(generationRequests).toBe(0);

  await page.getByRole("button", { name: /Fix issue/ }).click();
  await expect(page).toHaveURL(/\/subject-and-faculty-mapping$/);
  expect(generationRequests).toBe(0);
});

test("generation proceeds when readiness is valid and keeps warning-only findings non-blocking", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, {
    sessions: [activeSession],
    includeSchedulingData: true,
    readiness: {
      session: { _id: activeSession._id, name: activeSession.name, active: true },
      status: "READY_WITH_WARNINGS",
      summary: { sections: 1, subjects: 1, faculty: 1, rooms: 1, usableSlots: 1, workingDays: 1, requiredSessions: 1, invalidSubjects: 0, errors: 0, warnings: 1 },
      issues: [{ severity: "WARNING", category: "Faculty Workload", message: "Faculty is close to the weekly capacity." }]
    }
  });

  await page.getByRole("button", { name: /Generate Timetable/ }).first().click();
  await page.getByRole("button", { name: /Generate selected/ }).click();
  await expect(page.getByRole("heading", { name: "Section-wise Timetable", exact: true })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true }).first()).toBeVisible();
});

test("admin can generate and submit a timetable for review", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession], includeSchedulingData: true });
  await page.getByRole("button", { name: /Generate Timetable/ }).first().click();
  await page.getByRole("button", { name: /Generate selected/ }).click();
  await expect(page.getByRole("heading", { name: "Section-wise Timetable", exact: true })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Submit for Review/ }).click();
  await expect(page.locator(".status-badge.submitted")).toBeVisible();
});


test("Generate Timetable program selector is centered, scrollable, and accessible", async ({page})=>{
  await signIn(page);
  const openButton=page.locator(".erp-sidebar .side-bottom button.primary").filter({hasText:"Generate Timetable"});
  await expect(openButton).toBeVisible();
  await openButton.click();

  const dialog=page.getByRole("dialog",{name:/Generate Timetable/});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".modal-program-option")).toHaveCount(1);
  await expect(dialog.getByRole("button",{name:"Select all"})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Clear selection"})).toBeVisible();
  await expect(dialog.getByRole("button",{name:/Generate selected \(1\)/})).toBeVisible();

  const geometry=await dialog.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    return {
      left:rect.left,
      right:rect.right,
      top:rect.top,
      bottom:rect.bottom,
      width:rect.width,
      height:rect.height,
      viewportWidth:window.innerWidth,
      viewportHeight:window.innerHeight,
      position:getComputedStyle(element).position,
      backdropPosition:getComputedStyle(element.parentElement).position,
      backdropZIndex:Number(getComputedStyle(element.parentElement).zIndex)
    };
  });
  expect(geometry.position).toBe("relative");
  expect(geometry.backdropPosition).toBe("fixed");
  expect(geometry.backdropZIndex).toBeGreaterThanOrEqual(1000);
  expect(Math.abs((geometry.left+geometry.width/2)-geometry.viewportWidth/2)).toBeLessThan(35);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.height).toBeLessThanOrEqual(geometry.viewportHeight);

  await dialog.getByRole("button",{name:"Close dialog"}).click();
  await expect(dialog).toHaveCount(0);

  // Reopen at desktop size before switching to the compact viewport; the
  // desktop sidebar is intentionally hidden on mobile.
  await openButton.click();
  const mobileDialog=page.getByRole("dialog",{name:/Generate Timetable/});
  await expect(mobileDialog).toBeVisible();
  await page.setViewportSize({width:390,height:700});
  await expect(mobileDialog).toBeVisible();
  const mobile=await mobileDialog.boundingBox();
  expect(mobile).not.toBeNull();
  expect(mobile.x).toBeGreaterThanOrEqual(0);
  expect(mobile.x+mobile.width).toBeLessThanOrEqual(390);
  expect(mobile.height).toBeLessThanOrEqual(700);
  await page.keyboard.press("Escape");
  await expect(mobileDialog).toHaveCount(0);
});
