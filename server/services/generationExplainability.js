import { resolveTimeSlotsForSection } from "./timetable/academicCalendar.js";

function idOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function roomType(value) {
  const normalized = String(value || "Classroom").trim().toLowerCase();
  if (normalized === "any") return "Any";
  if (normalized === "lab" || normalized === "laboratory") return "Lab";
  return "Classroom";
}

function compatibleRoomExists(subject, section, rooms) {
  const wanted = roomType(subject?.roomType);
  const capacity = Math.max(0, Number(section?.capacity || 0));
  return rooms.some(room =>
    (wanted === "Any" || roomType(room.type) === wanted) &&
    (!capacity || Number(room.capacity || 0) >= capacity)
  );
}

function sectionSlotsFor(subject, sections, slots, programs, academicSessionId) {
  const section = sections.find(item => idOf(item) === idOf(subject?.section));
  return section
    ? resolveTimeSlotsForSection(slots, section, programs, academicSessionId).filter(slot => !slot.isBreak)
    : [];
}

function buildConsecutiveBlocks(slots, duration) {
  const length = Math.max(1, Number(duration || 1));
  const ordered = [...slots].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)) || Number(a.order || 0) - Number(b.order || 0)
  );
  const blocks = [];
  for (let i = 0; i + length <= ordered.length; i += 1) {
    const block = ordered.slice(i, i + length);
    if (block.some(slot => String(slot.day) !== String(block[0].day))) continue;
    if (block.some((slot, index) => index > 0 && Number(slot.order) !== Number(block[index - 1].order) + 1)) continue;
    blocks.push(block);
  }
  return blocks;
}

function unscheduledReason({ subject, section, faculty, rooms, slots, programs, academicSessionId, settings, invalidReasons, timedOut }) {
  if (invalidReasons?.length) return invalidReasons.join("; ");
  if (!section) return "The subject is not mapped to an existing section in the selected scope.";
  if (!faculty) return "The subject is not mapped to an existing faculty member.";
  if (!rooms.length) return "No rooms are configured. Add a room before generating this timetable.";
  if (!compatibleRoomExists(subject, section, rooms)) {
    const wanted = roomType(subject.roomType);
    const capacity = Math.max(0, Number(section.capacity || 0));
    return `No compatible ${wanted === "Any" ? "room" : wanted} is available${capacity ? ` with capacity at least ${capacity}` : ""} for section ${section.name || "—"}.`;
  }

  const scopedSlots = sectionSlotsFor(subject, [section], slots, programs, academicSessionId);
  if (!scopedSlots.length) return "No usable time slots are configured for this section's program, semester and academic session.";
  const blocks = buildConsecutiveBlocks(scopedSlots, subject.duration);
  if (!blocks.length) return `The section has no consecutive block of ${Math.max(1, Number(subject.duration || 1))} period(s) for this subject's duration.`;

  const availableDays = Array.isArray(faculty.availableDays) && faculty.availableDays.length
    ? new Set(faculty.availableDays.map(String))
    : null;
  const unavailable = new Set(Array.isArray(faculty.unavailableSlots) ? faculty.unavailableSlots.map(String) : []);
  const facultyBlocks = blocks.filter(block =>
    (!availableDays || availableDays.has(String(block[0].day))) &&
    block.every(slot => !unavailable.has(`${slot.day}|${slot.startTime}-${slot.endTime}`))
  );
  if (!facultyBlocks.length) return "Faculty availability or unavailable-period rules block every configured time block for this subject.";

  if (settings?.avoidFirstLastPeriod) {
    const orders = scopedSlots.map(slot => Number(slot.order)).filter(Number.isFinite);
    const first = Math.min(...orders);
    const last = Math.max(...orders);
    const nonEdge = facultyBlocks.filter(block => block.every(slot => Number(slot.order) !== first && Number(slot.order) !== last));
    if (!nonEdge.length) return "The avoid-first/last-period setting removes all otherwise available time blocks.";
  }

  if (timedOut) {
    return "The search reached its time limit before it could place this session. This does not prove that no valid placement exists; retry with a longer generation time limit or fewer simultaneous programs.";
  }
  return "No placement remained feasible after combining faculty/section/room conflicts, daily limits and consecutive-class rules. Review the availability matrix, room capacity, section limits and nearby program reservations.";
}

