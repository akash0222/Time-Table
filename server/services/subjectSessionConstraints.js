export const SUBJECT_WEEKLY_LIMIT_ERROR =
  "Max Classes / Week must be at least Classes / Week when Total Sessions is 0.";

export function subjectWeeklyLimitIssue({classesPerWeek, totalSessions, maxClassesPerWeek} = {}) {
  const weeklyTarget = Math.max(1, Number(classesPerWeek || 1));
  const sessionTarget = Math.max(0, Number(totalSessions || 0));
  const configuredLimit = Number(maxClassesPerWeek || 0);
  const effectiveLimit = configuredLimit > 0 ? configuredLimit : weeklyTarget;

  if (sessionTarget === 0 && effectiveLimit < weeklyTarget) {
    return SUBJECT_WEEKLY_LIMIT_ERROR;
  }
  return null;
}
