function idOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function sectionProgramId(section, programs = []) {
  const direct = idOf(section?.programId);
  if (direct) return direct;
  const legacy = normalize(section?.program);
  const matched = (programs || []).find(program =>
    legacy && (legacy === normalize(program?.name) || legacy === normalize(program?.code))
  );
  return idOf(matched);
}

/**
 * A time slot can be global or scoped to an academic session, program, and
 * semester. Unspecified scope fields act as defaults/wildcards.
 */
export function timeSlotMatchesSection(slot, section, programs = [], academicSessionId = "") {
  const slotSession = idOf(slot?.academicSession);
  const sectionSession = idOf(section?.academicSession) || idOf(academicSessionId);
  if (slotSession && (!sectionSession || slotSession !== sectionSession)) return false;

  const slotProgram = idOf(slot?.program);
  if (slotProgram) {
    const actualProgram = sectionProgramId(section, programs);
    if (!actualProgram || slotProgram !== actualProgram) return false;
  }

  const slotSemester = normalize(slot?.semester);
  if (slotSemester && slotSemester !== normalize(section?.semester)) return false;
  return true;
}

/**
 * Resolve a program/semester date window. A semester-specific row wins over
 * the program-wide (blank semester) default. No other semester is a fallback.
 */
export function resolveProgramCalendar(programDates = [], section, programs = []) {
  const programId = sectionProgramId(section, programs);
  if (!programId) return null;
  const matchingProgramRows = (programDates || []).filter(row => idOf(row?.program) === programId);
  const semester = normalize(section?.semester);
  const exact = matchingProgramRows.find(row => normalize(row?.semester) === semester && semester);
  if (exact) return exact;
  return matchingProgramRows.find(row => !normalize(row?.semester)) || null;
}
