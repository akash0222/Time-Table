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
    if (path === "/auth/change-password" && method === "POST") {
      if (body.currentPassword !== password) return json({ message: "Current password is incorrect." }, 400);
      if (String(body.newPassword || "").length < 10) return json({ message: "New password must contain at least 10 characters." }, 400);
      return json({ ok: true, message: "Password changed successfully." });
    }
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

async function openModule(page, moduleName) {
  await page.locator(`.nav-module-button[data-nav-module="${moduleName}"]`).click();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
}

async function openSubmodule(page, moduleName, pageName) {
  await openModule(page, moduleName);
  const directLink = page.locator(`.nav-flyout-panel [data-nav="${pageName}"]`);
  if (await directLink.count()) {
    await directLink.click();
    return;
  }
  const nestedGroups = {
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
  const groupName = nestedGroups[pageName];
  if (!groupName) throw new Error(`No nested navigation mapping for ${pageName}`);
  await page.locator(`.nav-flyout-panel [data-nav-submenu="${groupName}"]`).click();
  await page.locator(`.nav-subflyout-panel [data-nav="${pageName}"]`).click();
}

test("successful sign-in always opens Dashboard instead of a stale last-visited page", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("tt_return_to", "/academic-sessions");
  });
  await installRoleApiMocks(page, "ADMIN");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", {name:"Dashboard",exact:true})).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("tt_return_to"))).toBeNull();
});

test("Scheduler can run timetable workflows but cannot administer users", async ({ page }) => {
  await installRoleApiMocks(page, "SCHEDULER");

  await expect(page.getByRole("button", { name: /Generate Timetable/ }).first()).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"]')).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Tools & Sharing"]')).toBeVisible();
  await openModule(page, "Tools & Sharing");
  await expect(page.locator('.nav-flyout-panel [data-nav="Public Sharing"]')).toHaveCount(0);
  // Scheduler receives Settings but not the User Management submodule.
  await page.locator('.nav-module-button[data-nav-module="Administration"]').click();
  await expect(page).toHaveURL(/\/settings$/);

  await openSubmodule(page, "Academic Setup", "Academic Sessions");
  await expect(page.getByRole("heading", { name: "Create Academic Session", exact: true })).toBeVisible();

  await page.goto("/user-management");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1")).toHaveText("Dashboard");
  await expect(page.locator('[data-nav="User Management"]')).toHaveCount(0);
});

test("Faculty can see their faculty portal but not academic administration", async ({ page }) => {
  await installRoleApiMocks(page, "FACULTY");

  await expect(page.locator('.nav-module-button[data-nav-module="Portals & Communication"]')).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Students & Operations"]')).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"]')).toHaveCount(0);
  await expect(page.locator('.nav-module-button[data-nav-module="Administration"]')).toHaveCount(0);
  await openModule(page, "Students & Operations");
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Profile"]')).toBeVisible();
  await expect(page.locator('.nav-flyout-panel [data-nav="Attendance"]')).toBeVisible();
  await expect(page.locator('.nav-flyout-panel [data-nav="Students"]')).toHaveCount(0);
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Promotion"]')).toHaveCount(0);

  await openSubmodule(page, "Portals & Communication", "Faculty Portal");
  await expect(page.getByRole("heading", { name: "Faculty Portal" })).toBeVisible();
  await expect(page.getByText("Assigned Mathematics")).toBeVisible();
  await expect(page.getByText("Confidential Section Z")).toHaveCount(0);

  await page.goto("/academic-sessions");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator("h1")).toHaveText("Dashboard");
});

