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
import ExcelJS from "exceljs";
import multer from "multer";
import { assertSafeXlsxBuffer } from "../services/xlsxSafety.js";
import { holidayImportCell } from "../services/holidayImport.js";
import { mapManualTimetableRows } from "../services/manualTimetableImport.js";
import Faculty from "../models/Faculty.js";
import Section from "../models/Section.js";
import Room from "../models/Room.js";

const manualImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});
const MANUAL_IMPORT_HEADERS = [
  "Program Code", "Program", "Semester", "Section", "Day",
  "Start Time", "End Time", "Duration", "Subject Code", "Subject",
  "Faculty Code", "Faculty", "Room"
];

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
  if (session.programDates?.length) {
    const missingCalendars = sections.filter(section => !resolveProgramCalendar(session.programDates || [], section, programs));
    if (missingCalendars.length) {
      const e = new Error("Configure academic dates for every selected program before generating: " + missingCalendars.map(section => [section.program, section.semester, section.name].filter(Boolean).join(" · ")).join(", "));
      e.statusCode = 422; throw e;
    }
  }

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
    if (reasons.length) invalidSubjects.push({ ...subject, reasons });
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
  return { sessionId, session, programIds, selectedPrograms, faculty, sections, sectionsAll, rooms, slots, usableSlots, programs, settings, subjects, scopedSubjects, allSubjects, invalidSubjects, current, reservedEntries };
}

