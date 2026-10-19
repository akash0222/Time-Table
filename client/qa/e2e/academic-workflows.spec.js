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
  const semesters = [...(options.semesters || [])];
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
    if (path === "/auth/users" && method === "GET") return json(options.users || [{ _id:"user-viewer-1", name:"Demo Viewer", username:"demo.viewer", role:"VIEWER", active:true, section:sampleSection, faculty:null }]);
    if (path === "/programs" && method === "GET") return json(programs);
    if (path === "/faculty" && method === "GET") return json(faculty);
    if (path === "/sections" && method === "GET") return json(sections);
    if (path === "/subjects" && method === "GET") return json(subjects);
    if (path === "/rooms" && method === "GET") return json(rooms);
    if (path === "/timeslots" && method === "GET") return json(timeslots);
    if (path === "/students" && method === "GET") return json(students);
    if (path === "/sessions" && method === "GET") return json(sessions);
    if (path === "/sessions/active" && method === "GET") return json(options.emptyActiveSessionEndpoint ? null : activeSession);
    if (path === "/semesters" && method === "GET") return json(semesters);
    if (path === "/semesters" && method === "POST") {
      const session = sessions.find(row => String(row._id) === String(body.academicSession));
      const program = programs.find(row => String(row._id) === String(body.program));
      const created = { _id:`semester-created-${semesters.length+1}`, ...body, academicSession:session?{_id:session._id,name:session.name}:body.academicSession, program:program?{_id:program._id,name:program.name,code:program.code}:body.program, active:body.active!==false };
      semesters.push(created);
      return json(created,201);
    }
    const semesterRecordMatch = path.match(/^\/semesters\/([^/]+)$/);
    if (semesterRecordMatch && method === "PUT") {
      const index = semesters.findIndex(row => String(row._id) === semesterRecordMatch[1]);
      if(index<0)return json({message:"Semester not found."},404);
      const current=semesters[index];
      const program=programs.find(row=>String(row._id)===String(body.program||current.program?._id||current.program));
      semesters[index]={...current,...body,program:program?{_id:program._id,name:program.name,code:program.code}:body.program,active:body.active===undefined?current.active:body.active};
      return json(semesters[index]);
    }
    if (semesterRecordMatch && method === "DELETE") {
      const index=semesters.findIndex(row=>String(row._id)===semesterRecordMatch[1]);
      if(index<0)return json({message:"Semester not found."},404);
      semesters.splice(index,1);
      return json({ok:true});
    }
    if (path === "/subject-mappings" && method === "GET") {
      const requestedSession = url.searchParams.get("sessionId");
      const delay = Number(options.subjectMappingDelayBySession?.[requestedSession] || 0);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      return json((options.subjectMappings || []).filter(row => !requestedSession || String(row.academicSession?._id || row.academicSession || "") === requestedSession));
    }
    if (path === "/subject-mappings/summary" && method === "GET") {
      const requestedSession = url.searchParams.get("sessionId");
      return json(requestedSession && sessions.some(row => String(row._id) === requestedSession && !row.active)
        ? {sections:[],totalSubjects:0,totalWeeklyLoad:0,unmappedSections:0}
        : (options.subjectMappingSummary || {sections:[],totalSubjects:0,totalWeeklyLoad:0,unmappedSections:0}));
    }
    if (path === "/subject-mappings" && method === "GET") return json(options.subjectMappings || []);
    if (path === "/subject-mappings/summary" && method === "GET") return json(options.subjectMappingSummary || {sections:[],totalSubjects:0,totalWeeklyLoad:0,unmappedSections:0});
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
          { rowNumber: 2, sourceDate: "2026-08-15", date: "2026-08-15", holidayName: "Independence Day Observed", description: "School holiday", holidayType: "Optional", status: "valid", reason: "" },
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
      return json({ programs, sections, semesters });
    }
    if (path === "/academic-structure/sections" && method === "POST") {
      const program = programs.find(row => String(row._id) === String(body.programId));
      const created = {
        _id: `section-created-${sections.length+1}`,
        ...body,
        program: program?.name || body.program || "",
        programId: program || body.programId,
        academicSession: body.academicSession,
        studentCount: 0
      };
      sections.push(created);
      return json(created, 201);
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
  if (pageName === "Dashboard") return;
  const directLink = page.locator(`.nav-flyout-panel [data-nav="${pageName}"]`);
  if (await directLink.count()) {
    await directLink.click();
    return;
  }
  const subgroupForPage = {
    "Academic Structure": "Program & Section Structure",
    "Program & Section Mapping": "Program & Section Structure",
    "Master Data Settings": "Master Data & Mapping",
    "Subject & Faculty Mapping": "Master Data & Mapping",
    "Generation Readiness": "Generation & Optimization",
    "Availability": "Generation & Optimization",
    "Optimization": "Generation & Optimization",
    "Full Session Timetable": "Timetable Views",
    "All Program Timetables": "Timetable Views",
    "Timetable": "Timetable Views",
    "Calendar View": "Timetable Views",
    "Students": "Student Management",
    "Student Mapping": "Student Management",
    "Student Profile": "Student Management",
    "Student Promotion": "Student Management",
    "Attendance": "Attendance & Fees",
    "Fees": "Attendance & Fees",
    "Excel Import": "Import & Data Transfer",
    "Import Center": "Import & Data Transfer",
    "Templates & Clone": "Templates & Sharing",
    "Public Sharing": "Templates & Sharing",
    "Validation": "Validation & Audit History",
    "Audit Logs": "Validation & Audit History",
    "Change History": "Validation & Audit History"
  };
  const subgroup = subgroupForPage[pageName];
  if (!subgroup) throw new Error("No nested navigation entry configured for " + pageName);
  await page.locator(`.nav-flyout-panel [data-nav-submenu="${subgroup}"]`).click();
  await page.locator(`.nav-subflyout-panel [data-nav="${pageName}"]`).click();
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
  await expect(page.getByText("Create a new session using the next available year, then configure program/semester calendar dates.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Create Academic Session", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/academic-sessions$/);
});