test("Viewer can only see assigned section timetable and cannot open another section", async ({ page }) => {
  await installRoleApiMocks(page, "VIEWER");

  await expect(page.locator('.nav-module-button[data-nav-module="Portals & Communication"]')).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Students & Operations"]')).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"]')).toHaveCount(0);
  await expect(page.locator('.nav-module-button[data-nav-module="Administration"]')).toHaveCount(0);
  await openModule(page, "Students & Operations");
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Profile"]')).toBeVisible();
  await expect(page.locator('.nav-flyout-panel [data-nav="Attendance"]')).toBeVisible();
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Mapping"]')).toHaveCount(0);
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Promotion"]')).toHaveCount(0);

  await openSubmodule(page, "Portals & Communication", "Section Portal");
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


test("ERP navigation uses a fixed-width module sidebar with flyout submenus", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  await expect(page.getByRole("heading", { name: "Class distribution" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Bar chart of scheduled classes by day" })).toBeVisible();

  const sidebar=page.locator(".erp-sidebar");
  const app=page.locator(".app");
  await expect(sidebar).toHaveCSS("width", "258px");
  await expect(page.getByRole("button", { name: "Collapse navigation" })).toBeVisible();
  await expect(page.locator(".nav-module-button")).toHaveCount(8);

  const academic=page.locator('.nav-module-button[data-nav-module="Academic Setup"]');
  await academic.hover();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
  await expect(page.locator(".nav-flyout-header")).toContainText("Academic Setup");
  await expect(page.locator('.nav-flyout-panel [data-nav="Academic Sessions"]')).toBeVisible();

  // Clicking the already-hovered module should keep the flyout open.
  await academic.click();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
  await page.locator('.nav-flyout-panel [data-nav-submenu="Program & Section Structure"]').click();
  await expect(page.locator('.nav-subflyout-panel [data-nav="Academic Structure"]')).toBeVisible();
  await page.locator('.nav-subflyout-panel [data-nav="Academic Structure"]').click();
  await expect(page.getByRole("heading", { name: "Academic Structure", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/academic-structure$/);
  await expect(page.locator(".nav-flyout-panel")).toHaveCount(0);
  await expect(sidebar).toHaveCSS("width", "258px");
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"]')).toHaveClass(/has-current/);

  // A direct URL marks the module as current; its flyout exposes the selected page.
  await page.goto("/program-and-section-mapping");
  const group=page.locator('.nav-module-button[data-nav-module="Academic Setup"]');
  await expect(group).toHaveClass(/has-current/);
  await group.click();
  await page.locator('.nav-flyout-panel [data-nav-submenu="Program & Section Structure"]').click();
  await expect(page.locator('.nav-subflyout-panel [data-nav="Program & Section Mapping"]')).toHaveClass(/active/);
});

test("desktop sidebar collapses to an icon rail and expands without losing module navigation", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  await page.setViewportSize({width:1440,height:900});
  const sidebar=page.locator(".erp-sidebar");
  const app=page.locator(".app");
  const collapse=page.getByRole("button",{name:"Collapse navigation"});
  await expect(sidebar).toHaveCSS("width","258px");
  await collapse.click();
  await expect(app).toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS("width","76px");
  const academic=page.locator('.nav-module-button[data-nav-module="Academic Setup"]');
  await expect(academic).toBeVisible();
  await expect(academic.locator("span")).toBeHidden();
  await academic.hover();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
  await expect(page.locator(".nav-flyout-panel")).toHaveCSS("left","86px");
  await expect(page.locator('.nav-flyout-panel [data-nav="Academic Sessions"]')).toBeVisible();
  await page.locator(".nav-flyout-header").getByRole("button",{name:"Close submenu"}).click();
  await page.getByRole("button",{name:"Expand navigation"}).click();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await expect(sidebar).toHaveCSS("width","258px");
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"] span')).toBeVisible();
});

test("profile dropdown is in the global header and supports password change and logout", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  await expect(page.locator(".app-topbar")).toBeVisible();
  const profile=page.getByRole("button",{name:/Profile/});
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(page.getByRole("menu",{name:"Profile menu"})).toBeVisible();
  await expect(page.getByText("admin",{exact:true})).toBeVisible();
  await expect(page.getByRole("menu").getByText("ADMIN",{exact:true}).first()).toBeVisible();

  await page.getByRole("menuitem",{name:"Change Password"}).click();
  const dialog=page.getByRole("dialog",{name:"Change Password"});
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Current password",{exact:true}).fill(password);
  await dialog.getByLabel("New password",{exact:true}).fill("new-secure-password-2026");
  await dialog.getByLabel("Confirm new password",{exact:true}).fill("different-password-2026");
  await dialog.getByRole("button",{name:"Update Password"}).click();
  await expect(page.getByText("New password and confirmation do not match.")).toBeVisible();
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Confirm new password",{exact:true}).fill("new-secure-password-2026");
  await dialog.getByRole("button",{name:"Update Password"}).click();
  await expect(page.getByText("Password changed successfully.")).toBeVisible();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button",{name:/Profile/}).click();
  await page.getByRole("menuitem",{name:"Logout"}).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button",{name:"Sign In"})).toBeVisible();
});

test("desktop navigation sidebar resizes with the pointer and keyboard and remembers its width", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  await page.setViewportSize({width:1440,height:900});

  const sidebar=page.locator(".erp-sidebar");
  const handle=page.getByRole("separator",{name:"Resize navigation sidebar"});
  await expect(sidebar).toHaveCSS("width","258px");
  await expect(handle).toBeVisible();

  const bounds=await handle.boundingBox();
  expect(bounds).not.toBeNull();
  const centerY=bounds.y+bounds.height/2;
  await page.mouse.move(bounds.x+bounds.width/2,centerY);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width/2+55,centerY,{steps:8});
  await page.mouse.up();
  await expect(sidebar).toHaveCSS("width","313px");
  await expect(handle).toHaveAttribute("aria-valuenow","313");

  await page.locator('.nav-module-button[data-nav-module="Academic Setup"]').click();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
  await expect(page.locator(".nav-flyout-panel")).toHaveCSS("left","323px");
  await page.locator(".nav-flyout-header").getByRole("button",{name:"Close submenu"}).click();

  await page.reload();
  await expect(page.getByRole("heading",{name:"Class distribution"})).toBeVisible();
  await expect(sidebar).toHaveCSS("width","313px");

  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(sidebar).toHaveCSS("width","323px");
  await page.keyboard.press("End");
  await expect(sidebar).toHaveCSS("width","420px");
  await page.keyboard.press("ArrowRight");
  await expect(sidebar).toHaveCSS("width","420px");
  await page.keyboard.press("Home");
  await expect(sidebar).toHaveCSS("width","210px");
  await expect(handle).toHaveAttribute("aria-valuenow","210");
});

test("module flyouts support nested groups and show only role-visible pages", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  const expected = {
    "Overview": ["Dashboard"],
    "Academic Setup": ["Academic Sessions","Program & Section Structure","Holiday Management","Master Data & Mapping"],
    "Timetable & Scheduling": ["Generation & Optimization","Timetable Views","Approval & Versions"],
    "Students & Operations": ["Student Management","Attendance & Fees"],
    "Portals & Communication": ["My Timetable","Faculty Portal","Section Portal","Notifications"],
    "Tools & Sharing": ["Import & Data Transfer","Templates & Sharing"],
    "Reports & Audit": ["Reports","Analytics","Validation & Audit History"],
    "Administration": ["User Management","Settings"]
  };
  const nested = {
    "Program & Section Structure": ["Academic Structure","Program & Section Mapping"],
    "Master Data & Mapping": ["Master Data Settings","Subject & Faculty Mapping"],
    "Generation & Optimization": ["Generation Readiness","Availability","Optimization"],
    "Timetable Views": ["Full Session Timetable","All Program Timetables","Timetable","Calendar View"],
    "Student Management": ["Students","Student Mapping","Student Profile","Student Promotion"],
    "Attendance & Fees": ["Attendance","Fees"],
    "Import & Data Transfer": ["Excel Import","Import Center"],
    "Templates & Sharing": ["Templates & Clone","Public Sharing"],
    "Validation & Audit History": ["Validation","Audit Logs","Change History"]
  };

  for (const [moduleName, entries] of Object.entries(expected)) {
    const button=page.locator(`.nav-module-button[data-nav-module="${moduleName}"]`);
    await expect(button, moduleName + " module should exist").toBeVisible();
    await expect(button).not.toHaveCSS("background-color", "rgb(255, 255, 255)");
    await button.click();

    if (entries.length === 1) {
      await expect(page).toHaveURL(/\\/dashboard$/);
      continue;
    }

    const panel=page.locator(".nav-flyout-panel");
    await expect(panel).toBeVisible();
    for (const name of entries) {
      const direct=panel.locator(`[data-nav="${name}"]`);
      const submenu=panel.locator(`[data-nav-submenu="${name}"]`);
      await expect(direct.or(submenu), name + " should appear in " + moduleName + " flyout").toBeVisible();
      if (await submenu.count()) {
        await submenu.click();
        const expectedChildren=nested[name];
        await expect(page.locator(".nav-subflyout-panel")).toBeVisible();
        for(const child of expectedChildren) {
          const link=page.locator(`.nav-subflyout-panel [data-nav="${child}"]`);
          await expect(link, child + " should be in " + name).toBeVisible();
          await expect(link).toHaveAttribute("data-nav-parent",name);
        }
      }
    }
    await page.locator(".nav-flyout-header").first().getByRole("button", {name:"Close submenu"}).click();
  }
});