router.get("/timetable/manual-import/template", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (_req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Scheduly";
    workbook.subject = "Manual timetable import template";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Timetable");
    sheet.columns = MANUAL_IMPORT_HEADERS.map((header, index) => ({
      header, key: `column${index + 1}`,
      width: Math.max(14, Math.min(24, header.length + 5))
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: `M1` };

    const instructions = workbook.addWorksheet("Instructions");
    instructions.columns = [{ width: 26 }, { width: 105 }];
    instructions.addRows([
      ["Field", "Instructions"],
      ["Program Code / Program", "Enter the exact existing Program code or name. At least one is required. If both are entered, both must match."],
      ["Semester / Section", "Must match the existing section mapping in the selected Academic Session."],
      ["Day", "Use Monday, Tuesday, Wednesday, Thursday, Friday, Saturday or Sunday. Configured holidays are checked during validation."],
      ["Start Time / End Time", "Use the exact configured time-slot boundaries, preferably in 24-hour HH:MM format (example: 09:00)."],
      ["Duration", "Optional. Enter 1, 2 or 3 consecutive configured periods. Leave blank to infer duration from the start/end time and subject duration."],
      ["Subject Code / Subject", "Enter the exact mapped subject code or name. At least one is required. If both are entered, both must match."],
      ["Faculty Code / Faculty", "Enter the exact faculty code or name. The faculty member must match the faculty mapped to the subject."],
      ["Room", "Enter the exact existing room name. Room type and section capacity are validated."],
      ["Completeness", "Include every required weekly class for every active subject in the selected Academic Session. Missing or extra sessions block import."],
      ["Safety", "Upload creates a preview only. The existing timetable is not changed until you confirm saving the validated import as a new Draft version. Previous versions remain in Approval & Versions."]
    ]);
    instructions.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    instructions.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    instructions.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader("Content-Disposition", 'attachment; filename="scheduly-manual-timetable-template.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(Buffer.from(buffer));
  } catch (error) {
    console.error("Manual timetable template failed:", error.message);
    res.status(500).json({ message: "Unable to create the Excel template." });
  }
});

router.post("/timetable/manual-import/preview", requireAuth, allowRoles("ADMIN", "SCHEDULER"), manualImportUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a .xlsx workbook first." });
    const fileName = String(req.file.originalname || "").trim();
    if (!fileName.toLowerCase().endsWith(".xlsx")) {
      return res.status(400).json({ message: "Upload an .xlsx Excel workbook. Download the Scheduly template to get the supported format." });
    }
    assertSafeXlsxBuffer(req.file.buffer);

    const sessionId = String(req.body?.academicSessionId || "").trim();
    if (!mongoose.isValidObjectId(sessionId)) return res.status(400).json({ message: "Select a valid Academic Session." });
    const [session, faculty, programs, rooms, slots, settingsRow] = await Promise.all([
      AcademicSession.findById(sessionId).lean(),
      Faculty.find().lean(),
      Program.find({ active: { $ne: false } }).lean(),
      Room.find().lean(),
      TimeSlot.find({ $or: [{ academicSession: sessionId }, { academicSession: null }] }).sort({ day: 1, order: 1 }).lean(),
      SchedulerSetting.findOne({ key: "default" }).lean()
    ]);
    if (!session) return res.status(404).json({ message: "Selected Academic Session was not found." });

    const sections = await Section.find({ academicSession: sessionId }).lean();
    const sectionIds = sections.map(section => section._id);
    const subjects = await Subject.find({
      $and: [
        { $or: [{ academicSession: sessionId }, { academicSession: null }] },
        { section: { $in: sectionIds } },
        { active: { $ne: false } }
      ]
    }).lean();
    const override = settingsRow?.sessionOverrides?.find(row => String(row.academicSession) === sessionId);
    const settings = override ? { ...settingsRow, ...override } : (settingsRow || { holidayDays: ["Sunday"] });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const worksheet = workbook.getWorksheet("Timetable") || workbook.worksheets[0];
    if (!worksheet) return res.status(400).json({ message: "The workbook does not contain a Timetable worksheet." });
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values.slice(1).map(value => String(holidayImportCell(value) ?? "").trim());
    const normalizedHeaders = new Set(headers.map(value => value.toLowerCase().replace(/\s+/g, " ").trim()));
    const has = (...names) => names.some(name => normalizedHeaders.has(name));
    const requiredHeaderGroups = [
      ["Program Code", "Program"], ["Semester"], ["Section"], ["Day"],
      ["Start Time"], ["End Time"], ["Subject Code", "Subject"],
      ["Faculty Code", "Faculty"], ["Room"]
    ];
    const missingHeaders = requiredHeaderGroups
      .filter(group => !has(...group))
      .map(group => group.join(" or "));
    if (missingHeaders.length) {
      return res.status(400).json({ message: "Missing required Excel column(s): " + missingHeaders.join(", ") + ". Download the Scheduly template and copy your timetable into its Timetable sheet." });
    }

    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (excelRow, rowNumber) => {
      if (rowNumber <= 1) return;
      const row = { rowNumber };
      headers.forEach((header, columnIndex) => {
        if (!header) return;
        row[header] = holidayImportCell(excelRow.getCell(columnIndex + 1).value);
      });
      if (Object.values(row).some(value => value !== "" && value !== null && value !== undefined)) rows.push(row);
    });
    if (!rows.length) return res.status(400).json({ message: "The Timetable worksheet has no data rows." });
    if (rows.length > 2000) return res.status(400).json({ message: "The workbook contains more than 2,000 timetable rows. Split it into smaller files." });

    const mapped = mapManualTimetableRows({
      rows, session, faculty, sections, programs, subjects, rooms, slots, settings
    });
    const report = {
      scope: {
        academicSessionId: sessionId,
        academicSessionName: session.name,
        programIds: mapped.programIds,
        programNames: mapped.programNames
      },
      summary: {
        requiredSessions: mapped.requiredSessions,
        scheduledSessions: mapped.scheduledSessions,
        unscheduledSessions: mapped.unscheduledSessions,
        hardValidation: mapped.errors.length === 0 && mapped.validation.valid ? "PASSED" : "FAILED",
        hardErrorCount: mapped.errors.length,
        coveragePercent: mapped.requiredSessions
          ? Number((mapped.scheduledSessions / mapped.requiredSessions * 100).toFixed(1))
          : 0
      },
      errors: mapped.errors,
      warnings: mapped.warnings
    };
    const current = await Timetable.findOne({ academicSession: sessionId, isCurrent: true }).sort({ version: -1 }).lean();
    if (mapped.errors.length || !mapped.validation.valid) {
      return res.status(422).json({
        committable: false,
        fileName,
        summary: report.summary,
        scope: report.scope,
        errors: mapped.errors,
        warnings: mapped.warnings,
        rows: mapped.rows.slice(0, 100),
        totalRows: mapped.rows.length
      });
    }

    const preview = await GenerationPreview.create({
      createdBy: String(req.user?.username || ""),
      academicSession: sessionId,
      programIds: mapped.programIds,
      entries: mapped.entries,
      score: 0,
      metrics: { qualityScore: null, source: "EXCEL_IMPORT" },
      warnings: mapped.warnings,
      report: {
        ...report,
        checks: [
          { name: "Excel rows mapped to existing master data", status: "PASSED", detail: `${mapped.rows.length} row(s) resolved.` },
          { name: "Weekly subject coverage", status: "PASSED", detail: `${mapped.scheduledSessions} of ${mapped.requiredSessions} required session(s) imported.` },
          { name: "Hard timetable validation", status: "PASSED", detail: "No faculty, section, room, time-slot or holiday errors." }
        ]
      },
      expectedSessions: mapped.requiredSessions,
      generationRuns: 1,
      baseTimetableId: current?._id || null,
      baseTimetableUpdatedAt: current?.updatedAt || null,
      sourceType: "EXCEL_IMPORT",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      status: "READY"
    });

    return res.status(201).json({
      committable: true,
      previewId: String(preview._id),
      expiresAt: preview.expiresAt,
      fileName,
      scope: report.scope,
      summary: report.summary,
      rows: mapped.rows.slice(0, 100),
      totalRows: mapped.rows.length,
      warnings: mapped.warnings
    });
  } catch (error) {
    const status = error.statusCode || 400;
    if (status >= 500) console.error("Manual timetable Excel import failed:", error.message);
    return res.status(status).json({
      message: error.statusCode ? error.message : "Unable to process the Excel workbook. Check the file and try again."
    });
  }
});

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
    const required = c.scopedSubjects.reduce((sum, subject) => sum + Math.max(0, Number(subject.classesPerWeek || 0)), 0);
    const validation = validateTimetable({ entries: result.entries || [], faculty: c.faculty, sections: c.sections, subjects: c.subjects, rooms: c.rooms, slots: c.usableSlots, programs: c.programs, settings: c.settings, academicSessionId: c.sessionId, holidayDays: c.settings.holidayDays || ["Sunday"] });
    const mergedEntries = [...(c.programIds.length ? c.reservedEntries : []), ...(result.entries || [])];
    const fids = new Set(c.faculty.map(idOf)), sids = new Set(c.sectionsAll.map(idOf));
    const allValidSubjects = c.allSubjects.filter(subject => fids.has(idOf(subject.faculty)) && sids.has(idOf(subject.section)));
    const mergedValidation = c.programIds.length ? validateTimetable({ entries: mergedEntries, faculty: c.faculty, sections: c.sectionsAll, subjects: allValidSubjects, rooms: c.rooms, slots: c.usableSlots, programs: c.programs, settings: c.settings, academicSessionId: c.sessionId, holidayDays: c.settings.holidayDays || ["Sunday"] }) : validation;
    const report = buildGenerationReport({
      entries: result.entries || [], subjects: c.scopedSubjects, faculty: c.faculty, sections: c.sectionsAll, rooms: c.rooms, slots: c.usableSlots,
      programs: c.programs, settings: c.settings, warnings: [...(result.warnings || []), ...c.invalidSubjects.map(item => String(item.name || item.code || "Subject") + ": " + item.reasons.join(" "))], validation: c.programIds.length ? mergedValidation : validation,
      invalidSubjects: c.invalidSubjects, academicSessionId: c.sessionId,
      scope: { academicSessionId: c.sessionId, academicSessionName: c.session.name, programIds: c.programIds, programNames: c.programIds.length ? c.selectedPrograms.map(program => program.name) : ["All programs"] },
      generationRuns: runs, generationTimeLimitMs: timeLimit, qualityMetrics: result.metrics || null
    });
    const committable = Boolean(c.invalidSubjects.length === 0 && (result.entries || []).length && result.entries.length >= required && (c.programIds.length ? mergedValidation : validation).valid && report.summary.unscheduledSessions === 0);
    const preview = await GenerationPreview.create({
      createdBy: String(req.user?.username || ""), academicSession: c.sessionId, programIds: c.programIds, entries: mergedEntries,
      score: Number(result.score || 0), metrics: result.metrics || null, warnings: [...(result.warnings || []), ...c.invalidSubjects.map(item => String(item.name || item.code || "Subject") + ": " + item.reasons.join(" "))], report, expectedSessions: required,
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
    const scopedSectionRecords = sections.filter(section => !programIds.length || programIds.includes(idOf(section.programId)) || names.has(String(section.program || "").trim().toLowerCase()));
    if (session.programDates?.length) {
      const missingCalendars = scopedSectionRecords.filter(section => !resolveProgramCalendar(session.programDates || [], section, programs));
      if (missingCalendars.length) return res.status(409).json({ message: "Academic program dates changed after preview. Configure the affected program calendars and generate a fresh preview.", sections: missingCalendars.map(section => [section.program, section.semester, section.name].filter(Boolean).join(" · ")) });
    }
    const scopedSections = new Set(scopedSectionRecords.map(idOf));
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
        notes: fresh.sourceType === "EXCEL_IMPORT"
          ? "Created from a reviewed manual Excel timetable import."
          : "Created from a reviewed generation preview."
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