test("semester master data removes blank success field and enforces session/program/semester mapping", async ({ page }) => {
  const activeSession = makeActiveSession({
    name: "2026-2027",
    programDates: [{ program: sampleProgram._id, startDate: "2026-04-01", endDate: "2027-03-31" }]
  });
  const existingSemester = {
    _id: "semester-master-1",
    academicSession: activeSession._id,
    program: sampleProgram._id,
    name: "Semester I",
    order: 1,
    active: true
  };
  const unlinkedProgram = { _id: "program-unlinked", name: "Unlinked Program", code: "UP", active: true };
  await signIn(page, {
    sessions: [activeSession],
    programs: [sampleProgram, unlinkedProgram],
    sections: [sampleSection],
    semesters: [existingSemester]
  });
  await navigateToPage(page, "Master Data Settings");
  await page.locator(".master-menu-item").filter({ hasText: "Semesters" }).click();

  const form = page.locator(".master-settings-content .form-grid");
  await expect(page.getByRole("heading", { name: "Semesters", exact: true })).toBeVisible();
  await expect(form.locator(".message.success.wide")).toHaveCount(0);
  await expect(form.getByText("Add semester", { exact: true })).toBeVisible();

  const sessionSelect = form.getByLabel("Academic Session", { exact: true });
  const programSelect = form.getByLabel("Program", { exact: true });
  await sessionSelect.selectOption(activeSession._id);
  await expect(programSelect.locator('option[value="program-1"]')).toHaveCount(1);
  await expect(programSelect.locator('option[value="program-unlinked"]')).toHaveCount(0);
  await programSelect.selectOption(sampleProgram._id);

  await form.getByLabel("Semester Name", { exact: true }).fill("semester i");
  await form.getByRole("button", { name: "+ Add Semesters", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Semester I already exists");
  await expect(page.locator(".master-card").filter({ hasText: "Semester I" })).toHaveCount(1);

  await form.getByLabel("Semester Name", { exact: true }).fill("Semester II");
  await form.getByLabel("Display Order", { exact: true }).fill("2");
  await form.getByRole("button", { name: "+ Add Semesters", exact: true }).click();
  const newCard = page.locator(".master-card").filter({ hasText: "Semester II" });
  await expect(newCard).toBeVisible();
  await expect(newCard.locator(".semester-card-context").getByText("MBA", { exact: true })).toBeVisible();
  await expect(newCard.getByText("2026-2027", { exact: true })).toBeVisible();
  await expect(newCard.getByText("2", { exact: true })).toBeVisible();
  await expect(newCard.getByText("Active", { exact: true })).toBeVisible();
  await expect(newCard.getByText("Linked sections", { exact: true })).toBeVisible();
});

test("Academic Structure only offers session-scoped semester master records", async ({ page }) => {
  const activeSession = makeActiveSession();
  const semesters = [{
    _id: "semester-master-1",
    academicSession: activeSession._id,
    program: sampleProgram._id,
    name: "Semester I",
    order: 1,
    active: true
  }];
  await signIn(page, { sessions: [activeSession], programs: [sampleProgram], sections: [], semesters });
  await navigateToPage(page, "Academic Structure");

  const form = page.locator(".panel").first();
  const sessionSelect = form.getByLabel("Academic Session", { exact: true });
  const programSelect = form.getByLabel("Program", { exact: true });
  const semesterSelect = form.getByLabel("Semester", { exact: true });

  await expect(sessionSelect).toHaveValue(activeSession._id);
  await expect(semesterSelect).toBeDisabled();
  await programSelect.selectOption(sampleProgram._id);
  await expect(semesterSelect).toBeEnabled();
  await expect(semesterSelect.locator('option[value="Semester I"]')).toHaveText("Semester I");
  await expect(semesterSelect.locator('option[value="Other Semester"]')).toHaveCount(0);

  await semesterSelect.selectOption("Semester I");
  await form.getByLabel("Section Name", { exact: true }).fill("A");
  await form.getByRole("button", { name: "Add Section", exact: true }).click();

  await expect(page.getByText("Section mapped successfully.", { exact: true })).toBeVisible();
  await expect(page.getByText("Program → Semester → Section", { exact: true })).toBeVisible();
  await expect(page.getByText("Semester I", { exact: false }).first()).toBeVisible();
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

test("dashboard falls back to active session from session list if active endpoint returns empty", async ({ page }) => {
  const activeSession = makeActiveSession({ name: "Demo Academic Session 2026-2027", active: true });
  await signIn(page, { sessions: [activeSession], emptyActiveSessionEndpoint: true });

  await expect(page.locator(".topbar-session-copy strong")).toHaveText("Demo Academic Session 2026-2027");
  await expect(page.locator(".topbar-session-status")).toHaveAttribute("aria-label", "Active session");
  await expect(page.getByText("No active academic session")).toHaveCount(0);
});

test("clears User Management editing banner after navigating to another module", async ({ page }) => {
  await signIn(page);
  await navigateToPage(page, "User Management");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Editing mappings for demo.viewer. Save changes when finished." })).toBeVisible();
  await navigateToPage(page, "Academic Sessions");
  await expect(page.getByRole("heading", { name: "Create Academic Session", exact: true })).toBeVisible();
  await expect(page.getByText("Editing mappings for demo.viewer. Save changes when finished.", { exact: true })).toHaveCount(0);
});

test("admin can create an academic session with program-wise dates", async ({ page }) => {
  const existingSession = makeActiveSession({name:"2026-2027",startDate:"2026-04-01",endDate:"2027-03-31"});
  await signIn(page, { sessions:[existingSession] });
  await navigateToPage(page, "Academic Sessions");
  await expect(page.locator("#session-start-year")).toHaveValue("2027");
  await expect(page.locator("#session-generated-name")).toHaveValue("2027-2028");
  await expect(page.getByRole("button", { name: "+ Add Semester Calendar" })).toBeDisabled();
  await page.locator("#session-start-year").fill("2028");
  await page.locator(".field").filter({ hasText: "Description (optional)" }).locator("input").fill("Created by automated browser test");
  await page.locator("#session-start-date").fill("2028-04-01");
  await page.locator("#session-end-date").fill("2029-03-31");
  await page.getByRole("button", { name: "+ Add Academic Session" }).click();
  await expect(page.getByText("Academic session created with program-wise dates.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "2028-2029" })).toBeVisible();
});

test("student mapping resets selection and scopes semester filters when the academic session changes", async ({ page }) => {
  const firstSession = makeActiveSession();
  const secondSession = {
    _id: "session-2",
    name: "Academic Year 2027-28",
    startDate: "2027-04-01",
    endDate: "2028-03-31",
    holidayDates: [],
    holidayDetails: [],
    active: false
  };
  const pgdm = { _id: "program-2", name: "PGDM", code: "PGDM", active: true };
  const sections = [
    { _id: "section-1", name: "A", program: "MBA", programId: "program-1", semester: "I", academicSession: "session-1" },
    { _id: "section-1b", name: "B", program: "MBA", programId: null, semester: "I", academicSession: "session-1" },
    { _id: "section-1d", name: "B", program: "PGDM", programId: "program-2", semester: "I", academicSession: "session-1" },
    { _id: "section-2", name: "A", program: "PGDM", programId: "program-2", semester: "II", academicSession: "session-2" }
  ];
  const students = [
    { _id: "student-1", name: "Alpha Student", admissionNo: "ADM-001", rollNo: "1", active: true, section: { _id: "section-1", name: "A", program: "MBA", semester: "I", academicSession: "session-1" } },
    { _id: "student-1c", name: "Gamma Student", admissionNo: "ADM-003", rollNo: "3", active: true, section: { _id: "section-1", name: "A", program: "MBA", semester: "I", academicSession: "session-1" } },
    { _id: "student-1d", name: "Delta Student", admissionNo: "ADM-004", rollNo: "4", active: true, section: { _id: "section-1d", name: "B", program: "PGDM", semester: "I", academicSession: "session-1" } },
    { _id: "student-2", name: "Beta Student", admissionNo: "ADM-002", rollNo: "2", active: true, section: { _id: "section-2", name: "A", program: "PGDM", semester: "II", academicSession: "session-2" } }
  ];

  await signIn(page, {
    sessions: [firstSession, secondSession],
    programs: [sampleProgram, pgdm],
    sections,
    students
  });
  await navigateToPage(page, "Student Mapping");

  const sessionSelect = page.getByLabel("Academic Session");
  const programSelect = page.getByLabel("Current Program");
  const semesterSelect = page.getByLabel("Current Semester");
  const sectionSelect = page.getByLabel("Current Section");
  const destinationSelect = page.getByLabel("Destination Section");

  await sessionSelect.selectOption("session-1");
  await expect(semesterSelect.locator('option[value="II"]')).toHaveCount(0);
  await programSelect.selectOption("program-1");
  await expect(sectionSelect.locator("option").filter({ hasText: "MBA · I · B" })).toHaveCount(1);
  await expect(page.getByText("Alpha Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Gamma Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Delta Student", { exact: true })).toHaveCount(0);
  await semesterSelect.selectOption("I");
  await sectionSelect.selectOption("section-1");
  await expect(page.getByText("Alpha Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Gamma Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Beta Student", { exact: true })).toHaveCount(0);
  await destinationSelect.selectOption("section-1b");
  const searchStudent = page.getByLabel("Search Student");
  await searchStudent.fill("Alpha");
  const alphaRow = page.locator("tr").filter({ hasText: "Alpha Student" });
  await alphaRow.locator('input[type="checkbox"]').check();
  await searchStudent.fill("Gamma");
  await expect(page.getByRole("button", { name: "Select Visible" })).toBeVisible();
  await page.getByRole("button", { name: "Select Visible" }).click();
  await expect(page.getByText("2 selected", { exact: false })).toBeVisible();

  await sessionSelect.selectOption("session-2");
  await expect(programSelect).toHaveValue("");
  await expect(semesterSelect).toHaveValue("");
  await expect(sectionSelect).toHaveValue("");
  await expect(destinationSelect).toHaveValue("");
  await expect(semesterSelect.locator('option[value="I"]')).toHaveCount(0);
  await expect(semesterSelect.locator('option[value="II"]')).toHaveCount(1);
  await expect(page.getByText("Beta Student", { exact: true })).toBeVisible();
  await expect(page.getByText("Alpha Student", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gamma Student", { exact: true })).toHaveCount(0);
  await expect(page.getByText("0 selected", { exact: false })).toBeVisible();
});

test("inactive programs show their real status and stay inactive in the edit form", async ({ page }) => {
  const inactiveProgram = {
    _id: "program-inactive",
    name: "Archived Program",
    code: "ARCH",
    department: "Legacy",
    durationYears: 3,
    active: false
  };
  await signIn(page, { programs: [sampleProgram, inactiveProgram] });
  await navigateToPage(page, "Master Data Settings");

  const archivedCard = page.locator(".master-card").filter({ hasText: "Archived Program" });
  await expect(archivedCard.locator(".master-status")).toHaveText("Inactive");
  await archivedCard.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".master-active-field input")).not.toBeChecked();
});

test("subject mapping ignores an older response after switching sessions quickly", async ({ page }) => {
  const firstSession = makeActiveSession();
  const secondSession = {
    _id: "session-2",
    name: "Academic Year 2027-28",
    startDate: "2027-04-01",
    endDate: "2028-03-31",
    programDates: [{ program: "program-2", startDate: "2027-04-01", endDate: "2028-03-31" }],
    holidayDates: [],
    holidayDetails: [],
    active: false
  };
  const secondProgram = { _id: "program-2", name: "PGDM", code: "PGDM", active: true };
  const secondSection = { _id: "section-2", name: "B", program: "PGDM", programId: "program-2", semester: "I", academicSession: "session-2" };
  const baseMapping = {
    faculty: { _id: "faculty-1", name: "Ms. Faculty" },
    subjectType: "CORE",
    classesPerWeek: 3,
    totalSessions: 0,
    maxClassesPerWeek: 3,
    duration: 1,
    roomType: "Classroom",
    active: true
  };
  await signIn(page, {
    sessions: [firstSession, secondSession],
    programs: [sampleProgram, secondProgram],
    faculty: [sampleFaculty],
    sections: [sampleSection, secondSection],
    subjectMappings: [
      { ...baseMapping, _id: "mapping-slow", name: "Old Session Subject", code: "OLD101", academicSession: "session-1", section: { _id: "section-1", name: "A", program: "MBA", semester: "I" } },
      { ...baseMapping, _id: "mapping-fast", name: "Current Session Subject", code: "NEW101", academicSession: "session-2", section: { _id: "section-2", name: "B", program: "PGDM", semester: "I" } }
    ],
    subjectMappingDelayBySession: { "session-1": 1800 },
    subjectMappingSummary: { sections: [], totalSubjects: 1, totalWeeklyLoad: 3, unmappedSections: 0 }
  });
  await navigateToPage(page, "Subject & Faculty Mapping");
  await page.getByLabel("Academic Session").selectOption("session-2");
  await expect(page.getByText("Current Session Subject", { exact: true })).toBeVisible();
  await expect(page.getByText("Old Session Subject", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(2100);
  await expect(page.getByText("Current Session Subject", { exact: true })).toBeVisible();
  await expect(page.getByText("Old Session Subject", { exact: true })).toHaveCount(0);
});

test("subject mapping clears an old edit when changing academic sessions", async ({ page }) => {
  const firstSession = makeActiveSession();
  const secondSession = {
    _id: "session-2",
    name: "Academic Year 2027-28",
    startDate: "2027-04-01",
    endDate: "2028-03-31",
    programDates: [{ program: "program-2", startDate: "2027-04-01", endDate: "2028-03-31" }],
    holidayDates: [],
    holidayDetails: [],
    active: false
  };
  const secondProgram = { _id: "program-2", name: "PGDM", code: "PGDM", active: true };
  const firstSection = { ...sampleSection };
  const secondSection = { _id: "section-2", name: "B", program: "PGDM", programId: "program-2", semester: "I", academicSession: "session-2" };
  const mapping = {
    _id: "mapping-1",
    name: "Mathematics",
    code: "MATH101",
    faculty: { _id: "faculty-1", name: "Ms. Faculty" },
    section: { _id: "section-1", name: "A", program: "MBA", semester: "I" },
    academicSession: "session-1",
    subjectType: "CORE",
    classesPerWeek: 3,
    totalSessions: 0,
    maxClassesPerWeek: 3,
    duration: 1,
    roomType: "Classroom",
    active: true
  };
  await signIn(page, {
    sessions: [firstSession, secondSession],
    programs: [sampleProgram, secondProgram],
    faculty: [sampleFaculty],
    sections: [firstSection, secondSection],
    subjectMappings: [mapping],
    subjectMappingSummary: { sections: [], totalSubjects: 1, totalWeeklyLoad: 3, unmappedSections: 0 }
  });
  await navigateToPage(page, "Subject & Faculty Mapping");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit Subject Mapping" })).toBeVisible();
  await expect(page.getByLabel("Subject Name")).toHaveValue("Mathematics");
  await page.getByLabel("Academic Session").selectOption("session-2");
  await expect(page.getByRole("heading", { name: "Add Subject Mapping" })).toBeVisible();
  await expect(page.getByLabel("Subject Name")).toHaveValue("");
  await expect(page.locator(".mapping-form-grid").getByLabel("Section")).toHaveValue("");
  await expect(page.locator(".mapping-form-grid").getByLabel("Faculty", { exact: true })).toHaveValue("");
});

test("admin can configure a holiday for an academic session", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await navigateToPage(page, "Holiday Management");
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Configured Holiday Dates")).toBeVisible();
  await page.getByRole("button", { name: "Add Holiday" }).click();
  await page.locator("#holiday-name").fill("Independence Day");
  await page.locator("#holiday-date").fill("2026-08-15");
  await page.getByLabel("Occurs Every Year").check();
  await page.getByRole("button", { name: "Save Holiday" }).click();
  await expect(page.getByRole("columnheader", { name: "Title" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Holiday Type" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "From" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "To" })).toBeVisible();
  const holidayRow = page.locator(".holiday-list-table tbody tr").filter({ hasText: "Independence Day" });
  await expect(holidayRow).toHaveCount(1);
  await expect(holidayRow.locator("td").nth(2)).toHaveText("August 15, 2026");
  await expect(holidayRow.locator("td").nth(3)).toHaveText("August 15, 2026");
  await expect(page.locator(".holiday-count-pill")).toHaveText("1 date");
  await expect(holidayRow.getByText(/Repeats every year/)).toBeVisible();
  await page.reload();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Independence Day", { exact: true })).toBeVisible();
  await expect(page.locator(".holiday-list-table tbody tr").filter({ hasText: "Independence Day" }).getByText(/Repeats every year/)).toBeVisible();

  await page.getByRole("button", { name: "Actions for holiday 2026-08-15" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.locator("#holiday-name").fill("Independence Day 2026");
  await expect(page.getByLabel("Occurs Every Year")).toBeChecked();
  await page.locator("#holiday-description").fill("Campus closed for the national holiday.");
  await page.getByLabel("Holiday Type").selectOption("Optional");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Independence Day 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Campus closed for the national holiday.", { exact: true })).toBeVisible();
  await expect(page.getByText("Optional", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await expect(page.getByText("Independence Day 2026", { exact: true })).toBeVisible();
  await expect(page.getByText("Campus closed for the national holiday.", { exact: true })).toBeVisible();
  await expect(page.getByText("Optional", { exact: true })).toBeVisible();
});


test("holiday management adds and displays a multi-day holiday range", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await navigateToPage(page, "Holiday Management");

  await page.getByRole("button", { name: "Add Holiday" }).click();
  await page.locator("#holiday-name").fill("Holi Holidays");
  await page.locator("#holiday-date").fill("2026-08-13");
  await page.locator("#holiday-to-date").fill("2026-08-17");
  await page.getByRole("button", { name: "Save Holiday" }).click();

  const row = page.locator(".holiday-list-table tbody tr").filter({ hasText: "Holi Holidays" });
  await expect(row).toHaveCount(1);
  await expect(row.locator("td").nth(2)).toHaveText("August 13, 2026");
  await expect(row.locator("td").nth(3)).toHaveText("August 17, 2026");
  await expect(row.getByText("Mandatory", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Actions for holiday 2026-08-13" }).click();
  await row.getByRole("menuitem", { name: "Edit" }).click();
  await page.locator("#holiday-name").fill("Holi Break");
  await page.locator("#holiday-date").fill("2026-08-14");
  await page.locator("#holiday-to-date").fill("2026-08-18");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.locator(".holiday-list-table tbody tr")).toHaveCount(1);
  const renamedRow = page.locator(".holiday-list-table tbody tr").filter({ hasText: "Holi Break" });
  await expect(renamedRow).toHaveCount(1);
  await expect(renamedRow.locator("td").nth(2)).toHaveText("August 14, 2026");
  await expect(renamedRow.locator("td").nth(3)).toHaveText("August 18, 2026");
});

test("admin can preview and import a holiday list from a CSV file", async ({ page }) => {
  const activeSession = makeActiveSession();
  await signIn(page, { sessions: [activeSession] });
  await navigateToPage(page, "Holiday Management");
  await expect(page.locator("h2", { hasText: "Holiday Management" })).toBeVisible();
  await page.getByRole("button", { name: "Import Holidays" }).click();

  await page.locator("#holiday-upload-file").setInputFiles({
    name: "holidays.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Holiday Name,Description,Holiday Type\n2026-08-15,Independence Day Observed,School holiday,Optional\n2026-08-16,Sunday Entry,Should be skipped,Mandatory")
  });
  await page.getByRole("button", { name: "Preview Holiday List" }).click();

  await expect(page.getByText("Ready to import")).toBeVisible();
  await expect(page.getByText("Invalid Row", { exact: true })).toBeVisible();
  await expect(page.getByText("Sunday is already an automatic holiday.")).toBeVisible();
  await expect(page.locator(".holiday-preview-table tbody tr").filter({ hasText: "Independence Day Observed" }).getByText("Optional", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 2 Valid Dates" })).toBeEnabled();

  await page.getByRole("button", { name: "Import 2 Valid Dates" }).click();
  const importedHoliday = page.locator(".holiday-list-table tbody tr").filter({ hasText: "Independence Day Observed" });
  await expect(importedHoliday).toHaveCount(1);
  await expect(importedHoliday.getByText("Optional", { exact: true })).toBeVisible();
  await expect(importedHoliday.locator("td").nth(2)).toHaveText("August 15, 2026");
  const christmasRow = page.locator(".holiday-list-table tbody tr").filter({ hasText: "Christmas" });
  await expect(christmasRow).toHaveCount(1);
  await expect(christmasRow.locator("td").nth(2)).toHaveText("December 25, 2026");
  await expect(page.getByText("Christmas", { exact: true })).toBeVisible();
  await expect(page.getByText("Independence Day Observed", { exact: true })).toBeVisible();
  await expect(page.getByText("2 holiday date(s) imported into Academic Year 2026-27. Duplicates and Sunday dates were skipped.")).toBeVisible();
});


test("full-session timetable resets filters and ad hoc holidays when changing sessions", async ({ page }) => {
  const firstSession = makeActiveSession();
  const secondSession = {
    _id: "session-2",
    name: "Academic Year 2027-28",
    startDate: "2027-04-01",
    endDate: "2028-03-31",
    holidayDates: [],
    holidayDetails: [],
    active: false
  };
  const createPlan = (id, sessionId, year, sectionId, sectionName, facultyId, facultyName) => ({
    _id: id,
    academicSession: sessionId,
    version: 1,
    status: "DRAFT",
    totalEntries: 1,
    weeks: [{
      weekNumber: 1,
      startDate: `${year}-04-01`,
      endDate: `${year}-04-07`,
      workingDates: [`${year}-04-01`],
      calendarDates: [{ date: `${year}-04-01`, day: "Thursday", status: "WORKING" }],
      entries: [{
        date: `${year}-04-01`,
        day: "Thursday",
        startTime: "09:00",
        endTime: "10:00",
        order: 1,
        duration: 1,
        subject: { _id: `subject-${sectionId}`, code: "SUB101", name: "Mathematics" },
        faculty: { _id: facultyId, name: facultyName },
        section: { _id: sectionId, name: sectionName, program: "MBA", semester: "I" },
        room: { _id: `room-${sectionId}`, name: "Room 101" }
      }]
    }]
  });
  const plans = {
    "session-plan-1": createPlan("session-plan-1", "session-1", 2026, "section-1", "Section A", "faculty-1", "Faculty One"),
    "session-plan-2": createPlan("session-plan-2", "session-2", 2027, "section-2", "Section B", "faculty-2", "Faculty Two")
  };

  await signIn(page, { sessions: [firstSession, secondSession] });
  await page.route("**/api/session-plans**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    if (request.method() === "GET" && path === "/session-plans") {
      const sessionId = url.searchParams.get("sessionId");
      const id = sessionId === "session-2" ? "session-plan-2" : "session-plan-1";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ _id: id, version: 1, status: "DRAFT", weeks: [{ weekNumber: 1 }] }]) });
    }
    const detail = path.match(/^\/session-plans\/(session-plan-[12])$/);
    if (request.method() === "GET" && detail) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plans[detail[1]]) });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "Unexpected session plan request: " + request.method() + " " + path }) });
  });

  await navigateToPage(page, "Full Session Timetable");
  await page.getByRole("button", { name: "Version 1 · DRAFT · 1 weeks" }).click();
  await page.getByLabel("Section").selectOption("section-1");
  await page.getByLabel("Faculty").selectOption("faculty-1");
  const holidayDatesInput = page.locator("textarea").first();
  await holidayDatesInput.fill("2026-08-15");
  await page.getByLabel("Academic Session").selectOption("session-2");
  await expect(holidayDatesInput).toHaveValue("");
  await page.getByRole("button", { name: "Version 1 · DRAFT · 1 weeks" }).click();
  await expect(page.getByLabel("Section")).toHaveValue("");
  await expect(page.getByLabel("Faculty")).toHaveValue("");
  await expect(page.getByText("Section B · Room 101", { exact: false })).toBeVisible();
});

test("admin can generate a full-session timetable and open the saved version", async ({ page }) => {
  const activeSession = makeActiveSession();
  const plan = {
    _id: "session-plan-created",
    academicSession: activeSession._id,
    version: 1,
    status: "DRAFT",
    totalEntries: 1,
    holidays: [],
    weeks: [{
      weekNumber: 1,
      startDate: "2026-06-15",
      endDate: "2026-06-21",
      workingDates: ["2026-06-15"],
      calendarDates: [{ date: "2026-06-15", day: "Monday", status: "WORKING" }],
      entries: [{
        date: "2026-06-15",
        day: "Monday",
        startTime: "09:00",
        endTime: "10:00",
        order: 1,
        duration: 1,
        subject: { _id: "subject-1", name: "Mathematics", code: "MATH101" },
        faculty: { _id: "faculty-1", name: "Ms. Faculty" },
        section: { _id: "section-1", name: "A", program: "MBA", semester: "I" },
        room: { _id: "room-1", name: "Room 101" }
      }]
    }]
  };
  let saved = false;
  await signIn(page, { sessions: [activeSession], includeSchedulingData: true });
  await page.route("**/api/session-plans**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const json = (payload, status = 200) => route.fulfill({
      status, contentType: "application/json", body: JSON.stringify(payload)
    });
    if (request.method() === "GET" && path === "/session-plans") {
      return json(saved ? [{ _id: plan._id, version: 1, status: "DRAFT", weeks: [{ weekNumber: 1 }] }] : []);
    }
    if (request.method() === "POST" && path === "/session-plans/generate") {
      const body = request.postDataJSON();
      expect(body.sessionId).toBe(activeSession._id);
      expect(Array.isArray(body.holidays)).toBe(true);
      saved = true;
      return json({ id: plan._id, version: 1, weeks: 1, totalEntries: 1 }, 201);
    }
    if (request.method() === "GET" && path === "/session-plans/" + plan._id) return json(plan);
    return json({ message: "Unexpected session plan request: " + request.method() + " " + path }, 404);
  });

  page.on("dialog", dialog => dialog.accept());
  await navigateToPage(page, "Full Session Timetable");
  await page.getByRole("button", { name: "Generate Full Session" }).click();
  await expect(page.getByRole("button", { name: "Version 1 · DRAFT · 1 weeks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version 1 · DRAFT · 1 academic weeks · 1 classes" })).toBeVisible();
  await expect(page.getByText("Mathematics", { exact: true })).toBeVisible();
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
  await page.locator('.nav-flyout-panel [data-nav-submenu="Master Data & Mapping"]').click();
  await expect(page.locator('.nav-subflyout-panel [data-nav="Subject & Faculty Mapping"]')).toHaveClass(/active/);
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

  await page.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dismiss message", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Fix issue/ })).toBeVisible();

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


