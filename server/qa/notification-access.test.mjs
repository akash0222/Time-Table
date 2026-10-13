import assert from "node:assert/strict";
import {
  resolveNotificationSectionScope,
  buildNotificationAudienceClauses,
  canViewNotification
} from "../services/notificationAccess.js";

const viewerA = resolveNotificationSectionScope({ role: "VIEWER", section: "section-A" });
assert.equal(viewerA.allowed, true);
assert.deepEqual(viewerA.sectionIds, ["section-A"]);
assert.equal(
  resolveNotificationSectionScope({ role: "VIEWER", section: "section-A" }, "section-B").allowed,
  false
);
assert.equal(
  resolveNotificationSectionScope({ role: "VIEWER", section: "section-A" }, "section-A").allowed,
  true
);

const facultyScope = resolveNotificationSectionScope({
  role: "FACULTY",
  faculty: "faculty-A",
  facultySectionIds: ["section-A", "section-B", "section-A"]
});
assert.equal(facultyScope.allowed, true);
assert.deepEqual(facultyScope.sectionIds.sort(), ["section-A", "section-B"]);
assert.equal(
  resolveNotificationSectionScope({
    role: "FACULTY",
    faculty: "faculty-A",
    facultySectionIds: ["section-A"]
  }, "section-C").allowed,
  false
);

const adminScope = resolveNotificationSectionScope({ role: "ADMIN" }, "arbitrary-section");
assert.equal(adminScope.allowed, true);
assert.deepEqual(adminScope.sectionIds, ["arbitrary-section"]);

const clauses = buildNotificationAudienceClauses({
  role: "FACULTY",
  userId: "user-A",
  facultyId: "faculty-A"
}, facultyScope);
assert(clauses.some(clause => clause.audience === "ALL"));
assert(clauses.some(clause => clause.audience === "USER" && clause.user === "user-A"));
assert(clauses.some(clause => clause.audience === "FACULTY" && clause.faculty === "faculty-A"));
assert(clauses.some(clause => clause.audience === "SECTION" &&
  clause.section.$in.includes("section-A") && clause.section.$in.includes("section-B")));

const now = new Date("2026-10-13T10:00:00.000Z");
const context = { role: "VIEWER", userId: "user-A", sectionIds: ["section-A"] };
const base = { published: true, startAt: new Date("2026-10-01T00:00:00.000Z"), endAt: null };
assert.equal(canViewNotification({ ...base, audience: "ALL" }, context, now), true);
assert.equal(canViewNotification({ ...base, audience: "USER", user: "user-A" }, context, now), true);
assert.equal(canViewNotification({ ...base, audience: "USER", user: "user-B" }, context, now), false);
assert.equal(canViewNotification({ ...base, audience: "SECTION", section: "section-A" }, context, now), true);
assert.equal(canViewNotification({ ...base, audience: "SECTION", section: "section-B" }, context, now), false);
assert.equal(canViewNotification({ ...base, audience: "FACULTY", faculty: "faculty-A" }, context, now), false);
assert.equal(canViewNotification({ ...base, published: false, audience: "ALL" }, context, now), false);
assert.equal(canViewNotification({
  ...base,
  startAt: new Date("2026-10-14T00:00:00.000Z"),
  audience: "ALL"
}, context, now), false);
assert.equal(canViewNotification({
  ...base,
  endAt: new Date("2026-10-12T00:00:00.000Z"),
  audience: "ALL"
}, context, now), false);

console.log("Notification audience access regression checks passed.");
