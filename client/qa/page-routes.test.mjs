import assert from "node:assert/strict";
import { PAGE_NAMES, getPageForPath, getPathForPage } from "../src/core/pageRoutes.js";

assert.equal(getPageForPath("/"), "Dashboard");
assert.equal(getPageForPath("/dashboard"), "Dashboard");
assert.equal(getPageForPath("/academic-sessions"), "Academic Sessions");
assert.equal(getPageForPath("/student-mapping"), "Student Mapping");
assert.equal(getPageForPath("/full-session-timetable"), "Full Session Timetable");
assert.equal(getPageForPath("/approval-and-versions"), "Approval & Versions");
assert.equal(getPageForPath("/program-and-section-mapping"), "Program & Section Mapping");
assert.equal(getPageForPath("/master-data"), "Master Data Settings");
assert.equal(getPageForPath("/unknown-module"), "Dashboard");

for (const page of PAGE_NAMES) {
  assert.equal(getPageForPath(getPathForPage(page)), page, `Route round-trip failed for ${page}`);
}

const paths = PAGE_NAMES.map(getPathForPage);
assert.equal(new Set(paths).size, paths.length, "Every page must have a unique URL.");

console.log(`PASS  ${PAGE_NAMES.length} pages have unique, round-trippable routes.`);
console.log("PASS  Dashboard, legacy aliases, and unknown-route fallback work.");