test("student roster filters include inactive records and remain scoped by academic session", async ({ page }) => {
  const activeSession = makeActiveSession();
  const previousSession = { ...makeActiveSession(), _id: "session-previous", name: "Academic Year 2025-26", active: false };
  const oldProgram = { _id: "program-old", name: "BBA (COM)", code: "BBA-COM", active: true };
  const currentStudentSection = { ...sampleSection, academicSession: activeSession._id };
  const previousStudentSection = {
    _id: "section-old", name: "Old A", program: oldProgram.name, programId: oldProgram._id,
    semester: "I", academicSession: previousSession._id, maxClassesPerDay: 5, capacity: 40
  };
  const students = [
    { _id: "student-active", admissionNo: "ADM-001", rollNo: "001", name: "Current Active", active: true, section: currentStudentSection },
    { _id: "student-inactive", admissionNo: "ADM-002", rollNo: "002", name: "Current Inactive", active: false, section: currentStudentSection },
    { _id: "student-old", admissionNo: "ADM-003", rollNo: "003", name: "Previous Session", active: true, section: previousStudentSection }
  ];
  await signIn(page, {
    sessions: [activeSession, previousSession],
    programs: [sampleProgram, oldProgram],
    sections: [currentStudentSection, previousStudentSection],
    students
  });
  await navigateToPage(page, "Students");

  const roster = page.locator(".panel").last();
  await expect(roster.getByText("Current Active", { exact: true })).toBeVisible();
  await expect(roster.getByText("Current Inactive", { exact: true })).toHaveCount(0);
  await expect(roster.getByText("Previous Session", { exact: true })).toHaveCount(0);

  await roster.getByLabel("Student status").selectOption("ALL");
  await expect(roster.getByText("Current Inactive", { exact: true })).toBeVisible();
  await expect(roster.getByText("Current Active", { exact: true })).toBeVisible();
  await expect(roster.getByText("Previous Session", { exact: true })).toHaveCount(0);

  await roster.getByLabel("Student list academic session").selectOption("");
  await expect(roster.getByText("Previous Session", { exact: true })).toBeVisible();
  await roster.getByLabel("Student status").selectOption("INACTIVE");
  await expect(roster.getByText("Current Inactive", { exact: true })).toBeVisible();
  await expect(roster.getByText("Current Active", { exact: true })).toHaveCount(0);
});

