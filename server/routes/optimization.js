import express from "express";
import Timetable from "../models/Timetable.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import Section from "../models/Section.js";
import Room from "../models/Room.js";
import TimeSlot from "../models/TimeSlot.js";
import SchedulerSetting from "../models/SchedulerSetting.js";
import AcademicSession from "../models/AcademicSession.js";
import Program from "../models/Program.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import { resolveProgramCalendar, resolveTimeSlotsForSection } from "../services/timetable/academicCalendar.js";

const router = express.Router();
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const norm = value => String(value ?? "").trim().toLowerCase();
const id = value => String(value?._id ?? value ?? "");

function calendarWindowsOverlap(a, b) {
  const aStart = String(a?.calendarStartDate || a?._calendarStartDate || "");
  const aEnd = String(a?.calendarEndDate || a?._calendarEndDate || "");
  const bStart = String(b?.calendarStartDate || b?._calendarStartDate || "");
  const bEnd = String(b?.calendarEndDate || b?._calendarEndDate || "");
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart <= bEnd && bStart <= aEnd;
}

function slotBlocks(slots, day, startOrder, duration) {
  const length = Math.max(1, Number(duration || 1));
  const ordered = (slots || [])
    .filter(slot => slot.day === day && !slot.isBreak)
    .sort((a, b) => Number(a.order) - Number(b.order));
  const index = ordered.findIndex(slot => Number(slot.order) === Number(startOrder));
  if (index < 0) return [];
  const block = ordered.slice(index, index + length);
  if (block.length !== length) return [];
  for (let i = 1; i < block.length; i += 1) {
    if (Number(block[i].order) !== Number(block[i - 1].order) + 1) return [];
  }
  return block;
}

function overlaps(a, b) {
  if (a.day !== b.day || !calendarWindowsOverlap(a, b)) return false;
  const aStart = Number(a.order || 0);
  const aEnd = aStart + Math.max(1, Number(a.duration || 1));
  const bStart = Number(b.order || 0);
  const bEnd = bStart + Math.max(1, Number(b.duration || 1));
  return aStart < bEnd && bStart < aEnd;
}

