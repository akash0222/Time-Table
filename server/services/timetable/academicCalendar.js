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
 * Resolve the effective clock schedule for a section.
 *
 * A more-specific schedule is a complete replacement for its broader fallback,
 * not an additional set of periods. This prevents a BBA section configured for
 * 09:30 starts from also receiving the shared default 09:00 periods.
 *
 * Precedence: selected-session + program + semester, selected-session + program,
 * selected-session shared default, then equivalent cross-session defaults.
 */
export function resolveTimeSlotsForSection(slots = [], section, programs = [], academicSessionId = "") {
  const sessionId = idOf(academicSessionId) || idOf(section?.academicSession);
  const programId = sectionProgramId(section, programs);
  const semester = normalize(section?.semester);
  const candidates = (slots || []).filter(slot => {
    const slotSession = idOf(slot?.academicSession);
    if (slotSession && (!sessionId || slotSession !== sessionId)) return false;
    const slotProgram = idOf(slot?.program);
    if (slotProgram && (!programId || slotProgram !== programId)) return false;
    const slotSemester = normalize(slot?.semester);
    if (slotSemester && slotSemester !== semester) return false;
    return true;
  });

  const has = predicate => candidates.some(predicate);
  const exactSession = slot => sessionId && idOf(slot?.academicSession) === sessionId;
  const globalSession = slot => !idOf(slot?.academicSession);
  const exactProgram = slot => programId && idOf(slot?.program) === programId;
  const globalProgram = slot => !idOf(slot?.program);
  const exactSemester = slot => semester && normalize(slot?.semester) === semester;
  const programDefault = slot => !normalize(slot?.semester);

  const scopes = [
    slot => exactSession(slot) && exactProgram(slot) && exactSemester(slot),
    slot => exactSession(slot) && exactProgram(slot) && programDefault(slot),
    slot => exactSession(slot) && globalProgram(slot) && programDefault(slot),
    slot => globalSession(slot) && exactProgram(slot) && exactSemester(slot),
    slot => globalSession(slot) && exactProgram(slot) && programDefault(slot),
    slot => globalSession(slot) && globalProgram(slot) && programDefault(slot)
  ];
  for (const scope of scopes) {
    if (has(scope)) return candidates.filter(scope);
  }
  return [];
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
