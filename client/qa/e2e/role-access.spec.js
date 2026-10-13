import { test, expect } from "@playwright/test";

const password = "correct-test-password";

const program = { _id: "program-1", name: "MBA", code: "MBA", active: true };
const facultyRecord = {
  _id: "faculty-1",
  name: "Assigned Faculty",
  code: "FAC001",
  active: true,
  availableDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  unavailableSlots: [],
  maxWorkingDays: 5,
  maxClassesPerDay: 4
};
const assignedSection = {
  _id: "section-1",
  name: "Section A",
  program: "MBA",
  programId: "program-1",
  semester: "I",
  academicSession: "session-1",
  maxClassesPerDay: 5
};
const otherSection = {
  _id: "section-secret",
  name: "Confidential Section Z",
  program: "MBA",
  programId: "program-1",
  semester: "II",
  academicSession: "session-1",
  maxClassesPerDay: 5
};
const assignedEntry = {
  id: "entry-1",
  _id: "entry-1",
  day: "Monday",
  startTime: "09:00",
  endTime: "10:00",
  duration: 1,
  subject: "Assigned Mathematics",
  subjectCode: "MATH101",
  faculty: "Assigned Faculty",
  section: "Section A",
  room: "Room 101"
};
const session = {
  _id: "session-1",
  name: "Academic Year 2026-27",
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  programDates: [{ program: "program-1", startDate: "2026-04-01", endDate: "2027-03-31" }],
  holidayDates: [],
  active: true
};

function userForRole(role) {
  const base = {
    id: "user-" + role.toLowerCase(),
    name: role + " Test User",
    username: role.toLowerCase(),
    role,
    faculty: null,
    section: null
  };
  if (role === "FACULTY") return { ...base, faculty: facultyRecord };
  if (role === "VIEWER") return { ...base, section: assignedSection };
  return base;
}

function sectionReport(section = assignedSection, rows = [assignedEntry]) {
  return {
    section: { ...section, _id: section._id },
    session: { name: session.name },
    timetable: { status: "PUBLISHED", versionLabel: "Version 1" },
    summary: { scheduledClasses: rows.length, weeklyPeriods: rows.length, workingDays: rows.length ? 1 : 0 },
    timetableRows: rows,
    notifications: [],
    daily: [{ day: "Monday", classes: rows.length, periods: rows.length, max: 5 }]
  };
}

