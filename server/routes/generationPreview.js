import express from "express";
import mongoose from "mongoose";
import { requireAuth, allowRoles } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { validateTimetable } from "../services/timetable/validator.js";
import { generateBestTimetable } from "../services/generator.js";
import { buildGenerationReport } from "../services/generationExplainability.js";
import { resolveProgramCalendar } from "../services/timetable/academicCalendar.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import Section from "../models/Section.js";
import Room from "../models/Room.js";
import TimeSlot from "../models/TimeSlot.js";
import Program from "../models/Program.js";
import AcademicSession from "../models/AcademicSession.js";
import SchedulerSetting from "../models/SchedulerSetting.js";
import Timetable from "../models/Timetable.js";
import GenerationPreview from "../models/GenerationPreview.js";

const router = express.Router();
const idOf = value => value == null ? "" : String(value?._id ?? value);

async function loadContext(body = {}) {
  const sessionId = String(body.academicSessionId || "");
  if (!mongoose.isValidObjectId(sessionId)) { const e = new Error("Select an academic session before generating."); e.statusCode = 400; throw e; }
  const session = await AcademicSession.findById(sessionId).lean();
  if (!session) { const e = new Error("Selected academic session was not found."); e.statusCode = 404; throw e; }
  const programIds = [...new Set((Array.isArray(body.programIds) ? body.programIds : []).map(String).filter(Boolean))];
  if (programIds.some(id => !mongoose.isValidObjectId(id))) { const e = new Error("Invalid program selection."); e.statusCode = 400; throw e; }

  const [faculty, rawSections, rooms, allSlots, programs] = await Promise.all([
    Faculty.find().lean(), Section.find({ academicSession: sessionId }).lean(), Room.find().lean(),
    TimeSlot.find().sort({ day: 1, order: 1 }).lean(), Program.find({ active: { $ne: false } }).lean()
  ]);
  const selectedPrograms = programIds.map(id => programs.find(program => idOf(program) === id));
  if (selectedPrograms.some(program => !program)) { const e = new Error("A selected program is missing or inactive."); e.statusCode = 400; throw e; }

  const sectionsAll = rawSections.map(section => {
    const calendar = resolveProgramCalendar(session.programDates || [], section, programs);
    const start = calendar?.startDate || session.startDate || null, end = calendar?.endDate || session.endDate || null;
    return { ...section, _calendarStartDate: start ? new Date(start).toISOString().slice(0, 10) : "", _calendarEndDate: end ? new Date(end).toISOString().slice(0, 10) : "" };
  });
  const programNames = new Set(selectedPrograms.flatMap(program => [program.name, program.code].filter(Boolean).map(value => String(value).trim().toLowerCase())));
  const selectedSection = section => !programIds.length || programIds.includes(idOf(section.programId)) || programNames.has(String(section.program || "").trim().toLowerCase());
  const sections = sectionsAll.filter(selectedSection);
  if (!sections.length) { const e = new Error("No sections are mapped to the selected program(s) for this academic session."); e.statusCode = 422; throw e; }

  const allSectionIds = sectionsAll.map(section => section._id);
  const allSubjects = await Subject.find({ $and: [
    { $or: [{ academicSession: sessionId }, { academicSession: null }] },
    { section: { $in: allSectionIds } }, { active: { $ne: false } }
  ] }).lean();
  const scopedSectionIds = new Set(sections.map(idOf));
  const scopedSubjects = allSubjects.filter(subject => scopedSectionIds.has(idOf(subject.section)));
  let settings = await SchedulerSetting.findOne({ key: "default" }).lean();
  const override = settings?.sessionOverrides?.find(item => String(item.academicSession) === sessionId);
  if (override) settings = { ...settings, ...override };
  settings ||= {};
  const holidayDays = new Set(["Sunday", ...(settings.holidayDays || [])]);
  const slots = allSlots.filter(slot => !idOf(slot.academicSession) || idOf(slot.academicSession) === sessionId);
  const usableSlots = slots.filter(slot => !slot.isBreak && !holidayDays.has(String(slot.day)));

  const facultyIds = new Set(faculty.map(idOf)), sectionIds = new Set(sections.map(idOf));
  const subjects = [], invalidSubjects = [];
  for (const subject of scopedSubjects) {
    const reasons = [];
    if (!facultyIds.has(idOf(subject.faculty))) reasons.push("Faculty mapping is missing or invalid.");
    if (!sectionIds.has(idOf(subject.section))) reasons.push("Section mapping is missing or outside the selected scope.");
    if (reasons.length) invalidSubjects.push({ name: subject.name, code: subject.code, reasons });
    else subjects.push(subject);
  }
  if (!subjects.length) { const e = new Error("No valid subject mappings were found for the selected program(s)."); e.statusCode = 422; e.diagnostics = invalidSubjects; throw e; }
  if (!rooms.length) { const e = new Error("No rooms are configured."); e.statusCode = 422; throw e; }
  if (!usableSlots.length) { const e = new Error("No usable time slots remain after excluding configured holidays."); e.statusCode = 422; throw e; }

  const current = await Timetable.findOne({ academicSession: sessionId, isCurrent: true }).sort({ version: -1 }).lean();
  const selectedIds = new Set(sections.map(idOf));
  const reservedEntries = programIds.length ? (current?.entries || []).filter(entry => !selectedIds.has(idOf(entry.section))).map(entry => {
    const section = sectionsAll.find(row => idOf(row) === idOf(entry.section));
    return { ...entry, calendarStartDate: entry.calendarStartDate || section?._calendarStartDate || "", calendarEndDate: entry.calendarEndDate || section?._calendarEndDate || "" };
  }) : [];
  return { sessionId, session, programIds, selectedPrograms, faculty, sections, sectionsAll, rooms, slots, usableSlots, programs, settings, subjects, allSubjects, invalidSubjects, current, reservedEntries };
}

