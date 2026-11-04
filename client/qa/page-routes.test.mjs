import assert from "node:assert/strict";
import { PAGE_NAMES, getPageForPath, getPathForPage } from "../src/core/pageRoutes.js";
import { navGroupsForRole } from "../src/core/navigation.jsx";

assert.equal(getPageForPath("/"), "Dashboard");
assert.equal(getPageForPath("/dashboard"), "Dashboard");
assert.equal(getPageForPath("/academic-sessions"), "Academic Sessions");
assert.equal(getPageForPath("/student-mapping"), "Student Mapping");
assert.equal(getPageForPath("/full-session-timetable"), "Full Session Timetable");
assert.equal(getPageForPath("/approval-and-versions"), "Approval & Versions");
assert.equal(getPageForPath("/program-and-section-mapping"), "Program & Section Mapping");
assert.equal(getPageForPath("/manual-timetable-import"), "Manual Timetable Import");
assert.equal(getPathForPage("Manual Timetable Import"), "/manual-timetable-import");
assert.equal(getPageForPath("/master-data"), "Master Data Settings");
assert.equal(getPageForPath("/unknown-module"), "Dashboard");

for (const page of PAGE_NAMES) {
  assert.equal(getPageForPath(getPathForPage(page)), page, `Route round-trip failed for ${page}`);
}

const paths = PAGE_NAMES.map(getPathForPage);
assert.equal(new Set(paths).size, paths.length, "Every page must have a unique URL.");

console.log(`PASS  ${PAGE_NAMES.length} pages have unique, round-trippable routes.`);
console.log("PASS  Dashboard, legacy aliases, and unknown-route fallback work.");

const visiblePages = role => navGroupsForRole(role).flatMap(group => group.items.map(item => item.name));
assert.ok(visiblePages("ADMIN").includes("Manual Timetable Import"));
assert.ok(visiblePages("SCHEDULER").includes("Manual Timetable Import"));
assert.ok(!visiblePages("FACULTY").includes("Manual Timetable Import"));
assert.ok(!visiblePages("VIEWER").includes("Manual Timetable Import"));
console.log("PASS  Manual timetable Excel import is limited to Admin and Scheduler navigation.");
