const idOf = value => String(value?._id ?? value ?? "");

export function canAccessAttendanceEntry(role, assignment, entry) {
  if (role === "ADMIN" || role === "SCHEDULER") return true;
  if (role === "FACULTY") {
    return Boolean(assignment?.faculty) && idOf(assignment.faculty) === idOf(entry?.faculty);
  }
  if (role === "VIEWER") {
    return Boolean(assignment?.section) && idOf(assignment.section) === idOf(entry?.section);
  }
  return false;
}

export function canAccessAttendanceStudent(role, assignment, student, timetableEntries = []) {
  if (role === "ADMIN" || role === "SCHEDULER") return true;
  const studentSection = idOf(student?.section);
  if (!studentSection) return false;
  if (role === "VIEWER") {
    return Boolean(assignment?.section) && idOf(assignment.section) === studentSection;
  }
  if (role === "FACULTY") {
    const facultyId = idOf(assignment?.faculty);
    return Boolean(facultyId) && timetableEntries.some(entry =>
      idOf(entry?.faculty) === facultyId && idOf(entry?.section) === studentSection
    );
  }
  return false;
}

export function canAccessAttendanceSection(role, assignment, sectionId, timetableEntries = []) {
  if (role === "ADMIN" || role === "SCHEDULER") return true;
  const targetSectionId = idOf(sectionId);
  if (!targetSectionId) return false;
  if (role === "VIEWER") {
    return Boolean(assignment?.section) && idOf(assignment.section) === targetSectionId;
  }
  if (role === "FACULTY") {
    const facultyId = idOf(assignment?.faculty);
    return Boolean(facultyId) && timetableEntries.some(entry =>
      idOf(entry?.faculty) === facultyId && idOf(entry?.section) === targetSectionId
    );
  }
  return false;
}