async function installRoleApiMocks(page, role) {
  const user = userForRole(role);
  let timetableStatus = "DRAFT";
  const timetable = {
    _id: "timetable-1",
    status: timetableStatus,
    warnings: [],
    approvalHistory: [],
    entries: [{
      _id: assignedEntry._id,
      day: assignedEntry.day,
      startTime: assignedEntry.startTime,
      endTime: assignedEntry.endTime,
      order: 1,
      duration: 1,
      subject: { _id: "subject-1", name: assignedEntry.subject, code: assignedEntry.subjectCode },
      faculty: { _id: facultyRecord._id, name: facultyRecord.name, code: facultyRecord.code },
      section: { _id: assignedSection._id, name: assignedSection.name, program: assignedSection.program, semester: assignedSection.semester },
      room: { _id: "room-1", name: assignedEntry.room }
    }]
  };

  await page.route("**/api/**", async route => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    const body = request.postDataJSON?.() || {};
    const json = (payload, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(payload)
    });

    if (path === "/auth/login" && method === "POST") {
      if (String(body.username || "").trim().toLowerCase() !== user.username || body.password !== password) {
        return json({ message: "Invalid username or password." }, 401);
      }
      return json({ token: "role-test-token-" + role, user });
    }
    if (path === "/auth/me" && method === "GET") return json({ user });
    if (path === "/programs" && method === "GET") return json([program]);
    if (path === "/faculty" && method === "GET") return json([facultyRecord]);
    if (path === "/sections" && method === "GET") return json([assignedSection]);
    if (path === "/subjects" && method === "GET") return json([]);
    if (path === "/rooms" && method === "GET") return json([]);
    if (path === "/timeslots" && method === "GET") return json([]);
    if (path === "/students" && method === "GET") return json([]);
    if (path === "/sessions" && method === "GET") return json([session]);
    if (path === "/sessions/active" && method === "GET") return json(session);
    if (path === "/settings" && method === "GET") return json({
      key: "default",
      maxConsecutiveFaculty: 2,
      maxConsecutiveSection: 3,
      holidayDays: ["Sunday"],
      generationRuns: 1,
      generationTimeLimitMs: 1000
    });
    if (path === "/timetable/latest" && method === "GET") return json(timetable);
    if (path === "/timetable/status" && method === "GET") return json({ status: timetableStatus, approvalHistory: [] });
    if (path === "/timetable/status" && method === "PATCH") {
      timetableStatus = body.status || timetableStatus;
      timetable.status = timetableStatus;
      return json({ message: "Status changed to " + timetableStatus + ".", timetable: { status: timetableStatus } });
    }
    if (path === "/timetable/versions" && method === "GET") return json([]);
    if (path === "/academic-structure" && method === "GET") return json({ programs: [program], sections: [assignedSection] });

    if (path === "/faculty-portal" && method === "GET") {
      if (role !== "FACULTY") return json({ message: "Faculty portal only." }, 403);
      return json({
        faculty: facultyRecord,
        session,
        timetable: { status: "PUBLISHED", academicSession: session, version: 1 },
        summary: { scheduledClasses: 1, weeklyPeriods: 1, utilization: 5 },
        timetableRows: [{
          ...assignedEntry,
          section: { _id: assignedSection._id, name: assignedSection.name, program: assignedSection.program, semester: assignedSection.semester },
          room: { _id: "room-1", name: assignedEntry.room },
          subject: { _id: "subject-1", name: assignedEntry.subject, code: assignedEntry.subjectCode }
        }],
        entries: [],
        availability: { availableDays: facultyRecord.availableDays, unavailableSlots: [] },
        daily: [{ day: "Monday", classes: 1, periods: 1, max: 4 }],
        notifications: []
      });
    }

    if (path === "/section-portal/sections" && method === "GET") {
      if (role !== "VIEWER" && role !== "FACULTY") return json({ message: "Section portal only." }, 403);
      const section = role === "VIEWER" ? assignedSection : assignedSection;
      return json([{ id: section._id, name: section.name, program: section.program, semester: section.semester }]);
    }
    if (path === "/section-portal" && method === "GET") {
      if (role !== "VIEWER" && role !== "FACULTY") return json({ message: "Section portal only." }, 403);
      const requested = url.searchParams.get("sectionId") || "";
      const allowedSectionId = String(user.section?._id || assignedSection._id);
      if (role === "VIEWER" && requested !== allowedSectionId) {
        return json({ message: "You are only allowed to view your assigned Section." }, 403);
      }
      if (requested === otherSection._id) {
        return json({ message: "You are only allowed to view your assigned Section." }, 403);
      }
      return json(sectionReport(assignedSection));
    }

    if (path.startsWith("/personal-timetable") && method === "GET") {
      if (role === "FACULTY") {
        return json({ type: "FACULTY", target: facultyRecord, session, timetable, summary: { classes: 1, periods: 1, workingDays: 1 }, rows: [assignedEntry], today: { day: "Monday", rows: [assignedEntry] } });
      }
      if (role === "VIEWER") {
        return json({ type: "SECTION", target: assignedSection, session, timetable, summary: { classes: 1, periods: 1, workingDays: 1 }, rows: [assignedEntry], today: { day: "Monday", rows: [assignedEntry] } });
      }
      return json({ type: "SECTION", target: assignedSection, session, timetable, summary: { classes: 1, periods: 1, workingDays: 1 }, rows: [assignedEntry], today: { day: "Monday", rows: [assignedEntry] } });
    }

    if (method === "GET" && path.startsWith("/")) return json([]);
    return json({ message: "Unhandled role-test mock endpoint: " + method + " " + path }, 500);
  });

  await page.goto("/");
  await page.locator(".login-form input").nth(0).fill(user.username);
  await page.locator(".login-form input").nth(1).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("Scheduler can run timetable workflows but cannot administer users", async ({ page }) => {
  await installRoleApiMocks(page, "SCHEDULER");

  await expect(page.getByRole("button", { name: /Generate Timetable/ }).first()).toBeVisible();
  await expect(page.locator('[data-nav="Academic Sessions"]')).toBeVisible();
  await expect(page.locator('[data-nav="Public Sharing"]')).toHaveCount(0);
  await expect(page.locator('[data-nav="User Management"]')).toHaveCount(0);

  await page.locator('[data-nav="Academic Sessions"]').click();
  await expect(page.getByRole("heading", { name: "Academic Sessions", exact: true })).toBeVisible();

  await page.goto("/user-management");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1")).toHaveText("Dashboard");
  await expect(page.locator('[data-nav="User Management"]')).toHaveCount(0);
});