test("navigation panels close when the pointer leaves and have no submodule search", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");

  await page.locator('.nav-module-button[data-nav-module="Students & Operations"]').click();
  const panel=page.locator(".nav-flyout-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByPlaceholder("Search submodules...")).toHaveCount(0);

  await panel.locator('[data-nav-submenu="Student Management"]').click();
  await expect(page.locator(".nav-subflyout-panel")).toBeVisible();

  // Moving outside the complete navigation area should close both levels.
  await page.mouse.move(1200, 680);
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".nav-subflyout-panel")).toHaveCount(0);
});

test("mobile navigation drawer opens and its flyout navigates without collapsing the desktop sidebar", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  await page.setViewportSize({ width: 390, height: 844 });

  const sidebar=page.locator(".erp-sidebar");
  const trigger=page.locator(".mobile-nav-trigger");
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-label", "Open navigation");
  await expect(sidebar).toBeHidden();

  await trigger.click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByText("Time Table", { exact:true })).toBeVisible();
  await expect(sidebar.locator(".nav-module-button[data-nav-module=\"Academic Setup\"]")).toBeVisible();

  await sidebar.locator('.nav-module-button[data-nav-module="Academic Setup"]').click();
  await expect(page.locator(".nav-flyout-panel")).toBeVisible();
  await page.locator('.nav-flyout-panel [data-nav="Academic Sessions"]').click();
  await expect(page.getByRole("heading", {name:"Create Academic Session", exact:true})).toBeVisible();
  await expect(page).toHaveURL(/\/academic-sessions$/);
  await expect(sidebar).toBeHidden();

  await trigger.click();
  await expect(sidebar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sidebar).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("quick navigation searches role-visible modules and opens a matching page", async ({ page }) => {
  await installRoleApiMocks(page, "ADMIN");
  const search=page.getByRole("searchbox", { name: "Search pages" });
  await expect(search).toBeVisible();

  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("sTuDeNt PrOm");
  const module=page.locator('.nav-module-button[data-nav-module="Students & Operations"]');
  await expect(module).toBeVisible();
  await expect(page.locator('.nav-module-button[data-nav-module="Academic Setup"]')).toHaveCount(0);
  await module.click();
  await expect(page.locator('.nav-flyout-panel [data-nav="Student Promotion"]')).toBeVisible();
  await expect(page.locator('.nav-flyout-panel .nav-flyout-item')).toHaveCount(1);
  await page.locator('.nav-flyout-panel [data-nav="Student Promotion"]').click();
  await expect(page).toHaveURL(/\/student-promotion$/);
  await expect(search).toHaveValue("");
  await expect(page.locator('.nav-module-button[data-nav-module="Students & Operations"]')).toHaveClass(/has-current/);

  await search.fill("page-does-not-exist");
  await expect(page.getByRole("status").getByText(/No pages match/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).not.toBeFocused();
});
