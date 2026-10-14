function idOf(value) {
  return String(value?._id ?? value ?? "").trim();
}

export function subjectProgramMatchesSection(section, program) {
  if (!section || !program) return true;

  const sectionProgramId = idOf(section.programId);
  if (sectionProgramId) return sectionProgramId === idOf(program._id);

  // Older section records can still store a program name or code instead of
  // the canonical Program reference; preserve compatibility but fail closed
  // when a legacy value clearly points at another program.
  const legacyProgram = String(section.program || "").trim().toLowerCase();
  if (!legacyProgram) return true;
  return legacyProgram === String(program.name || "").trim().toLowerCase()
    || legacyProgram === String(program.code || "").trim().toLowerCase();
}