test("Faculty can see their faculty portal but not academic administration", async ({ page }) => {
  await installRoleApiMocks(page, "FACULTY");

  await expect(page.locator('[data-nav="Faculty Portal"]')).toBeVisible();
  await expect(page.locator('[data-nav="My Timetable"]')).toBeVisible();
  await expect(page.locator('[data-nav="Students"]')).toHaveCount(0);
  await expect(page.locator('[data-nav="Academic Sessions"]')).toHaveCount(0);
  await expect(page.locator('[data-nav="User Management"]')).toHaveCount(0);

  await page.locator('[data-nav="Faculty Portal"]').click();
  await expect(page.getByRole("heading", { name: "Faculty Portal" })).toBeVisible();
  await expect(page.getByText("Assigned Mathematics")).toBeVisible();
  await expect(page.getByText("Confidential Section Z")).toHaveCount(0);

  await page.goto("/academic-sessions");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1")).toHaveText("Dashboard");
});

test("Viewer can only see assigned section timetable and cannot open another section", async ({ page }) => {
  await installRoleApiMocks(page, "VIEWER");

  await expect(page.locator('[data-nav="Section Portal"]')).toBeVisible();
  await expect(page.locator('[data-nav="Student Mapping"]')).toHaveCount(0);
  await expect(page.locator('[data-nav="Academic Sessions"]')).toHaveCount(0);
  await expect(page.locator('[data-nav="User Management"]')).toHaveCount(0);

  await page.locator('[data-nav="Section Portal"]').click();
  await expect(page.getByRole("heading", { name: "Student / Section Timetable" })).toBeVisible();
  await expect(page.getByText("Section A", { exact: true })).toBeVisible();
  await expect(page.getByText("Assigned Mathematics")).toBeVisible();
  await expect(page.getByText("Confidential Section Z")).toHaveCount(0);
  await expect(page.locator(".section-selector select option")).toHaveCount(1);

  const forbiddenRequest = await page.evaluate(async () => {
    const response = await fetch("/api/section-portal?sectionId=section-secret", {
      headers: { Authorization: "Bearer role-test-token-VIEWER" }
    });
    return { status: response.status, body: await response.json() };
  });
  expect(forbiddenRequest.status).toBe(403);
  expect(forbiddenRequest.body.message).toMatch(/assigned Section/i);

  await page.goto("/student-mapping");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1")).toHaveText("Dashboard");
});


