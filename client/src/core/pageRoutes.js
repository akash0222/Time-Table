// URL routes for the Time Table multi-page workspace.
// Each existing module keeps its current component/permissions while gaining a
// stable URL that supports refresh, direct navigation and browser history.

export const PAGE_NAMES = [
  "Dashboard",
  "Academic Sessions",
  "Academic Structure",
  "Holiday Management",
  "Generation Readiness",
  "Generation Preview",
  "Full Session Timetable",
  "All Program Timetables",
  "Timetable",
  "Approval & Versions",
  "Calendar View",
  "My Timetable",
  "Students",
  "Student Mapping",
  "Student Profile",
  "Student Promotion",
  "Attendance",
  "Faculty Portal",
  "Section Portal",
  "Fees",
  "Notifications",
  "Master Data Settings",
  "Subject & Faculty Mapping",
  "Program & Section Mapping",
  "Excel Import",
  "Import Center",
  "Templates & Clone",
  "Public Sharing",
  "Reports",
  "Analytics",
  "Validation",
  "Change History",
  "Audit Logs",
  "User Management",
  "Settings",
  "Optimization",
  "Availability"
];

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const routeByName = new Map(PAGE_NAMES.map(name => [name, `/${slugify(name)}`]));
const nameByRoute = new Map([...routeByName.entries()].map(([name, route]) => [route, name]));

// Common legacy spellings are intentionally supported so previously shared
// paths continue to land on the corresponding page after the restructure.
const aliases = new Map([
  ["/home", "Dashboard"],
  ["/master-data", "Master Data Settings"],
  ["/students/mapping", "Student Mapping"],
  ["/students/promotion", "Student Promotion"],
  ["/timetables", "Timetable"],
  ["/my-timetable", "My Timetable"]
]);

export function getPathForPage(name) {
  return routeByName.get(name) || "/";
}

export function getPageForPath(pathname) {
  const path = `/${String(pathname || "/").split("?")[0].split("#")[0].split("/").filter(Boolean).join("/")}`.toLowerCase();
  if (path === "/" || path === "") return "Dashboard";
  if (aliases.has(path)) return aliases.get(path);
  return nameByRoute.get(path) || "Dashboard";
}
