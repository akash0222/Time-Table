import { resolveProgramCalendar, resolveTimeSlotsForSection } from "./timetable/academicCalendar.js";
import { validateTimetable } from "./timetable/validator.js";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const norm = value => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const idOf = value => value == null ? "" : String(value?._id ?? value);

const FIELD_ALIASES = {
  programCode: ["program code", "programme code"],
  program: ["program", "program name", "programme", "programme name"],
  semester: ["semester", "term"],
  section: ["section", "section name", "section code"],
  day: ["day", "weekday"],
  startTime: ["start time", "start", "from"],
  endTime: ["end time", "end", "to"],
  duration: ["duration", "periods", "consecutive periods", "duration periods"],
  subjectCode: ["subject code", "course code"],
  subject: ["subject", "subject name", "course", "course name"],
  facultyCode: ["faculty code", "staff code", "employee code"],
  faculty: ["faculty", "faculty name", "teacher", "teacher name"],
  room: ["room", "room name", "room no", "room number", "classroom"]
};

function field(row, key) {
  const aliases = new Set(FIELD_ALIASES[key] || [key]);
  for (const [name, value] of Object.entries(row || {})) {
    if (aliases.has(norm(name))) return value;
  }
  return "";
}

function programForSection(section, programs) {
  const programId = idOf(section?.programId);
  if (programId) return (programs || []).find(program => idOf(program) === programId) || null;
  const legacy = norm(section?.program);
  return (programs || []).find(program => legacy && (
    legacy === norm(program.name) || legacy === norm(program.code)
  )) || null;
}

function uniqueMatch(items, predicate, label, rowNumber, errors) {
  const matches = (items || []).filter(predicate);
  if (matches.length === 1) return matches[0];
  if (!matches.length) errors.push(`Row ${rowNumber}: ${label} does not match an existing academic master record.`);
  else errors.push(`Row ${rowNumber}: ${label} matches more than one master record. Add a unique code to the Excel row.`);
  return null;
}

