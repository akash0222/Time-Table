export function subjectTarget(subject, weekCount) {
  const explicit = Number(subject?.totalSessions || 0);
  if (explicit > 0) return explicit;
  const weekly = Number(subject?.classesPerWeek || 0);
  return Math.max(0, weekly * weekCount);
}

export function subjectEligibleWeeks(subject, weeks) {
  if (!subject?._programStartDate || !subject?._programEndDate) return weeks.length;
  const start = String(subject._programStartDate).slice(0, 10);
  const end = String(subject._programEndDate).slice(0, 10);
  return weeks.filter(week =>
    (week.workingDates || []).some(date => date >= start && date <= end)
  ).length;
}

/**
 * Required class count must use the same program-specific eligible-week count
 * as weekly allocation; using the union session length over-counts programs
 * whose dates cover only part of the academic session.
 */
export function requiredSessionCount(subjects, weeks) {
  return subjects.reduce(
    (total, subject) => total + subjectTarget(subject, subjectEligibleWeeks(subject, weeks)),
    0
  );
}
