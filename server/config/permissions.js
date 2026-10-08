export const ROLE_PERMISSIONS = Object.freeze({
  ADMIN: ["*"],
  SCHEDULER: [
    "timetable:generate",
    "timetable:edit",
    "timetable:submit",
    "master:manage",
    "academic:manage",
    "student:manage",
    "import:run",
    "reports:view"
  ],
  FACULTY: ["portal:faculty", "timetable:view"],
  VIEWER: ["portal:section", "timetable:view"]
});

export function hasPermission(role, permission) {
  const list = ROLE_PERMISSIONS[role] || [];
  return list.includes("*") || list.includes(permission);
}