export function normalizeClockTime(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1) {
    const minutes = Math.round(value * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = String(match[3] || "").toUpperCase();
  if (hours > 23 || minutes > 59) return "";
  if (meridiem) {
    if (hours < 1 || hours > 12) return "";
    hours = hours % 12 + (meridiem === "PM" ? 12 : 0);
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resolveSlotBlock(sectionSlots, day, startTime, endTime, requestedDuration, defaultDuration) {
  const daySlots = (sectionSlots || [])
    .filter(slot => slot.day === day && !slot.isBreak)
    .sort((a, b) => Number(a.order) - Number(b.order));
  const startIndex = daySlots.findIndex(slot => normalizeClockTime(slot.startTime) === startTime);
  if (startIndex < 0) return { error: `No configured time slot starts at ${startTime} on ${day} for this section.` };

  let duration = requestedDuration ? Number(requestedDuration) : Number(defaultDuration || 1);
  if (!Number.isInteger(duration) || duration < 1 || duration > 3) {
    return { error: "Duration must be a whole number between 1 and 3 periods." };
  }
  let block = daySlots.slice(startIndex, startIndex + duration);
  if (block.length !== duration || normalizeClockTime(block.at(-1)?.endTime) !== endTime) {
    if (requestedDuration) {
      return { error: `The ${duration}-period block beginning at ${startTime} does not end at ${endTime} in this section's configured timetable.` };
    }
    // When Duration is blank, infer it from the exact end time in the next
    // one-to-three consecutive configured periods.
    const inferred = [1, 2, 3].find(length => {
      const candidate = daySlots.slice(startIndex, startIndex + length);
      return candidate.length === length && normalizeClockTime(candidate.at(-1)?.endTime) === endTime;
    });
    if (!inferred) return { error: `No configured consecutive period block runs from ${startTime} to ${endTime} on ${day}.` };
    duration = inferred;
    block = daySlots.slice(startIndex, startIndex + duration);
  }
  for (let index = 1; index < block.length; index += 1) {
    if (Number(block[index].order) !== Number(block[index - 1].order) + 1) {
      return { error: "The selected periods are not consecutive in the configured timetable." };
    }
  }
  return { block, duration, order: Number(block[0].order) };
}

/**
 * Resolve rows from a manual timetable workbook against existing academic
 * masters, then run the same hard timetable validator used by generation.
 * This function is pure and is covered by unit tests.
 */
export function mapManualTimetableRows({
  rows = [],
  session,
  faculty = [],
  sections = [],
  programs = [],
  subjects = [],
  rooms = [],
  slots = [],
  settings = {}
}) {
  const errors = [];
  const warnings = [];
  const entries = [];
  const previewRows = [];
  const duplicateKeys = new Set();
  const sessionId = idOf(session);
  const activePrograms = (programs || []).filter(program => program.active !== false);
  const sectionMap = new Map();
  const sectionSlots = new Map();
  const sectionProgramMap = new Map();

  if (!sessionId) errors.push("Select a valid academic session.");
  if (!Array.isArray(rows) || rows.length === 0) errors.push("The Timetable worksheet contains no data rows.");
  if (rows.length > 2000) errors.push("A timetable upload may contain at most 2,000 data rows.");

  for (const section of sections || []) {
    const program = programForSection(section, activePrograms);
    if (!program) {
      errors.push(`Section ${section.name || idOf(section)} is not linked to an active Program. Correct Program & Section Mapping before importing.`);
      continue;
    }
    const calendar = resolveProgramCalendar(session?.programDates || [], section, activePrograms);
    if ((session?.programDates || []).length && !calendar) {
      errors.push(`No academic calendar is configured for ${program.name} · ${section.semester} · ${section.name}.`);
      continue;
    }
    const startDate = calendar?.startDate || session?.startDate || null;
    const endDate = calendar?.endDate || session?.endDate || null;
    const scopedSection = {
      ...section,
      _calendarStartDate: startDate ? new Date(startDate).toISOString().slice(0, 10) : "",
      _calendarEndDate: endDate ? new Date(endDate).toISOString().slice(0, 10) : ""
    };
    sectionMap.set(idOf(section), scopedSection);
    sectionProgramMap.set(idOf(section), program);
    sectionSlots.set(idOf(section), resolveTimeSlotsForSection(slots, scopedSection, activePrograms, sessionId).filter(slot => !slot.isBreak));
  }

  for (const [index, row] of (rows || []).entries()) {
    const rowNumber = Number(row?.rowNumber || index + 2);
    const rowErrors = [];
    const programCode = String(field(row, "programCode") || "").trim();
    const programName = String(field(row, "program") || "").trim();
    const semester = String(field(row, "semester") || "").trim();
    const sectionName = String(field(row, "section") || "").trim();
    const dayInput = String(field(row, "day") || "").trim();
    const day = DAYS.find(value => norm(value) === norm(dayInput)) || "";
    const startTime = normalizeClockTime(field(row, "startTime"));
    const endTime = normalizeClockTime(field(row, "endTime"));
    const subjectCode = String(field(row, "subjectCode") || "").trim();
    const subjectName = String(field(row, "subject") || "").trim();
    const facultyCode = String(field(row, "facultyCode") || "").trim();
    const facultyName = String(field(row, "faculty") || "").trim();
    const roomName = String(field(row, "room") || "").trim();
    const durationInput = field(row, "duration");

    if ((!programCode && !programName) || !semester || !sectionName || !day || !startTime || !endTime || (!subjectCode && !subjectName) || (!facultyCode && !facultyName) || !roomName) {
      rowErrors.push("Required columns are Program (Code or Name), Semester, Section, Day, Start Time, End Time, Subject (Code or Name), Faculty (Code or Name), and Room.");
    }
    if (dayInput && !day) rowErrors.push(`Invalid day "${dayInput}". Use Monday through Sunday.`);
    if (field(row, "startTime") && !startTime) rowErrors.push("Start Time is invalid. Use 24-hour time such as 09:00.");
    if (field(row, "endTime") && !endTime) rowErrors.push("End Time is invalid. Use 24-hour time such as 10:00.");

    let program = null;
    if (!rowErrors.length) {
      program = uniqueMatch(activePrograms, item =>
        (!programCode || norm(item.code) === norm(programCode)) &&
        (!programName || norm(item.name) === norm(programName)),
      "Program Code/Name", rowNumber, rowErrors);
    }
    let section = null;
    if (program) {
      section = uniqueMatch((sections || []).filter(item => idOf(item.academicSession) === sessionId), item =>
        idOf(sectionProgramMap.get(idOf(item))) === idOf(program) &&
        norm(item.semester) === norm(semester) &&
        norm(item.name) === norm(sectionName),
      `Section ${sectionName} in ${program.name} · ${semester}`, rowNumber, rowErrors);
    }
    let subject = null;
    if (section && (subjectCode || subjectName)) {
      subject = uniqueMatch((subjects || []).filter(item =>
        idOf(item.section) === idOf(section) &&
        (!item.academicSession || idOf(item.academicSession) === sessionId) &&
        item.active !== false
      ), item =>
        (!subjectCode || norm(item.code) === norm(subjectCode)) &&
        (!subjectName || norm(item.name) === norm(subjectName)),
      "Subject Code/Name", rowNumber, rowErrors);
    }
    let facultyMember = null;
    if (facultyCode || facultyName) {
      facultyMember = uniqueMatch(faculty, item =>
        (!facultyCode || norm(item.code) === norm(facultyCode)) &&
        (!facultyName || norm(item.name) === norm(facultyName)),
      "Faculty Code/Name", rowNumber, rowErrors);
    }
    let room = null;
    if (roomName) {
      room = uniqueMatch(rooms, item => norm(item.name) === norm(roomName), `Room "${roomName}"`, rowNumber, rowErrors);
    }

    if (subject && facultyMember && idOf(subject.faculty) !== idOf(facultyMember)) {
      rowErrors.push(`Faculty "${facultyMember.name}" does not match the faculty mapped to subject "${subject.name}". Update Subject & Faculty Mapping or correct the Excel row.`);
    }

    let blockInfo = null;
    if (section && day && startTime && endTime && !rowErrors.length) {
      blockInfo = resolveSlotBlock(sectionSlots.get(idOf(section)), day, startTime, endTime, durationInput, subject?.duration);
      if (blockInfo.error) rowErrors.push(`Row ${rowNumber}: ${blockInfo.error}`);
    } else if (section && day && startTime && endTime && rowErrors.length === 0) {
      blockInfo = resolveSlotBlock(sectionSlots.get(idOf(section)), day, startTime, endTime, durationInput, subject?.duration);
      if (blockInfo.error) rowErrors.push(`Row ${rowNumber}: ${blockInfo.error}`);
    }

    if (rowErrors.length) {
      errors.push(...rowErrors.filter(message => !String(message).startsWith(`Row ${rowNumber}:`)).map(message => `Row ${rowNumber}: ${message}`));
      continue;
    }

    const scopedSection = sectionMap.get(idOf(section));
    const key = [idOf(section), idOf(subject), day, startTime].join("|");
    if (duplicateKeys.has(key)) {
      errors.push(`Row ${rowNumber}: Duplicate timetable row for ${subject.name} · ${section.name} · ${day} ${startTime}.`);
      continue;
    }
    duplicateKeys.add(key);
    const entry = {
      day,
      startTime,
      endTime,
      order: blockInfo.order,
      duration: blockInfo.duration,
      section: section._id,
      subject: subject._id,
      faculty: facultyMember._id,
      room: room._id,
      calendarStartDate: scopedSection?._calendarStartDate || "",
      calendarEndDate: scopedSection?._calendarEndDate || ""
    };
    entries.push(entry);
    previewRows.push({
      rowNumber,
      program: program.name,
      semester: section.semester,
      section: section.name,
      day,
      startTime,
      endTime,
      subject: subject.name,
      faculty: facultyMember.name,
      room: room.name
    });
  }

  const requiredSessions = (subjects || []).filter(subject => subject.active !== false &&
    (!subject.academicSession || idOf(subject.academicSession) === sessionId) &&
    sectionMap.has(idOf(subject.section))
  ).reduce((total, subject) => total + Math.max(0, Number(subject.classesPerWeek || 0)), 0);
  const counts = new Map();
  for (const entry of entries) counts.set(idOf(entry.subject), (counts.get(idOf(entry.subject)) || 0) + 1);
  const coverageErrors = [];
  for (const subject of subjects || []) {
    if (subject.active === false || (subject.academicSession && idOf(subject.academicSession) !== sessionId) || !sectionMap.has(idOf(subject.section))) continue;
    const required = Math.max(0, Number(subject.classesPerWeek || 0));
    const scheduled = counts.get(idOf(subject)) || 0;
    if (scheduled < required) coverageErrors.push(`${subject.name} · ${sectionMap.get(idOf(subject.section))?.name || "Section"}: ${scheduled}/${required} weekly classes imported (${required - scheduled} missing).`);
    if (scheduled > required) coverageErrors.push(`${subject.name} · ${sectionMap.get(idOf(subject.section))?.name || "Section"}: ${scheduled}/${required} weekly classes imported (${scheduled - required} extra).`);
  }
  errors.push(...coverageErrors.map(message => `Coverage: ${message}`));

  const validation = validateTimetable({
    entries,
    faculty,
    sections: [...sectionMap.values()],
    subjects: (subjects || []).filter(subject => sectionMap.has(idOf(subject.section))),
    rooms,
    slots,
    programs: activePrograms,
    settings,
    academicSessionId: sessionId,
    holidayDays: settings?.holidayDays || ["Sunday"]
  });
  errors.push(...(validation.errors || []).map(message => `Validation: ${message}`));
  warnings.push(...(validation.warnings || []));
  const programIds = [...new Set([...sectionProgramMap.values()].map(idOf).filter(Boolean))];
  const programNames = activePrograms.filter(program => programIds.includes(idOf(program))).map(program => program.name);

  return {
    entries,
    rows: previewRows,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    validation,
    requiredSessions,
    scheduledSessions: entries.length,
    unscheduledSessions: Math.max(0, requiredSessions - entries.length),
    programIds,
    programNames
  };
}
