const idOf = value => String(value?._id ?? value ?? "");

const MANAGER_ROLES = new Set(["ADMIN", "SCHEDULER"]);

/**
 * Return only timetable entries the authenticated account is allowed to see.
 * Admin/Scheduler can see the full timetable. Faculty see their assigned
 * faculty entries, and Viewer accounts see only their mapped section.
 */
export function filterTimetableEntriesForUser(entries = [], user = {}) {
  const rows = Array.isArray(entries) ? entries : [];
  const role = String(user?.role || "").toUpperCase();
  if (MANAGER_ROLES.has(role)) return rows;

  if (role === "FACULTY") {
    const facultyId = idOf(user?.faculty);
    if (!facultyId) return [];
    return rows.filter(entry => idOf(entry?.faculty) === facultyId);
  }

  if (role === "VIEWER") {
    const sectionId = idOf(user?.section);
    if (!sectionId) return [];
    return rows.filter(entry => idOf(entry?.section) === sectionId);
  }

  return [];
}
