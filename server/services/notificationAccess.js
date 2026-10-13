const idOf = value => String(value?._id ?? value ?? "");

const MANAGER_ROLES = new Set(["ADMIN", "SCHEDULER"]);

export function resolveNotificationSectionScope(
  { role, section = null, facultySectionIds = [] },
  requestedSectionId = null
) {
  const requested = idOf(requestedSectionId).trim() || null;
  if (MANAGER_ROLES.has(role)) {
    return { allowed: true, privileged: true, sectionIds: requested ? [requested] : null };
  }

  const assigned = role === "VIEWER"
    ? [idOf(section)].filter(Boolean)
    : role === "FACULTY"
      ? [...new Set(facultySectionIds.map(idOf).filter(Boolean))]
      : [];

  if (requested && !assigned.includes(requested)) {
    return { allowed: false, privileged: false, sectionIds: assigned };
  }
  return {
    allowed: true,
    privileged: false,
    sectionIds: requested ? [requested] : assigned
  };
}

export function buildNotificationAudienceClauses({ role, userId, facultyId }, scope) {
  const clauses = [
    { audience: "ALL" },
    { audience: "USER", user: userId }
  ];

  if (MANAGER_ROLES.has(role)) {
    clauses.push({ audience: "FACULTY" });
    clauses.push(scope.sectionIds === null
      ? { audience: "SECTION" }
      : { audience: "SECTION", section: { $in: scope.sectionIds } });
    return clauses;
  }

  if (role === "FACULTY" && facultyId) {
    clauses.push({ audience: "FACULTY", faculty: facultyId });
  }
  if (scope.sectionIds?.length) {
    clauses.push({ audience: "SECTION", section: { $in: scope.sectionIds } });
  }
  return clauses;
}

export function canViewNotification(notification, context, now = new Date()) {
  if (MANAGER_ROLES.has(context.role)) return true;
  if (!notification?.published) return false;

  const startAt = notification.startAt ? new Date(notification.startAt) : null;
  const endAt = notification.endAt ? new Date(notification.endAt) : null;
  if (startAt && !Number.isNaN(startAt.valueOf()) && startAt > now) return false;
  if (endAt && !Number.isNaN(endAt.valueOf()) && endAt < now) return false;

  switch (notification.audience) {
    case "ALL":
      return true;
    case "USER":
      return idOf(notification.user) === idOf(context.userId);
    case "FACULTY":
      return context.role === "FACULTY"
        && Boolean(context.facultyId)
        && idOf(notification.faculty) === idOf(context.facultyId);
    case "SECTION":
      return (context.sectionIds || []).some(id => idOf(id) === idOf(notification.section));
    default:
      return false;
  }
}