export function buildGenerationReport({
  entries = [],
  subjects = [],
  faculty = [],
  sections = [],
  rooms = [],
  slots = [],
  programs = [],
  settings = {},
  warnings = [],
  validation = null,
  invalidSubjects = [],
  academicSessionId = "",
  scope = {},
  generationRuns = 1,
  generationTimeLimitMs = 0,
  qualityMetrics = null
}) {
  const entryCounts = new Map();
  for (const entry of entries) {
    const key = idOf(entry.subject);
    entryCounts.set(key, (entryCounts.get(key) || 0) + 1);
  }

  const facultyById = new Map(faculty.map(row => [idOf(row), row]));
  const sectionById = new Map(sections.map(row => [idOf(row), row]));
  const subjectById = new Map(subjects.map(row => [idOf(row), row]));
  const roomById = new Map(rooms.map(row => [idOf(row), row]));
  const invalidByName = new Map((invalidSubjects || []).map(item => [
    String(item.name || item.code || ""), item.reasons || []
  ]));
  const timedOut = (warnings || []).some(warning => /time limit|timed out/i.test(String(warning)));

  const requiredSessions = subjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.classesPerWeek || 0)), 0);
  const scheduledSessions = entries.length;
  const unscheduledSessions = Math.max(0, requiredSessions - scheduledSessions);
  const coveragePercent = requiredSessions
    ? Number((scheduledSessions / requiredSessions * 100).toFixed(1))
    : 100;

  const placements = entries.map((entry, index) => {
    const subject = subjectById.get(idOf(entry.subject));
    const section = sectionById.get(idOf(entry.section));
    const assignedFaculty = facultyById.get(idOf(entry.faculty));
    const room = roomById.get(idOf(entry.room));
    const sameSubjectSameDay = entries.some(other =>
      other !== entry && idOf(other.subject) === idOf(entry.subject) && String(other.day) === String(entry.day)
    );
    const preferenceNotes = [];
    if (settings.avoidSameSubjectSameDay && !sameSubjectSameDay) preferenceNotes.push("avoids repeating this subject on the same day");
    if (settings.distributeSubjectAcrossDays) preferenceNotes.push("subject distribution preference was enabled");
    preferenceNotes.push("faculty, section and room conflict rules were considered during candidate search");

    return {
      key: String(entry._id || `${idOf(entry.subject)}-${entry.day}-${entry.startTime}-${index}`),
      day: String(entry.day || ""),
      startTime: String(entry.startTime || ""),
      endTime: String(entry.endTime || ""),
      duration: Math.max(1, Number(entry.duration || 1)),
      order: Number(entry.order || 0),
      subjectId: idOf(entry.subject),
      subject: subject?.name || subject?.code || "Subject",
      sectionId: idOf(entry.section),
      section: [section?.program, section?.semester, section?.name].filter(Boolean).join(" · ") || section?.name || "Section",
      facultyId: idOf(entry.faculty),
      faculty: assignedFaculty?.name || "Faculty",
      roomId: idOf(entry.room),
      room: room?.name || "Room",
      reason: `Selected as a feasible candidate placement. ${preferenceNotes.join("; ")}.`
    };
  }).sort((a, b) =>
    ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(a.day)
      - ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(b.day) ||
    a.startTime.localeCompare(b.startTime) ||
    a.order - b.order
  );

  const unscheduled = subjects.map(subject => {
    const section = sectionById.get(idOf(subject.section));
    const assignedFaculty = facultyById.get(idOf(subject.faculty));
    const required = Math.max(0, Number(subject.classesPerWeek || 0));
    const scheduled = entryCounts.get(idOf(subject)) || 0;
    const missing = Math.max(0, required - scheduled);
    const mappedIssues = [
      !subject.faculty ? "Faculty mapping is missing." : "",
      !subject.section ? "Section mapping is missing." : ""
    ].filter(Boolean);
    const invalidReasons = invalidByName.get(String(subject.name || subject.code || "")) || mappedIssues;
    return {
      subjectId: idOf(subject),
      subject: subject.name || subject.code || "Unnamed subject",
      section: section ? [section.program, section.semester, section.name].filter(Boolean).join(" · ") : "Section not mapped",
      faculty: assignedFaculty?.name || "Faculty not mapped",
      required,
      scheduled,
      missing,
      reason: missing ? unscheduledReason({
        subject, section, faculty: assignedFaculty, rooms, slots, programs,
        academicSessionId, settings, invalidReasons, timedOut
      }) : ""
    };
  }).filter(item => item.missing > 0).sort((a, b) => b.missing - a.missing || a.subject.localeCompare(b.subject));

  const errors = Array.isArray(validation?.errors) ? validation.errors : [];
  const validationWarnings = Array.isArray(validation?.warnings) ? validation.warnings : [];
  const checks = [
    { name: "Faculty / section / subject / room references", status: errors.some(e => /missing faculty|missing section|missing subject|missing room/i.test(e)) ? "FAILED" : "CHECKED", detail: "Every placement must reference configured master data." },
    { name: "Faculty availability", status: errors.some(e => /unavailable/i.test(e)) ? "FAILED" : "CHECKED", detail: "Available days and unavailable periods are considered." },
    { name: "Faculty, section and room conflicts", status: errors.some(e => /conflict|overlap/i.test(e)) ? "FAILED" : "CHECKED", detail: "Overlapping periods and calendar windows are validated." },
    { name: "Room type and capacity", status: errors.some(e => /room type|capacity/i.test(e)) ? "FAILED" : "CHECKED", detail: "Room type and section capacity requirements are validated." },
    { name: "Holiday restrictions", status: errors.some(e => /holiday/i.test(e)) ? "FAILED" : "CHECKED", detail: "Sunday and configured holiday weekdays are excluded." },
    { name: "Consecutive-period and daily-load rules", status: errors.some(e => /consecutive|daily limit|classes per day|first\/last/i.test(e)) ? "FAILED" : "CHECKED", detail: "Configured limits and multi-period blocks are applied during search and validation." }
  ].map(check => ({
    ...check,
    status: check.status === "FAILED" ? "FAILED" : (validation?.valid === true ? "PASSED" : "NOT VERIFIED")
  }));

  return {
    scope,
    summary: {
      requiredSessions,
      scheduledSessions,
      unscheduledSessions,
      coveragePercent,
      subjectCount: subjects.length,
      placementCount: placements.length,
      hardValidation: validation?.valid === true ? "PASSED" : errors.length ? "FAILED" : "NOT VERIFIED",
      hardErrorCount: errors.length,
      warningCount: [...new Set([...(warnings || []), ...validationWarnings])].length,
      generationRuns,
      generationTimeLimitMs
    },
    qualityMetrics: qualityMetrics || null,
    checks,
    placements,
    unscheduled,
    errors: errors.slice(0, 100),
    warnings: [...new Set([...(warnings || []), ...validationWarnings])].slice(0, 100)
  };
}