test("dashboard shows visual analytics and the sidebar collapses to icon navigation", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");

  await expect(page.getByRole("heading", { name: "Class distribution" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Bar chart of scheduled classes by day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timetable at a glance" })).toBeVisible();

  const sidebar = page.locator(".erp-sidebar");
  const app = page.locator(".app");
  await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Collapse Academic Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse Academic Setup" }).click();
  await expect(page.locator('[data-nav="Academic Sessions"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Academic Setup" }).click();
  await expect(page.locator('[data-nav="Academic Sessions"]')).toBeVisible();

  await expect(page.getByRole("button", { name: "Collapse Academic Sessions submodules" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse Academic Sessions submodules" }).click();
  await expect(page.locator('[data-nav="Academic Structure"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Academic Sessions submodules" }).click();
  await expect(page.locator('[data-nav="Academic Structure"]')).toBeVisible();
  await page.locator('[data-nav="Academic Structure"]').click();
  await expect(page.getByRole("heading", { name: "Academic Structure", exact: true })).toBeVisible();
  await expect(page.locator('[data-nav="Holiday Management"]')).toBeVisible();

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(app).toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS("width", "82px");
  await expect(sidebar.locator(".nav-label").first()).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
});



test("navigation submodules are mapped to the correct parent and module group", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");

  const mappings = [
    ["Academic Structure", "Academic Sessions", "Academic Setup"],
    ["Holiday Management", "Academic Sessions", "Academic Setup"],
    ["Subject & Faculty Mapping", "Master Data Settings", "Academic Setup"],
    ["Program & Section Mapping", "Master Data Settings", "Academic Setup"],
    ["All Program Timetables", "Full Session Timetable", "Timetable & Scheduling"],
    ["Timetable", "Full Session Timetable", "Timetable & Scheduling"],
    ["Calendar View", "Full Session Timetable", "Timetable & Scheduling"],
    ["Student Mapping", "Students", "Students & Operations"],
    ["Student Profile", "Students", "Students & Operations"],
    ["Student Promotion", "Students", "Students & Operations"],
    ["Import Center", "Excel Import", "Tools & Sharing"],
    ["Templates & Clone", "Excel Import", "Tools & Sharing"],
    ["Analytics", "Reports", "Reports & Audit"],
    ["Validation", "Reports", "Reports & Audit"],
    ["Change History", "Audit Logs", "Reports & Audit"]
  ];

  for (const [childName, parentName, groupName] of mappings) {
    const group = page.locator(`.nav-group[data-nav-group="${groupName}"]`);
    await expect(group).toHaveCount(1);
    const child = page.locator(`[data-nav="${childName}"]`);
    const expand = page.getByRole("button", { name: `Expand ${parentName} submodules` });
    if (await expand.count()) await expand.click();

    await expect(child, `${childName} should be visible under ${parentName}`).toBeVisible();
    await expect(child).toHaveAttribute("data-nav-parent", parentName);
    await expect(child).toHaveAttribute("data-nav-group", groupName);
  }

  // These pages are intentionally standalone rather than children of unrelated modules.
  for (const [pageName, groupName] of [
    ["Generation Readiness", "Timetable & Scheduling"],
    ["Availability", "Timetable & Scheduling"],
    ["Optimization", "Timetable & Scheduling"],
    ["Attendance", "Students & Operations"],
    ["Fees", "Students & Operations"],
    ["My Timetable", "Portals & Communication"],
    ["Faculty Portal", "Portals & Communication"],
    ["Section Portal", "Portals & Communication"],
    ["Notifications", "Portals & Communication"],
    ["Public Sharing", "Tools & Sharing"]
  ]) {
    const item = page.locator(`[data-nav="${pageName}"]`);
    await expect(item).toHaveAttribute("data-nav-group", groupName);
    await expect(item).not.toHaveAttribute("data-nav-parent", /.+/);
  }
});

test("direct URL navigation expands the correct group and parent module", async ({ page }) => {
  await page.addInitScript(() => {
    if (window.location.origin !== "null") {
      localStorage.setItem("tt_nav_collapsed_groups", JSON.stringify({ "Academic Setup": true }));
      localStorage.setItem("tt_nav_expanded_modules", JSON.stringify({ "Master Data Settings": false }));
    }
  });
  await installRoleApiMocks(page, "ADMIN");

  await page.goto("/program-and-section-mapping");
  await expect(page).toHaveURL(/\/program-and-section-mapping$/);

  const group = page.locator('.nav-group[data-nav-group="Academic Setup"]');
  const module = page.locator('[data-nav-module="Master Data Settings"]');
  const child = module.locator('[data-nav="Program & Section Mapping"]');

  await expect(group).toBeVisible();
  await expect(child).toBeVisible();
  await expect(child).toHaveAttribute("data-nav-parent", "Master Data Settings");
  await expect(module.locator(".nav-module-link")).toHaveClass(/active/);
});

test("mobile navigation drawer opens, dismisses, and navigates with persisted collapsed preference", async ({ page }) => {
  await page.addInitScript(() => { if (window.location.origin !== "null") localStorage.setItem("tt_sidebar_collapsed", "true"); });
  await installRoleApiMocks(page, "ADMIN");
  await page.setViewportSize({ width: 390, height: 844 });

  const sidebar = page.locator(".erp-sidebar");
  const trigger = page.locator(".mobile-nav-trigger");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-label", "Open navigation");
  await expect(sidebar).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Time Table", { exact: true })).toBeVisible();
  await expect(sidebar.locator('[data-nav="Academic Sessions"]')).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Collapse Academic Setup" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(sidebar).toBeVisible();
  await page.locator(".sidebar-backdrop").click({ position: { x: 380, y: 420 } });
  await expect(sidebar).toBeHidden();

  await trigger.click();
  await page.locator('[data-nav="Academic Sessions"]').click();
  await expect(page.getByRole("heading", { name: "Academic Sessions", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/academic-sessions$/);
  await expect(sidebar).toBeHidden();
});

test("navigation groups and modules collapse independently and active submodules reopen their parent", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");

  const academicGroup = page.locator(".nav-group").filter({ has: page.getByRole("button", { name: "Academic Setup" }) });
  const groupToggle = page.getByRole("button", { name: "Collapse Academic Setup" });
  await expect(groupToggle).toBeVisible();
  await groupToggle.click();
  await expect(page.locator('[data-nav="Academic Sessions"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Academic Setup" }).click();
  await expect(page.locator('[data-nav="Academic Sessions"]')).toBeVisible();

  await page.getByRole("button", { name: "Collapse Academic Sessions submodules" }).click();
  await expect(page.locator('[data-nav="Academic Structure"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Expand Academic Sessions submodules" }).click();
  await expect(page.locator('[data-nav="Academic Structure"]')).toBeVisible();

  await page.locator('[data-nav="Academic Structure"]').click();
  await expect(page.locator('[data-nav="Academic Structure"]')).toHaveClass(/active/);
  await expect(page.locator('[data-nav="Academic Sessions"]')).toHaveClass(/active/);
  await expect(page.locator('[data-nav="Holiday Management"]')).toBeVisible();
});
