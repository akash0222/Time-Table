const pad = value => String(value).padStart(2, "0");

function toDateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}

function isRealDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Resolve annual holiday templates into concrete dates for one academic
 * session. The latest updated rule for a month/day wins if multiple sessions
 * contain the same recurring holiday date.
 */
export function recurringHolidayOccurrences(session, recurringSources = []) {
  const start = toDateKey(session?.startDate);
  const end = toDateKey(session?.endDate);
  const occurrences = new Map();
  if (!start || !end || start > end) return occurrences;

  const sources = [...(recurringSources || [])].sort((left, right) =>
    new Date(left?.updatedAt || 0).valueOf() - new Date(right?.updatedAt || 0).valueOf()
  );
  const templates = new Map();
  for (const source of sources) {
    for (const item of (source?.holidayDetails || [])) {
      if (item?.occursEveryYear !== true) continue;
      const originalDate = toDateKey(item.date);
      if (!isRealDate(originalDate)) continue;
      const monthDay = originalDate.slice(5);
      templates.set(monthDay, {
        name: String(item.name || "").trim(),
        description: String(item.description || "").trim(),
        holidayType: item.holidayType === "Optional" ? "Optional" : "Mandatory",
        occursEveryYear: true,
        sourceSessionId: String(source._id || ""),
        sourceDate: originalDate
      });
    }
  }

  const firstYear = Number(start.slice(0, 4));
  const lastYear = Number(end.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const [monthDay, rule] of templates) {
      const date = String(year) + "-" + monthDay;
      if (!isRealDate(date) || date < start || date > end) continue;
      const weekday = new Date(date + "T00:00:00.000Z").getUTCDay();
      if (weekday === 0) continue;
      occurrences.set(date, {...rule, date, recurringProjection:true});
    }
  }
  return occurrences;
}

export function applyRecurringHolidayCalendar(session, recurringSources = []) {
  if (!session) return session;
  const holidayDates = new Set((session.holidayDates || []).map(toDateKey).filter(Boolean));
  const holidayDetails = new Map((session.holidayDetails || []).map(item => [
    toDateKey(item.date),
    {...item, date:toDateKey(item.date)}
  ]).filter(([date]) => Boolean(date)));
  const exceptions = new Set((session.holidayExceptions || []).map(toDateKey).filter(Boolean));
  const occurrences = recurringHolidayOccurrences(session, recurringSources);

  for (const [date, recurring] of occurrences) {
    if (exceptions.has(date)) continue;
    holidayDates.add(date);
    // A session-local holiday detail overrides a projected annual occurrence.
    if (!holidayDetails.has(date)) holidayDetails.set(date, recurring);
  }

  return {
    ...session,
    holidayDates:[...holidayDates].sort(),
    holidayDetails:[...holidayDetails.values()].sort((left, right) => String(left.date).localeCompare(String(right.date))),
    holidayExceptions:[...exceptions].sort()
  };
}
