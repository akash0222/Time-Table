import mongoose from "mongoose";

export const TIMETABLE_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function timeToMinutes(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

function idOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

export function timeSlotInputIssue(slot) {
  const day = String(slot?.day ?? "").trim();
  if (!TIMETABLE_DAYS.includes(day)) return "Day must be a valid weekday (Monday through Sunday).";
  const start = timeToMinutes(slot?.startTime);
  const end = timeToMinutes(slot?.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Start Time and End Time must use a valid 24-hour time, such as 09:00."; 
  if (end <= start) return "End Time must be later than Start Time."; 
  const order = Number(slot?.order);
  if (!Number.isInteger(order) || order < 1 || order > 100) return "Period order must be an integer between 1 and 100."; 
  if (slot?.academicSession && !mongoose.isValidObjectId(idOf(slot.academicSession))) return "Academic session selection is invalid.";
  if (slot?.program && !mongoose.isValidObjectId(idOf(slot.program))) return "Program selection is invalid.";
  if (String(slot?.semester ?? "").trim().length > 80) return "Semester label must be 80 characters or fewer.";
  if (String(slot?.semester ?? "").trim() && !slot?.program) return "Select a Program before setting a semester-specific timetable."; 
  return "";
}

function scopePriority(slot) {
  // Keep this ordering aligned with resolveTimeSlotsForSection: a scoped
  // schedule replaces its broader fallback schedule instead of conflicting
  // with the fallback's reused period numbers or clock times.
  return (idOf(slot?.academicSession) ? 100 : 0)
    + (idOf(slot?.program) ? 10 : 0)
    + (String(slot?.semester ?? "").trim() ? 1 : 0);
}

function scopesCanOverlap(a, b) {
  const aSession = idOf(a?.academicSession);
  const bSession = idOf(b?.academicSession);
  if (aSession && bSession && aSession !== bSession) return false;

  const aProgram = idOf(a?.program);
  const bProgram = idOf(b?.program);
  if (aProgram && bProgram && aProgram !== bProgram) return false;

  const aSemester = String(a?.semester ?? "").trim().toLowerCase();
  const bSemester = String(b?.semester ?? "").trim().toLowerCase();
  // Different explicit semesters have independent period orders and clock schedules.
  // An empty semester is a program-wide default and therefore intersects every semester.
  if (aSemester && bSemester && aSemester !== bSemester) return false;
  return true;
}

export function timeSlotConflictIssue(candidate, existingSlots = [], exceptId = "") {
  const candidateStart = timeToMinutes(candidate?.startTime);
  const candidateEnd = timeToMinutes(candidate?.endTime);
  for (const existing of existingSlots) {
    if (exceptId && idOf(existing?._id) === String(exceptId)) continue;
    if (String(existing?.day ?? "").trim() !== String(candidate?.day ?? "").trim()) continue;
    if (!scopesCanOverlap(candidate, existing)) continue;
    // If one record is a broader fallback, the effective-scope resolver will
    // choose the more specific set for any affected section. Only compare
    // collisions within the same scope level.
    if (scopePriority(candidate) !== scopePriority(existing)) continue;

    if (Number(existing?.order) === Number(candidate?.order)) {
      return "Period order " + candidate.order + " is already used on " + candidate.day + " in this timetable scope."; 
    }
    const existingStart = timeToMinutes(existing?.startTime);
    const existingEnd = timeToMinutes(existing?.endTime);
    if (!Number.isFinite(existingStart) || !Number.isFinite(existingEnd) || existingEnd <= existingStart) {
      return "An existing time slot on " + candidate.day + " has invalid clock times. Correct it before adding another slot."; 
    }
    if (candidateStart < existingEnd && existingStart < candidateEnd) {
      return "Time slot overlaps an existing slot on " + candidate.day + " (" + existing.startTime + "-" + existing.endTime + ")."; 
    }
  }
  return "";
}

export function timeSlotScopesCanOverlap(a, b) {
  return scopesCanOverlap(a, b);
}


/**
 * Validate a whole slot batch against stored slots and earlier entries in the
 * same batch. Call while holding the slot-write lock so overlapping writes
 * cannot pass validation at the same time.
 */
export function timeSlotBatchInputIssue(slots, existingSlots = [], maxItems = 500) {
  if (!Array.isArray(slots) || slots.length === 0) {
    return "Add at least one time slot.";
  }
  if (slots.length > maxItems) {
    return `A single request may contain at most ${maxItems} time slots.`;
  }

  const accepted = [];
  for (let index = 0; index < slots.length; index += 1) {
    const candidate = slots[index];
    const inputIssue = timeSlotInputIssue(candidate);
    if (inputIssue) return `Time slot ${index + 1}: ${inputIssue}`;

    const conflict = timeSlotConflictIssue(candidate, [...existingSlots, ...accepted]);
    if (conflict) return `Time slot ${index + 1}: ${conflict}`;
    accepted.push(candidate);
  }
  return "";
}