router.post("/timetable/preview", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const c = await loadContext(req.body || {});
    const runs = Math.max(1, Math.min(30, Number(req.body?.generationRuns || c.settings.generationRuns || env.schedulerGenerationRuns)));
    const timeLimit = Math.max(1000, Math.min(120000, Number(req.body?.generationTimeLimitMs || c.settings.generationTimeLimitMs || env.schedulerGenerationTimeLimitMs)));
    const result = generateBestTimetable({
      faculty: c.faculty, subjects: c.subjects, sections: c.sections, rooms: c.rooms, slots: c.usableSlots,
      programs: c.programs, settings: c.settings, reservedEntries: c.reservedEntries, runs, totalMaxMillis: timeLimit,
      perRunMillis: Math.max(750, Math.floor(timeLimit / runs)), attemptsPerRun: env.schedulerGenerationAttempts, academicSessionId: c.sessionId
    });
    const required = c.subjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.classesPerWeek || 0)), 0);
    const validation = validateTimetable({ entries: result.entries || [], faculty: c.faculty, sections: c.sections, subjects: c.subjects, rooms: c.rooms, slots: c.usableSlots, programs: c.programs, settings: c.settings, academicSessionId: c.sessionId, holidayDays: c.settings.holidayDays || ["Sunday"] });
    const mergedEntries = [...(c.programIds.length ? c.reservedEntries : []), ...(result.entries || [])];
    const fids = new Set(c.faculty.map(idOf)), sids = new Set(c.sectionsAll.map(idOf));
    const allValidSubjects = c.allSubjects.filter(subject => fids.has(idOf(subject.faculty)) && sids.has(idOf(subject.section)));
    const mergedValidation = c.programIds.length ? validateTimetable({ entries: mergedEntries, faculty: c.faculty, sections: c.sectionsAll, subjects: allValidSubjects, rooms: c.rooms, slots: c.usableSlots, programs: c.programs, settings: c.settings, academicSessionId: c.sessionId, holidayDays: c.settings.holidayDays || ["Sunday"] }) : validation;
    const report = buildGenerationReport({
      entries: result.entries || [], subjects: c.subjects, faculty: c.faculty, sections: c.sectionsAll, rooms: c.rooms, slots: c.usableSlots,
      programs: c.programs, settings: c.settings, warnings: result.warnings || [], validation: c.programIds.length ? mergedValidation : validation,
      invalidSubjects: c.invalidSubjects, academicSessionId: c.sessionId,
      scope: { academicSessionId: c.sessionId, academicSessionName: c.session.name, programIds: c.programIds, programNames: c.programIds.length ? c.selectedPrograms.map(program => program.name) : ["All programs"] },
      generationRuns: runs, generationTimeLimitMs: timeLimit, qualityMetrics: result.metrics || null
    });
    const committable = Boolean((result.entries || []).length && result.entries.length >= required && (c.programIds.length ? mergedValidation : validation).valid && report.summary.unscheduledSessions === 0);
    const preview = await GenerationPreview.create({
      createdBy: String(req.user?.username || ""), academicSession: c.sessionId, programIds: c.programIds, entries: mergedEntries,
      score: Number(result.score || 0), metrics: result.metrics || null, warnings: result.warnings || [], report, expectedSessions: required,
      generationRuns: runs, baseTimetableId: c.current?._id || null, baseTimetableUpdatedAt: c.current?.updatedAt || null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
    return res.status(201).json({ previewOnly: true, previewId: String(preview._id), expiresAt: preview.expiresAt, committable, entries: result.entries || [], warnings: result.warnings || [], generationReport: report });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Timetable preview failed:", error.message);
    return res.status(status).json({ message: error.statusCode ? error.message : "Unable to create timetable preview.", diagnostics: error.diagnostics || undefined });
  }
});