test("section-wise timetable uses only the selected program's effective time slots", async ({ page }) => {
  const activeSession = makeActiveSession({
    programDates: [
      { program: "program-1", semester: "I", startDate: "2026-04-01", endDate: "2026-11-30" },
      { program: "program-2", semester: "I", startDate: "2026-04-01", endDate: "2026-11-30" }
    ]
  });
  const previousSessionSection = {
    _id: "section-old", name: "Old A", program: sampleProgram.name, programId: sampleProgram._id,
    semester: "I", academicSession: "session-previous", maxClassesPerDay: 5, capacity: 40
  };
  const secondProgram = { _id: "program-2", name: "BBA (COM)", code: "BBA-COM", active: true };
  const secondSection = {
    _id: "section-2", name: "B", program: secondProgram.name, programId: secondProgram._id,
    semester: "I", academicSession: activeSession._id, maxClassesPerDay: 5, capacity: 40
  };
  const scopedSlots = [
    { ...sampleSlot, _id: "slot-mba-1", academicSession: activeSession._id, program: sampleProgram._id,
      semester: "I", startTime: "09:00", endTime: "09:50", order: 1 },
    { ...sampleSlot, _id: "slot-bba-1", academicSession: activeSession._id, program: secondProgram._id,
      semester: "I", startTime: "09:30", endTime: "10:20", order: 1 }
  ];
  const timetable = {
    ...makeTimetable(),
    entries: makeTimetable().entries.map(entry => ({ ...entry, startTime: "09:00", endTime: "09:50" }))
  };
  await signIn(page, {
    sessions: [activeSession],
    programs: [sampleProgram, secondProgram],
    sections: [previousSessionSection, sampleSection, secondSection],
    timeslots: scopedSlots,
    timetable
  });
  await navigateToPage(page, "Timetable");
  await expect(page.getByRole("heading", { name: "Timetable Versions", exact: true })).toHaveCount(0);

  const grid = page.locator(".tt-grid");
  await expect(grid.getByText("09:00-09:50", { exact: true })).toBeVisible();
  await expect(grid.getByText("09:30-10:20", { exact: true })).toHaveCount(0);
  await expect(grid.locator(".tt-entry")).toHaveCount(1);
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
