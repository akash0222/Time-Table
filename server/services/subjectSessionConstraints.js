export const SUBJECT_WEEKLY_LIMIT_ERROR =
  "Max Classes / Week cannot be lower than Classes / Week. The weekly timetable must be able to place the configured weekly target.";

export function subjectWeeklyLimitIssue({classesPerWeek, totalSessions, maxClassesPerWeek} = {}) {
  const weeklyTarget = Math.max(1, Number(classesPerWeek || 1));
  const configuredLimit = Number(maxClassesPerWeek || 0);
  const effectiveLimit = configuredLimit > 0 ? configuredLimit : weeklyTarget;

  if (effectiveLimit < weeklyTarget) {
    return SUBJECT_WEEKLY_LIMIT_ERROR;
  }
  return null;
}
