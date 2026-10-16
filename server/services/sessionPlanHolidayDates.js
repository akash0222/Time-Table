function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
}

export function holidayDateRangeIssue(values, start, end) {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  if (!startKey || !endKey || startKey > endKey) {
    return "The academic session start and end dates are invalid.";
  }

  const dates = [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? "").trim()).filter(Boolean))];
  for (const value of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `Invalid date: ${value}`;
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
      return `Invalid date: ${value}`;
    }
    if (value < startKey || value > endKey) {
      return `Holiday ${value} is outside the selected academic session range ${startKey} to ${endKey}.`;
    }
  }
  return "";
}