router.post("/timetable/previews/:id/commit", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  let tx = null;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid preview ID." });
    const username = String(req.user?.username || "");
    const preview = await GenerationPreview.findOne({ _id: req.params.id, createdBy: username }).lean();
    if (!preview) return res.status(404).json({ message: "Preview not found or belongs to another user." });
    if (preview.status === "COMMITTED" && preview.committedTimetable) {
      const committed = await Timetable.findById(preview.committedTimetable).populate("entries.section entries.subject entries.faculty entries.room");
      if (committed) return res.json(committed);
    }
    if (preview.status !== "READY" || new Date(preview.expiresAt).getTime() <= Date.now()) return res.status(409).json({ message: "Preview expired or is no longer available. Generate a fresh preview." });
    if (Number(preview.report?.summary?.unscheduledSessions || 0) > 0 || preview.report?.summary?.hardValidation !== "PASSED") return res.status(422).json({ message: "This preview has unscheduled sessions or has not passed hard-constraint validation.", generationReport: preview.report });

    const sessionId = String(preview.academicSession), currentQuery = { academicSession: preview.academicSession, isCurrent: true };
    const current = await Timetable.findOne(currentQuery).sort({ version: -1 }).lean();
    const baseSame = idOf(current?._id) === idOf(preview.baseTimetableId) && (!current || new Date(current.updatedAt).getTime() === new Date(preview.baseTimetableUpdatedAt).getTime());
    if (!baseSame) return res.status(409).json({ message: "The current timetable changed after this preview was generated. Generate a new preview." });
    const session = await AcademicSession.findById(sessionId).lean();
    if (!session) return res.status(409).json({ message: "Academic session no longer exists." });
    const [faculty, rawSections, rooms, allSlots, programs, subjectRows] = await Promise.all([
      Faculty.find().lean(), Section.find({ academicSession: sessionId }).lean(), Room.find().lean(), TimeSlot.find().sort({ day: 1, order: 1 }).lean(),
      Program.find({ active: { $ne: false } }).lean(), Subject.find({ $or: [{ academicSession: sessionId }, { academicSession: null }], active: { $ne: false } }).lean()
    ]);
    const sections = rawSections.map(section => {
      const calendar = resolveProgramCalendar(session.programDates || [], section, programs), start = calendar?.startDate || session.startDate || null, end = calendar?.endDate || session.endDate || null;
      return { ...section, _calendarStartDate: start ? new Date(start).toISOString().slice(0, 10) : "", _calendarEndDate: end ? new Date(end).toISOString().slice(0, 10) : "" };
    });
    const sectionIds = new Set(sections.map(idOf)), facultyIds = new Set(faculty.map(idOf));
    const subjects = subjectRows.filter(subject => sectionIds.has(idOf(subject.section)) && facultyIds.has(idOf(subject.faculty)));
    const slots = allSlots.filter(slot => !idOf(slot.academicSession) || idOf(slot.academicSession) === sessionId);
    let settings = await SchedulerSetting.findOne({ key: "default" }).lean();
    const override = settings?.sessionOverrides?.find(item => String(item.academicSession) === sessionId);
    if (override) settings = { ...settings, ...override };
    settings ||= {};
    const programIds = (preview.programIds || []).map(String), selectedPrograms = programs.filter(program => programIds.includes(idOf(program)));
    const names = new Set(selectedPrograms.flatMap(program => [program.name, program.code].filter(Boolean).map(value => String(value).trim().toLowerCase())));
    const scopedSections = new Set(sections.filter(section => !programIds.length || programIds.includes(idOf(section.programId)) || names.has(String(section.program || "").trim().toLowerCase())).map(idOf));
    const scopedSubjects = subjects.filter(subject => scopedSections.has(idOf(subject.section)));
    const required = scopedSubjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.classesPerWeek || 0)), 0);
    const scheduled = (preview.entries || []).filter(entry => scopedSections.has(idOf(entry.section))).length;
    if (required !== Number(preview.expectedSessions || 0) || scheduled !== required) return res.status(409).json({ message: "Subject targets or section mappings changed since preview. Generate a new preview." });
    const validation = validateTimetable({ entries: preview.entries || [], faculty, sections, subjects, rooms, slots, programs, settings, academicSessionId: sessionId, holidayDays: settings.holidayDays || ["Sunday"] });
    if (!validation.valid) return res.status(422).json({ message: "Preview no longer passes validation. Generate a fresh preview.", errors: validation.errors || [], warnings: validation.warnings || [] });

    const topology = String(mongoose.connection.getClient?.()?.topology?.description?.type || "");
    if (!/ReplicaSet|Sharded/i.test(topology)) return res.status(503).json({ message: "Atomic preview commit requires MongoDB replica-set or sharded-cluster transaction support." });
    const guards = mongoose.connection.collection("_appWriteGuards");
    await guards.updateOne({ _id: `timetable:${sessionId}` }, { $setOnInsert: { version: 0, createdAt: new Date() } }, { upsert: true });
    tx = await mongoose.startSession();
    let savedId = null;
    await tx.withTransaction(async () => {
      const fresh = await GenerationPreview.findOne({ _id: preview._id, createdBy: username, status: "READY", expiresAt: { $gt: new Date() } }).session(tx).lean();
      if (!fresh) { const error = new Error("Preview already committed or expired."); error.statusCode = 409; throw error; }
      const lock = await guards.updateOne({ _id: `timetable:${sessionId}` }, { $inc: { version: 1 }, $set: { updatedAt: new Date() } }, { session: tx });
      if (lock.matchedCount !== 1) { const error = new Error("Unable to acquire timetable commit guard."); error.statusCode = 409; throw error; }
      const currentNow = await Timetable.findOne(currentQuery).sort({ version: -1 }).session(tx).lean();
      const unchanged = idOf(currentNow?._id) === idOf(fresh.baseTimetableId) && (!currentNow || new Date(currentNow.updatedAt).getTime() === new Date(fresh.baseTimetableUpdatedAt).getTime());
      if (!unchanged) { const error = new Error("Timetable changed while committing. Generate a new preview."); error.statusCode = 409; throw error; }
      await Timetable.updateMany({ academicSession: fresh.academicSession, isCurrent: true }, { $set: { isCurrent: false } }, { session: tx });
      const last = await Timetable.findOne({ academicSession: fresh.academicSession }).sort({ version: -1 }).select("version").session(tx).lean(), version = Number(last?.version || 0) + 1;
      const [saved] = await Timetable.create([{
        entries: fresh.entries, score: fresh.score, optimizationScore: fresh.metrics?.qualityScore ?? fresh.score ?? null, optimizationMetrics: fresh.metrics || null,
        optimizationRuns: fresh.generationRuns || 1, academicSession: fresh.academicSession, version, versionLabel: `Version ${version}`, isCurrent: true,
        createdBy: username, status: "DRAFT", statusChangedAt: new Date(), statusNote: "", warnings: fresh.warnings || [],
        generationScope: fresh.programIds?.length ? { programIds: fresh.programIds, programNames: selectedPrograms.map(program => program.name) } : null,
        notes: "Created from a reviewed generation preview."
      }], { session: tx });
      const marked = await GenerationPreview.updateOne({ _id: fresh._id, status: "READY" }, { $set: { status: "COMMITTED", committedTimetable: saved._id } }, { session: tx });
      if (marked.modifiedCount !== 1) { const error = new Error("Preview status changed during save."); error.statusCode = 409; throw error; }
      savedId = saved._id;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return res.json(await Timetable.findById(savedId).populate("entries.section entries.subject entries.faculty entries.room"));
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Preview commit failed:", error.message);
    return res.status(status).json({ message: error.statusCode ? error.message : "Unable to save the reviewed preview atomically. No partial timetable was saved." });
  } finally { if (tx) await tx.endSession().catch(() => {}); }
});

router.delete("/timetable/previews/:id", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid preview ID." });
    const result = await GenerationPreview.findOneAndDelete({ _id: req.params.id, createdBy: String(req.user?.username || ""), status: "READY" });
    if (!result) return res.status(404).json({ message: "Preview not found or already used." });
    return res.json({ ok: true });
  } catch (error) { return res.status(500).json({ message: error.message || "Unable to discard preview." }); }
});

export default router;
