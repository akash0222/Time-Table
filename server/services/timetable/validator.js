function idOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function slotKey(slot) {
  return `${slot.day}|${slot.startTime}-${slot.endTime}`;
}

function maxRun(values) {
  const sorted = [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const value of sorted) {
    if (prev !== null && value === prev + 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = value;
  }
  return best;
}

function normalizeRoomType(value) {
  const v = String(value || "Classroom").trim().toLowerCase();
  if (v === "any") return "Any";
  if (v === "lab" || v === "laboratory") return "Lab";
  return "Classroom";
}

function entrySlots(entry, slotMap) {
  const duration = Math.max(1, Number(entry.duration || 1));
  const startOrder = Number(entry.order);
  if (!Number.isFinite(startOrder)) return [];
  const slots = [];
  for (let i = 0; i < duration; i += 1) {
    const key = `${entry.day}|${startOrder + i}`;
    const slot = slotMap.get(key);
    if (!slot) return [];
    slots.push(slot);
  }
  return slots;
}

function resolveProgramId(section, programs) {
  if (!section) return "";
  if (section.programId) return idOf(section.programId);
  const value = String(section.program || "").trim().toLowerCase();
  const match = (programs || []).find(
    p => value === String(p.name || "").trim().toLowerCase() ||
         value === String(p.code || "").trim().toLowerCase()
  );
  return idOf(match);
}

export function validateTimetable({
  entries = [],
  faculty = [],
  sections = [],
  subjects = [],
  rooms = [],
  slots = [],
  programs = [],
  settings = {},
  holidayDays = ["Sunday"],
  holidayDates = []
}) {
  const errors = [];
  const warnings = [];

  const facultyMap = new Map(faculty.map(x => [idOf(x), x]));
  const sectionMap = new Map(sections.map(x => [idOf(x), x]));
  const subjectMap = new Map(subjects.map(x => [idOf(x), x]));
  const roomMap = new Map(rooms.map(x => [idOf(x), x]));
  const slotMap = new Map(slots.filter(x => !x.isBreak).map(x => [`${x.day}|${Number(x.order)}`, x]));
  const holidayDaySet = new Set(["Sunday", ...(holidayDays || []).map(String)]);
  const holidayDateSet = new Set((holidayDates || []).map(String));

  const facultyBusy = new Set();
  const sectionBusy = new Set();
  const roomBusy = new Set();
  const facultyDayCounts = new Map();
  const sectionDayCounts = new Map();
  const facultyDays = new Map();
  const subjectDayCounts = new Map();
  const facultyOrdersByDay = new Map();
  const sectionOrdersByDay = new Map();

  const maxConsecutiveFaculty = Math.max(1, Number(settings.maxConsecutiveFaculty || 2));
  const maxConsecutiveSection = Math.max(1, Number(settings.maxConsecutiveSection || 3));

  const firstOrder = Math.min(...[...slotMap.values()].map(x => Number(x.order)).filter(Number.isFinite));
  const lastOrder = Math.max(...[...slotMap.values()].map(x => Number(x.order)).filter(Number.isFinite));

  for (const entry of entries) {
    const facultyId = idOf(entry.faculty);
    const sectionId = idOf(entry.section);
    const subjectId = idOf(entry.subject);
    const roomId = idOf(entry.room);

    const f = facultyMap.get(facultyId);
    const section = sectionMap.get(sectionId);
    const subject = subjectMap.get(subjectId);
    const room = roomMap.get(roomId);

    if (!f) errors.push(`Entry references missing faculty: ${facultyId}`);
    if (!section) errors.push(`Entry references missing section: ${sectionId}`);
    if (!subject) errors.push(`Entry references missing subject: ${subjectId}`);
    if (!room) errors.push(`Entry references missing room: ${roomId}`);

    const slotsForEntry = entrySlots(entry, slotMap);
    if (!slotsForEntry.length) {
      errors.push(`Invalid slot block for ${subject?.name || subjectId} on ${entry.day}.`);
      continue;
    }

    if (holidayDaySet.has(String(entry.day))) {
      errors.push(`Holiday weekday scheduled: ${entry.day}.`);
    }

    if (entry.date && holidayDateSet.has(String(entry.date))) {
      errors.push(`Holiday date scheduled: ${entry.date}.`);
    }

    const unavailable = new Set(Array.isArray(f?.unavailableSlots) ? f.unavailableSlots : []);
    const availableDays = Array.isArray(f?.availableDays) && f.availableDays.length
      ? new Set(f.availableDays)
      : null;

    if (availableDays && !availableDays.has(String(entry.day))) {
      errors.push(`Faculty ${f.name} is unavailable on ${entry.day}.`);
    }

    if (slotsForEntry.some(slot => unavailable.has(slotKey(slot)))) {
      errors.push(`Faculty ${f?.name || facultyId} is unavailable for ${entry.day} ${entry.startTime}.`);
    }

    const expectedRoomType = normalizeRoomType(subject?.roomType);
    const actualRoomType = normalizeRoomType(room?.type);
    if (room && expectedRoomType !== "Any" && expectedRoomType !== actualRoomType) {
      errors.push(`Room type conflict for ${subject?.name || subjectId}: needs ${expectedRoomType}, got ${actualRoomType}.`);
    }

    const programId = resolveProgramId(section, programs);
    if (room && section?.capacity && room.capacity < section.capacity) {
      errors.push(`Room ${room.name} capacity is below section ${section.name} capacity.`);
    }

    if (settings.avoidFirstLastPeriod && slotsForEntry.some(s => Number(s.order) === firstOrder || Number(s.order) === lastOrder)) {
      errors.push(`First/last period is blocked by settings for ${subject?.name || subjectId}.`);
    }

    for (const slot of slotsForEntry) {
      const key = slotKey(slot);
      if (facultyBusy.has(`${facultyId}|${key}`)) errors.push(`Faculty conflict: ${f?.name || facultyId} at ${key}.`);
      if (sectionBusy.has(`${sectionId}|${key}`)) errors.push(`Section conflict: ${section?.name || sectionId} at ${key}.`);
      if (roomBusy.has(`${roomId}|${key}`)) errors.push(`Room conflict: ${room?.name || roomId} at ${key}.`);

      facultyBusy.add(`${facultyId}|${key}`);
      sectionBusy.add(`${sectionId}|${key}`);
      roomBusy.add(`${roomId}|${key}`);
    }

    const facultyDayKey = `${facultyId}|${entry.day}`;
    const sectionDayKey = `${sectionId}|${entry.day}`;
    const subjectDayKey = `${subjectId}|${entry.day}`;

    facultyDayCounts.set(facultyDayKey, (facultyDayCounts.get(facultyDayKey) || 0) + slotsForEntry.length);
    sectionDayCounts.set(sectionDayKey, (sectionDayCounts.get(sectionDayKey) || 0) + slotsForEntry.length);
    subjectDayCounts.set(subjectDayKey, (subjectDayCounts.get(subjectDayKey) || 0) + 1);

    if (!facultyDays.has(facultyId)) facultyDays.set(facultyId, new Set());
    facultyDays.get(facultyId).add(entry.day);

    if (!facultyOrdersByDay.has(facultyDayKey)) facultyOrdersByDay.set(facultyDayKey, []);
    if (!sectionOrdersByDay.has(sectionDayKey)) sectionOrdersByDay.set(sectionDayKey, []);

    const expandedOrders = slotsForEntry.map(x => Number(x.order));
    facultyOrdersByDay.get(facultyDayKey).push(...expandedOrders);
    sectionOrdersByDay.get(sectionDayKey).push(...expandedOrders);

    if (subjectDayCounts.get(subjectDayKey) > 1 && settings.avoidSameSubjectSameDay !== false) {
      warnings.push(`Subject ${subject?.name || subjectId} repeats on ${entry.day}.`);
    }

    if (programId && slotMap.size) {
      for (const slot of slotsForEntry) {
        if (!slot.program) continue;
        const slotProgramId = idOf(slot.program);
        if (slotProgramId && slotProgramId !== programId) {
          errors.push(`Program-specific slot conflict for ${subject?.name || subjectId}.`);
        }
      }
    }
  }

  for (const [key, count] of facultyDayCounts) {
    const facultyId = key.split("|")[0];
    const facultyMember = facultyMap.get(facultyId);
    if (count > Number(facultyMember?.maxClassesPerDay || 99)) {
      errors.push(`Faculty ${facultyMember?.name || facultyId} exceeds daily class limit.`);
    }
  }

  for (const [facultyId, days] of facultyDays) {
    const facultyMember = facultyMap.get(facultyId);
    if (days.size > Number(facultyMember?.maxWorkingDays || 7)) {
      errors.push(`Faculty ${facultyMember?.name || facultyId} exceeds working-day limit.`);
    }
  }

  for (const [key, count] of sectionDayCounts) {
    const sectionId = key.split("|")[0];
    const section = sectionMap.get(sectionId);
    if (count > Number(section?.maxClassesPerDay || 99)) {
      errors.push(`Section ${section?.name || sectionId} exceeds daily class limit.`);
    }
  }

  for (const [key, orders] of facultyOrdersByDay) {
    const facultyId = key.split("|")[0];
    const facultyMember = facultyMap.get(facultyId);
    if (maxRun(orders) > Number(facultyMember ? maxConsecutiveFaculty : maxConsecutiveFaculty)) {
      errors.push(`Faculty ${facultyMember?.name || facultyId} exceeds consecutive-class limit.`);
    }
  }

  for (const [key, orders] of sectionOrdersByDay) {
    const sectionId = key.split("|")[0];
    const section = sectionMap.get(sectionId);
    if (maxRun(orders) > Number(section ? maxConsecutiveSection : maxConsecutiveSection)) {
      errors.push(`Section ${section?.name || sectionId} exceeds consecutive-class limit.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    stats: {
      entries: entries.length,
      hardErrors: new Set(errors).size,
      warnings: new Set(warnings).size
    }
  };
}
