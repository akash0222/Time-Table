import { resolveTimeSlotsForSection } from "./academicCalendar.js";

function idOf(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value._id !== undefined) return String(value._id);
  return String(value);
}

function slotKey(slot) {
  return `${slot.day}|${slot.startTime}-${slot.endTime}`;
}

function maxClockRun(items) {
  const rows = (items || [])
    .map(item => ({
      start: Number(item.start),
      end: Number(item.end),
      duration: Math.max(1, Number(item.duration || 1))
    }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let best = 0;
  let run = 0;
  let previousEnd = null;
  for (const item of rows) {
    if (previousEnd !== null && item.start >= previousEnd && item.start - previousEnd <= 15) {
      run += item.duration;
    } else {
      run = item.duration;
    }
    best = Math.max(best, run);
    previousEnd = item.end;
  }
  return best;
}

function timeToMinutes(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

function calendarWindowsOverlap(a,b){
  const aStart=String(a?.calendarStartDate||a?._calendarStartDate||"");
  const aEnd=String(a?.calendarEndDate||a?._calendarEndDate||"");
  const bStart=String(b?.calendarStartDate||b?._calendarStartDate||"");
  const bEnd=String(b?.calendarEndDate||b?._calendarEndDate||"");
  if(!aStart||!aEnd||!bStart||!bEnd)return true;
  return aStart<=bEnd&&bStart<=aEnd;
}

function normalizeRoomType(value) {
  const v = String(value || "Classroom").trim().toLowerCase();
  if (v === "any") return "Any";
  if (v === "lab" || v === "laboratory") return "Lab";
  return "Classroom";
}

function entrySlots(entry, sectionSlots) {
  const duration = Math.max(1, Number(entry.duration || 1));
  const startOrder = Number(entry.order);
  if (!Number.isFinite(startOrder)) return [];
  const result = [];
  for (let i = 0; i < duration; i += 1) {
    let candidates = (sectionSlots || []).filter(slot =>
      String(slot.day) === String(entry.day) && Number(slot.order) === startOrder + i
    );
    if (i === 0) {
      candidates = candidates.filter(slot => String(slot.startTime) === String(entry.startTime));
    }
    if (i === duration - 1) {
      candidates = candidates.filter(slot => String(slot.endTime) === String(entry.endTime));
    }
    if (!candidates.length) return [];
    result.push(candidates[0]);
  }
  return result;
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
  holidayDates = [],
  academicSessionId = ""
}) {
  const errors = [];
  const warnings = [];

  const facultyMap = new Map(faculty.map(x => [idOf(x), x]));
  const sectionMap = new Map(sections.map(x => [idOf(x), x]));
  const subjectMap = new Map(subjects.map(x => [idOf(x), x]));
  const roomMap = new Map(rooms.map(x => [idOf(x), x]));
  const allConfiguredSlots = (slots || []).filter(x => !x.isBreak);
  const holidayDaySet = new Set(["Sunday", ...(holidayDays || []).map(String)]);
  const holidayDateSet = new Set((holidayDates || []).map(String));

  const facultyBusy = new Map();
  const sectionBusy = new Map();
  const roomBusy = new Map();
  const facultyDayEntries = new Map();
  const sectionDayEntries = new Map();
  const facultyDayEntriesByFaculty = new Map();
  const subjectDayEntries = new Map();
  const facultyClockIntervals = new Map();
  const sectionClockIntervals = new Map();
  const roomClockIntervals = new Map();

  const maxConsecutiveFaculty = Math.max(1, Number(settings.maxConsecutiveFaculty || 2));
  const maxConsecutiveSection = Math.max(1, Number(settings.maxConsecutiveSection || 3));

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

    const sectionSlots = section
      ? resolveTimeSlotsForSection(allConfiguredSlots, section, programs, academicSessionId)
      : [];
    const slotsForEntry = entrySlots(entry, sectionSlots);
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

    const startMinute = timeToMinutes(slotsForEntry[0].startTime);
    const endMinute = timeToMinutes(slotsForEntry.at(-1).endTime);
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
      errors.push(`Invalid clock time range for ${subject?.name || subjectId} on ${entry.day}.`);
      continue;
    }
    const entrySlotKeys = slotsForEntry.map(slotKey);
    const entryWindow = {
      calendarStartDate: entry.calendarStartDate || section?._calendarStartDate || "",
      calendarEndDate: entry.calendarEndDate || section?._calendarEndDate || ""
    };
    const reserveClockInterval = (map, resourceId, label, resourceName) => {
      if (!resourceId) return;
      const key = `${resourceId}|${entry.day}`;
      const previous = map.get(key) || [];
      for (const existing of previous) {
        if (!calendarWindowsOverlap(entryWindow,existing)) continue;
        if (startMinute < existing.end && existing.start < endMinute) {
          const hasSharedPeriodKey = entrySlotKeys.some(slotKeyValue => existing.slotKeys.includes(slotKeyValue));
          if (!hasSharedPeriodKey) {
            errors.push(`${label} time-overlap conflict: ${resourceName || resourceId} on ${entry.day} ${entry.startTime}-${entry.endTime}.`);
          }
        }
      }
      previous.push({start:startMinute,end:endMinute,duration:Math.max(1,Number(entry.duration||1)),slotKeys:entrySlotKeys,...entryWindow});
      map.set(key, previous);
    };
    reserveClockInterval(facultyClockIntervals, facultyId, "Faculty", f?.name);
    reserveClockInterval(sectionClockIntervals, sectionId, "Section", section?.name);
    reserveClockInterval(roomClockIntervals, roomId, "Room", room?.name);

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

    const sectionOrders = sectionSlots.map(slot => Number(slot.order)).filter(Number.isFinite);
    const firstOrder = sectionOrders.length ? Math.min(...sectionOrders) : NaN;
    const lastOrder = sectionOrders.length ? Math.max(...sectionOrders) : NaN;
    if (settings.avoidFirstLastPeriod && slotsForEntry.some(s => Number(s.order) === firstOrder || Number(s.order) === lastOrder)) {
      errors.push(`First/last period is blocked by settings for ${subject?.name || subjectId}.`);
    }

    const reserveBusySlot = (map, resourceId, label, resourceName, key) => {
      if (!resourceId) return;
      const busyKey = `${resourceId}|${key}`;
      const previous = map.get(busyKey) || [];
      if (previous.some(window => calendarWindowsOverlap(entryWindow, window))) {
        errors.push(`${label} conflict: ${resourceName || resourceId} at ${key}.`);
      }
      previous.push(entryWindow);
      map.set(busyKey, previous);
    };

    for (const slot of slotsForEntry) {
      const key = slotKey(slot);
      // Identical weekly clock slots conflict only when their calendar windows overlap.
      // Different semesters can safely reuse faculty or rooms when dates do not overlap.
      reserveBusySlot(facultyBusy, facultyId, "Faculty", f?.name, key);
      reserveBusySlot(sectionBusy, sectionId, "Section", section?.name, key);
      reserveBusySlot(roomBusy, roomId, "Room", room?.name, key);
    }

    const addDayEntry = (map, key, row) => {
      const rows = map.get(key) || [];
      rows.push(row);
      map.set(key, rows);
    };
    const scheduledDay = { day:String(entry.day), count:slotsForEntry.length, window:entryWindow, entry };
    if (facultyId) addDayEntry(facultyDayEntries, facultyId + "|" + entry.day, scheduledDay);
    if (sectionId) addDayEntry(sectionDayEntries, sectionId + "|" + entry.day, scheduledDay);
    if (facultyId) addDayEntry(facultyDayEntriesByFaculty, facultyId, scheduledDay);
    if (subjectId) addDayEntry(subjectDayEntries, subjectId + "|" + entry.day, scheduledDay);

    if (programId && sectionSlots.length) {
      for (const slot of slotsForEntry) {
        if (!slot.program) continue;
        const slotProgramId = idOf(slot.program);
        if (slotProgramId && slotProgramId !== programId) {
          errors.push(`Program-specific slot conflict for ${subject?.name || subjectId}.`);
        }
      }
    }
  }

  const overlappingCount = (rows, target) => rows
    .filter(row => calendarWindowsOverlap(target.window, row.window))
    .reduce((total, row) => total + row.count, 0);

  for (const [key, rows] of facultyDayEntries) {
    const facultyId = key.split("|")[0];
    const facultyMember = facultyMap.get(facultyId);
    const maximum = Number(facultyMember?.maxClassesPerDay || 99);
    if (rows.some(target => overlappingCount(rows, target) > maximum)) {
      errors.push("Faculty " + (facultyMember?.name || facultyId) + " exceeds daily class limit.");
    }
  }

  for (const [facultyId, rows] of facultyDayEntriesByFaculty) {
    const facultyMember = facultyMap.get(facultyId);
    const maximum = Number(facultyMember?.maxWorkingDays || 7);
    const exceeds = rows.some(target => {
      const workingDays = new Set(rows
        .filter(row => calendarWindowsOverlap(target.window, row.window))
        .map(row => row.day));
      return workingDays.size > maximum;
    });
    if (exceeds) errors.push("Faculty " + (facultyMember?.name || facultyId) + " exceeds working-day limit.");
  }

  for (const [key, rows] of sectionDayEntries) {
    const sectionId = key.split("|")[0];
    const section = sectionMap.get(sectionId);
    const maximum = Number(section?.maxClassesPerDay || 99);
    if (rows.some(target => overlappingCount(rows, target) > maximum)) {
      errors.push("Section " + (section?.name || sectionId) + " exceeds daily class limit.");
    }
  }

  if (settings.avoidSameSubjectSameDay !== false) {
    for (const [key, rows] of subjectDayEntries) {
      if (rows.some(target => rows.some(other => other !== target && calendarWindowsOverlap(target.window, other.window)))) {
        const parts = key.split("|");
        const subjectId = parts[0];
        const day = parts.slice(1).join("|");
        const subject = subjectMap.get(subjectId);
        warnings.push("Subject " + (subject?.name || subjectId) + " repeats on " + day + ".");
      }
    }
  }

  const checkClockRunLimits = (resourceIntervals, label, maxAllowed, resourceMap) => {
    for (const [key, intervals] of resourceIntervals) {
      const resourceId = key.split("|")[0];
      const resource = resourceMap.get(resourceId);
      for (const target of intervals) {
        // Different program calendars only interact when their date windows overlap.
        const concurrent = intervals.filter(item => calendarWindowsOverlap(target, item));
        if (maxClockRun(concurrent) > maxAllowed) {
          errors.push(`${label} ${resource?.name || resourceId} exceeds consecutive-class limit.`);
          break;
        }
      }
    }
  };
  checkClockRunLimits(facultyClockIntervals, "Faculty", maxConsecutiveFaculty, facultyMap);
  checkClockRunLimits(sectionClockIntervals, "Section", maxConsecutiveSection, sectionMap);

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