function maxRun(entries, field, ownerId, day, targetWindow = null) {
  const orders = [];
  for (const entry of entries || []) {
    if (id(entry[field]) !== String(ownerId) || entry.day !== day) continue;
    if (targetWindow && !calendarWindowsOverlap(targetWindow, entry)) continue;
    for (let index = 0; index < Math.max(1, Number(entry.duration || 1)); index += 1) {
      orders.push(Number(entry.order || 0) + index);
    }
  }
  const unique = [...new Set(orders)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = null;
  for (const order of unique) {
    run = previous !== null && order === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = order;
  }
  return best;
}

function availableFaculty(faculty, day, block) {
  const allowed = Array.isArray(faculty?.availableDays)
    ? faculty.availableDays.map(norm).filter(Boolean)
    : [];
  if (allowed.length && !allowed.includes(norm(day))) return false;
  const unavailable = new Set((faculty?.unavailableSlots || []).map(slot =>
    `${norm(slot.day)}|${slot.startTime}-${slot.endTime}`
  ));
  return !(block || []).some(slot =>
    unavailable.has(`${norm(slot.day)}|${slot.startTime}-${slot.endTime}`)
  );
}

function normalizedRoomType(value) {
  const type = norm(value || "Classroom");
  if (type === "any") return "any";
  if (type === "lab" || type === "laboratory") return "lab";
  return "classroom";
}

/**
 * Generate candidates only from the already-resolved slot calendar for the
 * specific section. This prevents cross-session/program/semester slot leakage.
 */
export function candidateFor(
  entry,
  subject,
  faculty,
  section,
  rooms,
  sectionSlots,
  entries,
  settings,
  { holidayDays = ["Sunday"], limit = 8 } = {}
) {
  if (!subject || !faculty || !section || !Array.isArray(sectionSlots) || !sectionSlots.length) return [];

  const wantedRoomType = normalizedRoomType(subject.roomType || "Classroom");
  const sectionCapacity = Math.max(0, Number(section.capacity || 0));
  const matchingRooms = (rooms || []).filter(room => {
    const roomMatchesType = wantedRoomType === "any" || normalizedRoomType(room.type) === wantedRoomType;
    const roomMatchesCapacity = !sectionCapacity || Number(room.capacity || 0) >= sectionCapacity;
    return roomMatchesType && roomMatchesCapacity;
  });
  if (!matchingRooms.length) return [];

  const originalRoom = id(entry?.room);
  const baseEntry = entry || {
    faculty: faculty._id,
    section: section._id,
    subject: subject._id,
    duration: subject.duration || 1,
    calendarStartDate: section._calendarStartDate || "",
    calendarEndDate: section._calendarEndDate || ""
  };
  const targetWindow = {
    calendarStartDate: baseEntry.calendarStartDate || section._calendarStartDate || "",
    calendarEndDate: baseEntry.calendarEndDate || section._calendarEndDate || ""
  };
  const others = (entries || []).filter(row => id(row) !== id(entry));
  const blockedDays = new Set(["Sunday", ...(holidayDays || []).map(String)]);
  const candidateDays = [...new Set(sectionSlots.map(slot => String(slot.day)))]
    .filter(day => !blockedDays.has(day))
    .sort((a, b) => days.indexOf(a) - days.indexOf(b));
  const result = [];
  const duration = Math.max(1, Number(entry?.duration || subject.duration || 1));
  const maxFacultyDaily = Math.max(1, Number(faculty.maxClassesPerDay || 99));
  const maxSectionDaily = Math.max(1, Number(section.maxClassesPerDay || 99));
  const maxFacultyWorkingDays = Math.max(1, Number(faculty.maxWorkingDays || 7));
  const maxConsecutiveFaculty = Math.max(1, Number(settings?.maxConsecutiveFaculty || 2));
  const maxConsecutiveSection = Math.max(1, Number(settings?.maxConsecutiveSection || 3));

  for (const day of candidateDays) {
    if (!availableFaculty(faculty, day, sectionSlots.filter(slot => slot.day === day))) continue;
    const daySlots = sectionSlots.filter(slot => slot.day === day).sort((a, b) => Number(a.order) - Number(b.order));
    for (const slot of daySlots) {
      const block = slotBlocks(sectionSlots, day, slot.order, duration);
      if (!block.length || !availableFaculty(faculty, day, block)) continue;
      const fake = {
        ...baseEntry,
        day,
        order: Number(block[0].order),
        startTime: block[0].startTime,
        endTime: block.at(-1).endTime,
        duration: block.length,
        ...targetWindow
      };

      if (others.some(row => overlaps(fake, row) && id(row.faculty) === id(faculty))) continue;
      if (others.some(row => overlaps(fake, row) && id(row.section) === id(section))) continue;

      const facultyDayLoad = others
        .filter(row => id(row.faculty) === id(faculty) && row.day === day && calendarWindowsOverlap(fake, row))
        .reduce((sum, row) => sum + Math.max(1, Number(row.duration || 1)), 0);
      if (facultyDayLoad + block.length > maxFacultyDaily) continue;

      const sectionDayLoad = others
        .filter(row => id(row.section) === id(section) && row.day === day && calendarWindowsOverlap(fake, row))
        .reduce((sum, row) => sum + Math.max(1, Number(row.duration || 1)), 0);
      if (sectionDayLoad + block.length > maxSectionDaily) continue;

      const facultyDays = new Set(others
        .filter(row => id(row.faculty) === id(faculty) && calendarWindowsOverlap(fake, row))
        .map(row => row.day));
      facultyDays.add(day);
      if (facultyDays.size > maxFacultyWorkingDays) continue;

      const proposed = [...others, fake];
      if (maxRun(proposed, "faculty", faculty._id, day, fake) > maxConsecutiveFaculty) continue;
      if (maxRun(proposed, "section", section._id, day, fake) > maxConsecutiveSection) continue;

      if (settings?.avoidSameSubjectSameDay !== false && others.some(row =>
        id(row.subject) === id(subject) && row.day === day && calendarWindowsOverlap(fake, row)
      )) continue;

      const availableRooms = matchingRooms.filter(room =>
        !others.some(row => id(row.room) === id(room) && overlaps(fake, row))
      );
      if (!availableRooms.length) continue;
      const room = availableRooms.find(candidate => id(candidate) === originalRoom) || availableRooms[0];
      const originalDayIndex = days.indexOf(entry?.day);
      const candidateDayIndex = days.indexOf(day);
      const distance = Math.abs(Number(entry?.order || 0) - Number(block[0].order))
        + Math.abs((originalDayIndex < 0 ? candidateDayIndex : originalDayIndex) - candidateDayIndex);
      let score = 100 - distance * 5;
      if (day === entry?.day) score += 15;
      if (id(room) === originalRoom) score += 10;
      result.push({
        day,
        startTime: block[0].startTime,
        endTime: block.at(-1).endTime,
        order: Number(block[0].order),
        duration: block.length,
        roomId: room._id,
        room: room.name,
        score
      });
      if (result.length >= limit * 3) break;
    }
    if (result.length >= limit * 3) break;
  }
  return result.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function context(requestedSessionId = "") {
  const session = requestedSessionId
    ? await AcademicSession.findById(requestedSessionId).lean()
    : await AcademicSession.findOne({ active: true }).lean();
  if (!session) {
    return {
      session: null, timetable: null, entries: [], faculty: [], subjects: [], sections: [],
      rooms: [], slots: [], programs: [], settings: {}, holidayDays: ["Sunday"], sectionSlots: new Map()
    };
  }

  const sessionId = String(session._id);
  let settings = await SchedulerSetting.findOne({ key: "default" }).lean();
  const override = settings?.sessionOverrides?.find(row => String(row.academicSession) === sessionId);
  if (override) settings = { ...settings, ...override };
  settings ||= {};
  const holidayDays = [...new Set(["Sunday", ...(settings.holidayDays || [])].map(String))];

  const [timetable, faculty, rawSections, rooms, allSlots, programs, subjectRows] = await Promise.all([
    Timetable.findOne({ academicSession: session._id, isCurrent: true }).sort({ version: -1 }),
    Faculty.find().lean(),
    Section.find({ $or: [{ academicSession: session._id }, { academicSession: null }] }).lean(),
    Room.find().lean(),
    TimeSlot.find({ $or: [{ academicSession: session._id }, { academicSession: null }] }).sort({ day: 1, order: 1 }).lean(),
    Program.find({ active: { $ne: false } }).lean(),
    Subject.find({ $or: [{ academicSession: session._id }, { academicSession: null }], active: { $ne: false } }).lean()
  ]);

  const sections = rawSections.map(section => {
    const calendar = resolveProgramCalendar(session.programDates || [], section, programs);
    const start = calendar?.startDate || session.startDate || null;
    const end = calendar?.endDate || session.endDate || null;
    return {
      ...section,
      _calendarStartDate: start ? new Date(start).toISOString().slice(0, 10) : "",
      _calendarEndDate: end ? new Date(end).toISOString().slice(0, 10) : ""
    };
  });
  const sectionMap = new Map(sections.map(section => [id(section), section]));
  const sectionSlots = new Map(sections.map(section => [
    id(section),
    resolveTimeSlotsForSection(allSlots, section, programs, sessionId)
      .filter(slot => !slot.isBreak && !holidayDays.includes(String(slot.day)))
  ]));
  const subjects = subjectRows.filter(subject => sectionMap.has(id(subject.section)));
  const facultyMap = new Map(faculty.map(row => [id(row), row]));
  const subjectMap = new Map(subjects.map(subject => [id(subject), subject]));
  const entries = (timetable?.entries || []).map(entry => {
    const row = typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
    const section = sectionMap.get(id(row.section));
    return {
      ...row,
      calendarStartDate: row.calendarStartDate || section?._calendarStartDate || "",
      calendarEndDate: row.calendarEndDate || section?._calendarEndDate || ""
    };
  });

  return {
    session, sessionId, timetable, entries, faculty, facultyMap, subjects, subjectMap,
    sections, sectionMap, rooms, slots: allSlots, programs, settings, holidayDays, sectionSlots
  };
}

function buildOptimizationReport(c) {
  if (!c.timetable) {
    return {
      hasTimetable: false,
      scope: { academicSessionId: c.session ? id(c.session) : "", academicSessionName: c.session?.name || "" },
      suggestions: [],
      summary: { issues: 0, suggestions: 0 }
    };
  }
  const entries = c.entries || [];
  const facultyMap = c.facultyMap || new Map(c.faculty.map(row => [id(row), row]));
  const sectionMap = c.sectionMap || new Map(c.sections.map(row => [id(row), row]));
  const subjectMap = c.subjectMap || new Map(c.subjects.map(row => [id(row), row]));
  const suggestions = [];
  const issueKeys = new Set();

  const add = (type, entry, subject, reason) => {
    const key = `${type}|${id(entry) || id(subject)}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    const faculty = facultyMap.get(id(subject?.faculty || entry?.faculty));
    const section = sectionMap.get(id(subject?.section || entry?.section));
    if (!faculty || !section || !subject) return;
    const scopedSlots = c.sectionSlots.get(id(section)) || [];
    const targetEntry = entry || {
      faculty: faculty._id, section: section._id, subject: subject._id,
      duration: subject.duration || 1,
      calendarStartDate: section._calendarStartDate || "",
      calendarEndDate: section._calendarEndDate || ""
    };
    const candidates = candidateFor(
      targetEntry, subject, faculty, section, c.rooms, scopedSlots, entries, c.settings,
      { holidayDays: c.holidayDays, limit: 5 }
    );
    suggestions.push({
      type, entryId: entry?._id || null, subject: subject?.name || "Unscheduled class",
      faculty: faculty?.name || "", section: section?.name || "", reason, candidates
    });
  };

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i], b = entries[j];
      if (!overlaps(a, b)) continue;
      if (id(a.faculty) === id(b.faculty)) {
        add("FACULTY_CONFLICT", a, subjectMap.get(id(a.subject)), `${facultyMap.get(id(a.faculty))?.name || "Faculty"} is double-booked.`);
      }
      if (id(a.section) === id(b.section)) {
        add("SECTION_CONFLICT", a, subjectMap.get(id(a.subject)), `${sectionMap.get(id(a.section))?.name || "Section"} is double-booked.`);
      }
      if (id(a.room) === id(b.room)) {
        add("ROOM_CONFLICT", a, subjectMap.get(id(a.subject)), `${c.rooms.find(room => id(room) === id(a.room))?.name || "Room"} is double-booked.`);
      }
    }
  }

  const counts = new Map();
  entries.forEach(entry => counts.set(id(entry.subject), (counts.get(id(entry.subject)) || 0) + 1));
  for (const subject of c.subjects) {
    const missing = Math.max(0, Number(subject.classesPerWeek || 0) - (counts.get(id(subject)) || 0));
    if (missing > 0) add("UNSCHEDULED", null, subject, `${subject.name}: ${counts.get(id(subject)) || 0}/${subject.classesPerWeek || 0} weekly classes scheduled.`);
  }

  for (const entry of entries) {
    const subject = subjectMap.get(id(entry.subject));
    const faculty = facultyMap.get(id(entry.faculty));
    const section = sectionMap.get(id(entry.section));
    const room = c.rooms.find(candidate => id(candidate) === id(entry.room));
    if (!subject || !faculty || !section) continue;
    const slots = c.sectionSlots.get(id(section)) || [];
    const block = slotBlocks(slots, entry.day, entry.order, entry.duration || subject.duration || 1);
    if (!block.length) {
      add("TIME_SLOT_SCOPE", entry, subject, "This class does not match the effective time-slot calendar for its section.");
    }
    if (!availableFaculty(faculty, entry.day, block)) {
      add("FACULTY_AVAILABILITY", entry, subject, `${faculty.name} is unavailable for this class time.`);
    }
    if (room && normalizedRoomType(subject.roomType) !== "any" && normalizedRoomType(room.type) !== normalizedRoomType(subject.roomType)) {
      add("ROOM_TYPE", entry, subject, `${subject.name} requires ${subject.roomType}; ${room.name} is ${room.type}.`);
    }
    if (room && section.capacity && Number(room.capacity || 0) < Number(section.capacity)) {
      add("ROOM_CAPACITY", entry, subject, `${room.name} capacity is below the ${section.name} section capacity.`);
    }
    if (maxRun(entries, "faculty", faculty._id, entry.day, entry) > Math.max(1, Number(c.settings?.maxConsecutiveFaculty || 2))) {
      add("FACULTY_CONSECUTIVE", entry, subject, `${faculty.name} exceeds the configured consecutive-class limit.`);
    }
    if (maxRun(entries, "section", section._id, entry.day, entry) > Math.max(1, Number(c.settings?.maxConsecutiveSection || 3))) {
      add("SECTION_CONSECUTIVE", entry, subject, `${section.name} exceeds the configured consecutive-class limit.`);
    }
  }

  const unique = suggestions.slice(0, 100);
  return {
    hasTimetable: true,
    scope: { academicSessionId: c.sessionId, academicSessionName: c.session?.name || "" },
    status: c.timetable.status,
    version: c.timetable.version,
    versionLabel: c.timetable.versionLabel,
    summary: { issues: unique.length, suggestions: unique.reduce((total, row) => total + row.candidates.length, 0) },
    suggestions: unique
  };
}

router.get("/", async (req, res) => {
  try {
    const c = await context(String(req.query.sessionId || ""));
    res.json(buildOptimizationReport(c));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/auto-fix", async (req, res) => {
  try {
    if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only Admin or Scheduler users can apply automatic timetable fixes." });
    }
    const c = await context(String(req.body?.academicSessionId || ""));
    if (!c.timetable) return res.status(404).json({ message: "No current timetable found for the selected academic session." });
    if (c.timetable.status !== "DRAFT") return res.status(409).json({ message: `Timetable is ${c.timetable.status}. Return it to DRAFT before optimization changes.` });

    const maxChanges = Math.max(1, Math.min(25, Number(req.body?.maxChanges || 10)));
    const applied = [];
    for (let index = 0; index < maxChanges; index += 1) {
      const report = buildOptimizationReport(c);
      const candidate = report.suggestions.find(row => row.entryId && row.candidates?.length);
      if (!candidate) break;
      const placement = candidate.candidates[0];
      const entry = c.timetable.entries.id(candidate.entryId);
      if (!entry) break;
      entry.day = placement.day;
      entry.startTime = placement.startTime;
      entry.endTime = placement.endTime;
      entry.order = placement.order;
      entry.duration = placement.duration;
      if (placement.roomId) entry.room = placement.roomId;
      applied.push({
        entryId: String(entry._id), subject: candidate.subject, type: candidate.type,
        day: placement.day, startTime: placement.startTime, room: placement.room, score: placement.score
      });
      c.entries = c.timetable.entries.map(row => {
        const value = typeof row.toObject === "function" ? row.toObject() : { ...row };
        const section = c.sectionMap.get(id(value.section));
        return { ...value, calendarStartDate: value.calendarStartDate || section?._calendarStartDate || "", calendarEndDate: value.calendarEndDate || section?._calendarEndDate || "" };
      });
    }

    if (applied.length) await c.timetable.save();
    const finalReport = buildOptimizationReport(c);
    if (applied.length) {
      await AuditLog.create({
        action: "AUTO_FIX_OPTIMIZATION", category: "TIMETABLE",
        description: `Automatically applied ${applied.length} timetable optimization change(s).`,
        user: req.user?.id || null, username: req.user?.username || "", role: req.user?.role || "",
        targetType: "Timetable", targetId: String(c.timetable._id),
        metadata: { appliedCount: applied.length, remainingIssues: finalReport.summary?.issues || 0 },
        ipAddress: req.ip || ""
      });
    }
    res.json({
      message: `Applied ${applied.length} optimization change(s).`,
      applied, remaining: finalReport.summary?.issues || 0, timetable: c.timetable, report: finalReport
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/apply", async (req, res) => {
  try {
    if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only Admin or Scheduler users can apply timetable optimization changes." });
    }
    const { entryId, day, startTime, roomId, academicSessionId } = req.body || {};
    if (!entryId || !day || !startTime) {
      return res.status(400).json({ message: "entryId, day and startTime are required." });
    }
    const c = await context(String(academicSessionId || ""));
    if (!c.timetable) return res.status(404).json({ message: "No current timetable found for the selected academic session." });
    if (c.timetable.status !== "DRAFT") return res.status(409).json({ message: `Timetable is ${c.timetable.status}. Return it to DRAFT before optimization changes.` });

    const entry = c.timetable.entries.id(entryId);
    if (!entry) return res.status(404).json({ message: "Timetable class not found." });
    const subject = c.subjectMap.get(id(entry.subject));
    const faculty = c.facultyMap.get(id(entry.faculty));
    const section = c.sectionMap.get(id(entry.section));
    if (!subject || !faculty || !section) return res.status(409).json({ message: "The class master-data mappings are incomplete. Repair its subject, faculty and section mapping first." });
    const scopedSlots = c.sectionSlots.get(id(section)) || [];
    const row = c.entries.find(value => id(value) === id(entry));
    const candidates = candidateFor(
      row || entry.toObject(), subject, faculty, section, c.rooms, scopedSlots, c.entries, c.settings,
      { holidayDays: c.holidayDays, limit: 20 }
    );
    const candidate = candidates.find(value =>
      value.day === day && value.startTime === startTime && (!roomId || String(value.roomId) === String(roomId))
    );
    if (!candidate) return res.status(409).json({ message: "The requested optimization placement is no longer valid under the section calendar, room capacity, faculty limits and holiday rules. Refresh suggestions and try again." });

    entry.day = candidate.day;
    entry.startTime = candidate.startTime;
    entry.endTime = candidate.endTime;
    entry.order = candidate.order;
    entry.duration = candidate.duration;
    if (candidate.roomId) entry.room = candidate.roomId;
    await c.timetable.save();

    await AuditLog.create({
      action: "APPLY_OPTIMIZATION", category: "TIMETABLE",
      description: `Applied optimization suggestion for ${subject.name || "class"}`,
      user: req.user?.id || null, username: req.user?.username || "", role: req.user?.role || "",
      targetType: "Timetable", targetId: String(c.timetable._id),
      metadata: { entryId: String(entry._id), day: candidate.day, startTime: candidate.startTime, roomId: String(candidate.roomId || "") },
      ipAddress: req.ip || ""
    });

    const recipients = [...new Set([String(entry.faculty || ""), String(entry.section || "")].filter(Boolean))];
    for (const recipient of recipients) {
      const isFaculty = String(entry.faculty || "") === recipient;
      await Notification.create({
        title: "Timetable optimized",
        message: `${subject.name || "A class"} was moved to ${candidate.day} ${candidate.startTime}${candidate.room ? ` in ${candidate.room}` : ""}. Please check your timetable.`,
        priority: "IMPORTANT", audience: isFaculty ? "FACULTY" : "SECTION",
        [isFaculty ? "faculty" : "section"]: recipient,
        published: true, startAt: new Date(), createdBy: req.user?.id || null,
        sourceType: "TIMETABLE", sourceId: String(c.timetable._id), eventKey: "OPTIMIZATION_APPLIED"
      });
    }
    res.json({ message: "Optimization suggestion applied successfully.", timetable: c.timetable, applied: candidate });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
