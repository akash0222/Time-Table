import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { validateTimetable } from "./services/timetable/validator.js";
import Faculty from "./models/Faculty.js";
import Subject from "./models/Subject.js";
import Section from "./models/Section.js";
import Room from "./models/Room.js";
import TimeSlot from "./models/TimeSlot.js";
import Program from "./models/Program.js";
import Semester from "./models/Semester.js";
import AcademicSession from "./models/AcademicSession.js";
import Timetable from "./models/Timetable.js";
import SessionPlan from "./models/SessionPlan.js";
import SchedulerSetting from "./models/SchedulerSetting.js";
import { generateTimetable, generateBestTimetable } from "./services/generator.js";
import { calculateFacultyWorkloadCapacity } from "./services/facultyWorkload.js";
import { compareTimetableVersions } from "./services/timetableVersionDiff.js";
import ExcelJS from "exceljs";
import { parseHolidayImportDate, parseHolidayCsv, holidayImportCell } from "./services/holidayImport.js";
import multer from "multer";
import bcrypt from "bcryptjs";
import authRouter from "./routes/auth.js";
import { requireAuth, allowRoles } from "./middleware/auth.js";
import attendanceRouter from "./routes/attendance.js";
import auditRouter from "./routes/audit.js";
import feesRouter from "./routes/fees.js";
import notificationsRouter from "./routes/notifications.js";
import optimizationRouter from "./routes/optimization.js";
import sessionPlanRouter from "./routes/sessionPlan.js";
import studentProfileRouter from "./routes/studentProfile.js";
import studentPromotionRouter from "./routes/studentPromotion.js";
import studentsRouter from "./routes/students.js";
import semesterRouter from "./routes/semesters.js";
import User from "./models/User.js";
import ShareLink from "./models/ShareLink.js";
import Student from "./models/Student.js";
import { filterTimetableEntriesForUser } from "./services/timetableAccess.js";
import { subjectProgramMatchesSection } from "./services/subjectProgramMapping.js";
import { subjectWeeklyLimitIssue } from "./services/subjectSessionConstraints.js";
import { timeSlotInputIssue, timeSlotConflictIssue } from "./services/timeSlotValidation.js";
import { normalizeProgramDates, programDateInputIssue, sessionDateBounds, sessionDateBoundsIssue } from "./services/programDateValidation.js";
import { workflowNoteRequired } from "./services/timetableWorkflow.js";
import { seedDemoData } from "./services/demoSeed.js";
import { resolveTimeSlotsForSection, resolveProgramCalendar } from "./services/timetable/academicCalendar.js";

const app = express();
globalThis.__APP_STARTED_AT = Date.now();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

const isProduction = env.isProduction;

// Normalize configured entries to URL origins so a harmless trailing slash in
// Render's CORS_ORIGINS/CLIENT_URL value cannot reject the browser's Origin.
function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

const configuredOrigins = new Set([
  ...env.corsOrigins.map(normalizeOrigin),
  // Canonical production frontend. This explicit entry protects the deployed
  // site from accidental Render env-var drift while the rest stay configurable.
  "https://time-table-beige-three.vercel.app"
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredOrigins.size === 0 && !isProduction) return callback(null, true);
    const normalized = normalizeOrigin(origin);
    if (normalized && configuredOrigins.has(normalized)) return callback(null, true);
    console.warn("[CORS] Rejected origin:", origin);
    return callback(new Error("CORS origin not allowed."));
  },
  credentials: false
}));
app.use(express.json({ limit: env.jsonBodyLimit }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// Modular API routes. Keep these mounted before the server starts so the
// frontend endpoints (especially /api/auth/login) are actually registered.
app.use("/api/auth", authRouter);
// All modular application APIs below require an authenticated user.
// Several route handlers use req.user.role / req.user.id for authorization
// and data scoping, so mounting requireAuth here prevents undefined req.user
// errors and keeps the API consistently protected.
app.use("/api/attendance", requireAuth, attendanceRouter);
app.use("/api/audit", requireAuth, auditRouter);
app.use("/api/fees", requireAuth, feesRouter);
app.use("/api/notifications", requireAuth, notificationsRouter);
app.use("/api/timetable/optimization", requireAuth, optimizationRouter);
app.use("/api/session-plans", requireAuth, sessionPlanRouter);
app.use("/api/student-profiles", requireAuth, studentProfileRouter);
app.use("/api/student-promotions", requireAuth, studentPromotionRouter);
app.use("/api/students", requireAuth, studentsRouter);
app.use("/api/semesters", requireAuth, semesterRouter);

app.get("/api/settings", requireAuth, async (_req, res) => {
  const defaults = {
    key: "default",
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    holidayDays: ["Sunday"]
  };
  try {
    const sessionId = String(_req.query?.sessionId || "").trim();
    const baseSettings = await SchedulerSetting.findOne({ key: "default" }).lean();
    const session = sessionId && Array.isArray(baseSettings?.sessionOverrides)
      ? baseSettings.sessionOverrides.find(x => String(x.academicSession) === sessionId)
      : null;
    return res.json({
      ...defaults,
      ...(baseSettings || {}),
      ...(session || {}),
      key: "default",
      academicSession: sessionId || null,
      generationRuns: Number(session?.generationRuns ?? baseSettings?.generationRuns ?? env.schedulerGenerationRuns),
      generationTimeLimitMs: Number(session?.generationTimeLimitMs ?? baseSettings?.generationTimeLimitMs ?? env.schedulerGenerationTimeLimitMs),
      generationAttempts: Number(session?.generationAttempts ?? baseSettings?.generationAttempts ?? env.schedulerGenerationAttempts)
    });
  } catch (e) {
    console.error("GET /api/settings failed:", e.message);
    return res.json({ ...defaults, warning: "Scheduler settings could not be loaded; defaults are being used." });
  }
});

app.put("/api/settings", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const body = {
      maxConsecutiveFaculty: Number(req.body.maxConsecutiveFaculty || 2),
      maxConsecutiveSection: Number(req.body.maxConsecutiveSection || 3),
      avoidSameSubjectSameDay: Boolean(req.body.avoidSameSubjectSameDay),
      distributeSubjectAcrossDays: Boolean(req.body.distributeSubjectAcrossDays),
      avoidFirstLastPeriod: Boolean(req.body.avoidFirstLastPeriod),
      holidayDays: ["Sunday", ...(Array.isArray(req.body.holidayDays) ? req.body.holidayDays.map(x=>String(x).trim()).filter(Boolean) : [])]
        .filter((v,i,a)=>a.indexOf(v)===i),
      generationRuns: Math.max(1, Math.min(30, Number(req.body.generationRuns || env.schedulerGenerationRuns))),
      generationTimeLimitMs: Math.max(1000, Math.min(120000, Number(req.body.generationTimeLimitMs || env.schedulerGenerationTimeLimitMs))),
      generationAttempts: Math.max(50, Math.min(5000, Number(req.body.generationAttempts || env.schedulerGenerationAttempts)))
    };

    const sessionId = String(req.body?.academicSessionId || req.query?.sessionId || "").trim();
    const current = await SchedulerSetting.findOne({ key: "default" }).lean();
    let settings = current;
    if (!sessionId) {
      settings = await SchedulerSetting.findOneAndUpdate(
        { key: "default" },
        { ...body, key: "default" },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } else {
      const base = current || { key: "default", holidayDays: ["Sunday"] };
      const overrides = Array.isArray(base.sessionOverrides) ? [...base.sessionOverrides] : [];
      const index = overrides.findIndex(x => String(x.academicSession) === sessionId);
      const override = { academicSession: sessionId, ...body };
      if (index >= 0) overrides[index] = override;
      else overrides.push(override);
      settings = await SchedulerSetting.findOneAndUpdate(
        { key: "default" },
        { ...body, key: "default", sessionOverrides: overrides },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      return res.json({ ...settings.toObject(), ...override, key: "default", academicSession: sessionId });
    }
    res.json(settings);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});



function cleanHolidayDates(values){
  const dates=[...new Set((Array.isArray(values)?values:[]).map(v=>String(v).trim()).filter(Boolean))];
  const valid=[];
  for(const value of dates){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid holiday date: ${value}`);
    const d=new Date(`${value}T00:00:00.000Z`);
    if(Number.isNaN(d.valueOf()) || d.toISOString().slice(0,10)!==value) throw new Error(`Invalid holiday date: ${value}`);
    if(d.getUTCDay()===0) continue; // Sunday is an automatic holiday.
    valid.push(value);
  }
  return valid.sort();
}



app.get("/api/sessions", requireAuth, async (_req,res)=>{
  try{
    const rows=await AcademicSession.find().populate("programDates.program","name code").sort({createdAt:-1}).lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/sessions/active", requireAuth, async (_req,res)=>{
  try{
    const row=await AcademicSession.findOne({active:true}).populate("programDates.program","name code").lean();
    res.json(row||null);
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/academic-sessions/:id", requireAuth, async (req,res)=>{
  try{
    const row=await AcademicSession.findById(req.params.id).populate("programDates.program","name code").lean();
    if(!row)return res.status(404).json({message:"Academic session not found."});
    res.json(row);
  }catch(e){res.status(400).json({message:e.message});}
});

app.post("/api/sessions", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role)) return res.status(403).json({message:"Only Admin or Scheduler can create academic sessions."});
  try{
    const body=req.body||{};
    const programDates=normalizeProgramDates(body.programDates);
    if(!body.name?.trim())return res.status(400).json({message:"Academic session name is required."});
    const dateIssue=programDateInputIssue(programDates);
    if(dateIssue)return res.status(400).json({message:dateIssue});
    const programIds=[...new Set(programDates.map(item=>item.program))];
    const validPrograms=await Program.find({_id:{$in:programIds},active:{$ne:false}}).select("_id").lean();
    if(validPrograms.length!==programIds.length)return res.status(400).json({message:"One or more program calendars reference a missing or inactive program."});
    const bounds=sessionDateBounds(programDates,body.startDate,body.endDate);
    const boundsIssue=sessionDateBoundsIssue(programDates,bounds.startDate,bounds.endDate);
    if(boundsIssue)return res.status(400).json({message:boundsIssue});
    const startDate=new Date(bounds.startDate+"T00:00:00.000Z");
    const endDate=new Date(bounds.endDate+"T00:00:00.000Z");
    const row=await AcademicSession.create({
      name:body.name.trim(),description:String(body.description||"").trim(),
      programDates,startDate,endDate,active:false,holidayDates:[]
    });
    res.status(201).json(await AcademicSession.findById(row._id).populate("programDates.program","name code").lean());
  }catch(e){res.status(400).json({message:e.code===11000?"An academic session with this name already exists.":e.message});}
});

app.put("/api/sessions/:id", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role)) return res.status(403).json({message:"Only Admin or Scheduler can update academic sessions."});
  try{
    const row=await AcademicSession.findById(req.params.id);
    if(!row)return res.status(404).json({message:"Academic session not found."});
    const body=req.body||{};
    if(body.name!==undefined) row.name=String(body.name).trim();
    if(body.description!==undefined) row.description=String(body.description||"").trim();
    if(body.programDates!==undefined){
      const programDates=normalizeProgramDates(body.programDates);
      const dateIssue=programDateInputIssue(programDates);
      if(dateIssue)return res.status(400).json({message:dateIssue});
      const programIds=[...new Set(programDates.map(item=>item.program))];
      const validPrograms=await Program.find({_id:{$in:programIds},active:{$ne:false}}).select("_id").lean();
      if(validPrograms.length!==programIds.length)return res.status(400).json({message:"One or more program calendars reference a missing or inactive program."});
      const bounds=sessionDateBounds(programDates,body.startDate,body.endDate);
      const boundsIssue=sessionDateBoundsIssue(programDates,bounds.startDate,bounds.endDate);
      if(boundsIssue)return res.status(400).json({message:boundsIssue});
      row.programDates=programDates;
      row.startDate=new Date(bounds.startDate+"T00:00:00.000Z");
      row.endDate=new Date(bounds.endDate+"T00:00:00.000Z");
    }
    await row.save();
    res.json(await AcademicSession.findById(row._id).populate("programDates.program","name code").lean());
  }catch(e){res.status(400).json({message:e.code===11000?"An academic session with this name already exists.":e.message});}
});

app.post("/api/sessions/:id/activate", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role))return res.status(403).json({message:"Only Admin or Scheduler can activate an academic session."});
  try{
    const row=await AcademicSession.findById(req.params.id);
    if(!row)return res.status(404).json({message:"Academic session not found."});
    await AcademicSession.updateMany({},{$set:{active:false}});
    row.active=true;await row.save();
    res.json(await AcademicSession.findById(row._id).populate("programDates.program","name code").lean());
  }catch(e){res.status(400).json({message:e.message});}
});


app.post("/api/sessions/:id/holidays/preview-import", requireAuth, allowRoles("ADMIN", "SCHEDULER"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose an .xlsx or .csv holiday list first." });
    const fileName = String(req.file.originalname || "").trim();
    const extension = fileName.toLowerCase().split(".").pop();
    let matrix = [];

    if (extension === "csv") {
      matrix = parseHolidayCsv(req.file.buffer.toString("utf8"));
    } else if (extension === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return res.status(400).json({ message: "The Excel file does not contain a worksheet." });
      worksheet.eachRow({ includeEmpty: false }, excelRow => {
        matrix.push(excelRow.values.slice(1).map(holidayImportCell));
      });
    } else {
      return res.status(400).json({ message: "Unsupported file format. Upload an .xlsx Excel file or a .csv file." });
    }

    if (!matrix.length) return res.status(400).json({ message: "The uploaded holiday list is empty." });

    const firstRowHeadings = (matrix[0] || []).map(value => String(value ?? "").trim().toLowerCase());
    const detectedDateColumn = firstRowHeadings.findIndex(value => /date/.test(value));
    const hasHeader = detectedDateColumn >= 0;
    const headings = hasHeader ? firstRowHeadings : [];
    const dateColumn = hasHeader ? detectedDateColumn : 0;
    const nameColumn = hasHeader ? headings.findIndex(value => /holiday\s*name|name|occasion|holiday/.test(value) && !/date/.test(value)) : -1;
    const descriptionColumn = hasHeader ? headings.findIndex(value => /description|notes?/.test(value)) : -1;
    const firstDataRow = hasHeader ? 1 : 0;
    const academicSession = await AcademicSession.findById(req.params.id).lean();
    if (!academicSession) return res.status(404).json({ message: "Academic session not found." });

    const start = academicSession.startDate ? new Date(academicSession.startDate).toISOString().slice(0, 10) : "";
    const end = academicSession.endDate ? new Date(academicSession.endDate).toISOString().slice(0, 10) : "";
    const existing = new Set((academicSession.holidayDates || []).map(value => String(value).slice(0, 10)));
    const seen = new Set();
    const rows = [];

    for (let index = firstDataRow; index < matrix.length; index += 1) {
      const values = matrix[index] || [];
      const rawDate = holidayImportCell(values[dateColumn]);
      const holidayName = nameColumn >= 0 ? String(holidayImportCell(values[nameColumn]) ?? "").trim() : "";
      const description = descriptionColumn >= 0 ? String(holidayImportCell(values[descriptionColumn]) ?? "").trim() : "";
      const hasAnyValue = values.some(value => String(value ?? "").trim());
      if (!hasAnyValue) continue;
      const displayValue = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate ?? "").trim();
      const date = parseHolidayImportDate(rawDate);
      const result = { rowNumber: index + 1, sourceDate: displayValue, date: date || "", holidayName, description, status: "valid", reason: "" };

      if (!date) {
        result.status = "invalid";
        result.reason = "Invalid or missing date. Use YYYY-MM-DD or DD-MM-YYYY.";
      } else if (existing.has(date)) {
        result.status = "skipped";
        result.reason = "This holiday is already configured for the selected session.";
      } else if (seen.has(date)) {
        result.status = "skipped";
        result.reason = "This date appears more than once in the uploaded file.";
      } else if (new Date(date + "T00:00:00.000Z").getUTCDay() === 0) {
        result.status = "skipped";
        result.reason = "Sunday is already an automatic holiday.";
        seen.add(date);
      } else if ((start && date < start) || (end && date > end)) {
        result.status = "invalid";
        result.reason = "Date is outside the selected academic session (" + start + " to " + end + ").";
        seen.add(date);
      } else {
        seen.add(date);
      }
      rows.push(result);
    }

    if (!rows.length) return res.status(400).json({ message: "No holiday rows were found. Add a Date column and at least one date." });
    return res.json({
      fileName,
      sessionName: academicSession.name,
      rows,
      summary: {
        total: rows.length,
        valid: rows.filter(item => item.status === "valid").length,
        skipped: rows.filter(item => item.status === "skipped").length,
        invalid: rows.filter(item => item.status === "invalid").length
      }
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to read this holiday file." });
  }
});

app.patch("/api/sessions/:id/holidays", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role))return res.status(403).json({message:"Only Admin or Scheduler can manage holidays."});
  try{
    const row=await AcademicSession.findById(req.params.id);
    if(!row)return res.status(404).json({message:"Academic session not found."});
    const holidays=cleanHolidayDates(req.body?.holidayDates);
    if(row.startDate&&row.endDate){
      const start=row.startDate.toISOString().slice(0,10), end=row.endDate.toISOString().slice(0,10);
      const outside=holidays.find(d=>d<start||d>end);
      if(outside)return res.status(400).json({message:`Holiday ${outside} is outside the academic session range ${start} to ${end}.`});
    }
    const detailInput = Array.isArray(req.body?.holidayDetails) ? req.body.holidayDetails : (row.holidayDetails || []);
    const allowedDates = new Set(holidays);
    const detailByDate = new Map();
    for (const item of detailInput) {
      const date = String(item?.date || "").slice(0,10);
      if (!allowedDates.has(date)) continue;
      const name = String(item?.name || "").trim().slice(0,160);
      const description = String(item?.description || "").trim().slice(0,400);
      if (name || description) detailByDate.set(date, {date, name, description});
    }
    row.holidayDates=holidays;
    row.holidayDetails=[...detailByDate.values()];
    await row.save();
    res.json(await AcademicSession.findById(row._id).populate("programDates.program","name code").lean());
  }catch(e){res.status(400).json({message:e.message});}
});


// ---------------- Academic Structure ----------------
// Program -> Semester -> Section is the canonical academic structure.
// Section.programId is the authoritative Program relationship; section.program/semester/name
// are retained as human-readable compatibility fields for existing timetable data.
app.get("/api/academic-structure", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").trim();
    const sessionFilter = sessionId ? { academicSession: sessionId } : {};
    const [programs, sections, students] = await Promise.all([
      Program.find({ active: { $ne: false } }).sort({ name: 1 }).lean(),
      Section.find(sessionFilter).populate("programId", "name code").populate("academicSession", "name active").sort({ program: 1, semester: 1, name: 1 }).lean(),
      Student.find({ active: { $ne: false } }).select("section").lean()
    ]);
    const counts = new Map();
    for (const st of students) {
      const key = String(st.section || "");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const normalizedSections = sections.map(s => ({ ...s, studentCount: counts.get(String(s._id)) || 0 }));
    const byProgram = programs.map(program => ({
      program,
      semesters: [...new Set(normalizedSections.filter(s => String(s.programId?._id || s.programId || "") === String(program._id) || String(s.program || "").trim().toLowerCase() === String(program.name || "").trim().toLowerCase()).map(s => s.semester))].sort(),
      sections: normalizedSections.filter(s => String(s.programId?._id || s.programId || "") === String(program._id) || String(s.program || "").trim().toLowerCase() === String(program.name || "").trim().toLowerCase())
    }));
    res.json({ sessionId: sessionId || null, programs: byProgram, sections: normalizedSections });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/academic-structure/sections", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage sections." });
  try {
    const { programId, academicSession, semester, name, maxClassesPerDay, capacity } = req.body || {};
    if (!programId || !academicSession || !String(semester || "").trim() || !String(name || "").trim()) {
      return res.status(400).json({ message: "Academic Session, Program, configured Semester and Section Name are required." });
    }
    const program = await Program.findById(programId).lean();
    if (!program) return res.status(404).json({ message: "Program not found." });
    const session = await AcademicSession.findById(academicSession).lean();
    if (!session) return res.status(404).json({ message: "Academic Session not found." });
    const programLinked = (session.programDates || []).some(row => String(row.program?._id || row.program) === String(programId));
    if (!programLinked) return res.status(400).json({ message: "This Program is not linked to the selected Academic Session. Link it in Academic Sessions first." });
    const semesterName = String(semester).trim();
    const semesterMaster = await Semester.findOne({ academicSession, program: programId, name: semesterName, active: true }).lean();
    if (!semesterMaster) return res.status(400).json({ message: "Select a semester configured for this Academic Session and Program in Master Data Settings → Semesters." });
    const existing = await Section.findOne({ programId, academicSession, semester: semesterName, name: String(name).trim() });
    if (existing) return res.status(409).json({ message: "This section already exists for the selected Program, Semester and Academic Session." });
    const row = await Section.create({ programId, academicSession, program: program.name, semester: semesterName, name: String(name).trim(), maxClassesPerDay: Number(maxClassesPerDay || 6), capacity: Number(capacity || 0) });
    res.status(201).json(await Section.findById(row._id).populate("programId", "name code").populate("academicSession", "name active").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put("/api/academic-structure/sections/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage sections." });
  try {
    const row = await Section.findById(req.params.id);
    if (!row) return res.status(404).json({ message: "Section not found." });

    const body = req.body || {};
    const nextProgramId = body.programId !== undefined ? (body.programId || null) : (row.programId || null);
    const nextSessionId = body.academicSession !== undefined ? (body.academicSession || null) : (row.academicSession || null);
    const nextSemester = body.semester !== undefined ? String(body.semester).trim() : String(row.semester || "").trim();
    const nextName = body.name !== undefined ? String(body.name).trim() : String(row.name || "").trim();

    let nextProgram = null;
    if (nextProgramId) {
      nextProgram = await Program.findById(nextProgramId).lean();
      if (!nextProgram) return res.status(404).json({ message: "Program not found." });
    }
    if (body.academicSession !== undefined && nextSessionId) {
      const session = await AcademicSession.findById(nextSessionId).lean();
      if (!session) return res.status(404).json({ message: "Academic Session not found." });
    }
    if (!nextSemester || !nextName) return res.status(400).json({ message: "Semester and Section Name are required." });

    const currentLegacyProgram = String(row.program || "").trim().toLowerCase();
    const nextLegacyProgram = String(nextProgram?.name || (body.program !== undefined ? body.program : row.program) || "").trim().toLowerCase();
    const programChanged = String(nextProgramId || "") !== String(row.programId || "")
      || (!nextProgramId && currentLegacyProgram !== nextLegacyProgram);
    const sessionChanged = String(nextSessionId || "") !== String(row.academicSession || "");
    const semesterChanged = nextSemester !== String(row.semester || "").trim();
    const mappingChanged = programChanged || sessionChanged || semesterChanged;
    if (mappingChanged) {
      if (!nextProgramId || !nextSessionId) return res.status(400).json({ message: "A section must be mapped to a Program and Academic Session. Create a configured semester before changing this mapping." });
      const targetSession = await AcademicSession.findById(nextSessionId).lean();
      if (!targetSession) return res.status(404).json({ message: "Academic Session not found." });
      const programLinked = (targetSession.programDates || []).some(item => String(item.program?._id || item.program) === String(nextProgramId));
      if (!programLinked) return res.status(400).json({ message: "This Program is not linked to the selected Academic Session. Link it in Academic Sessions first." });
      const semesterMaster = await Semester.findOne({ academicSession: nextSessionId, program: nextProgramId, name: nextSemester, active: true }).lean();
      if (!semesterMaster) return res.status(400).json({ message: "Select a semester configured for this Program and Academic Session in Master Data Settings → Semesters." });
    }
    if (mappingChanged) {
      const [studentCount, subjectCount] = await Promise.all([
        Student.countDocuments({ section: row._id }),
        Subject.countDocuments({ section: row._id })
      ]);
      if (studentCount || subjectCount) {
        return res.status(409).json({
          message: `This section has linked records (${studentCount} student record(s), ${subjectCount} subject mapping(s)). Create the target section and use student promotion/subject mapping workflows rather than changing its program or academic session in place.`
        });
      }
    }

    const duplicateFilter = {
      _id: { $ne: row._id },
      academicSession: nextSessionId,
      semester: nextSemester,
      name: nextName
    };
    if (nextProgramId) duplicateFilter.programId = nextProgramId;
    else duplicateFilter.program = String(body.program !== undefined ? body.program : row.program || "").trim();
    const duplicate = await Section.findOne(duplicateFilter).lean();
    if (duplicate) return res.status(409).json({ message: "This section already exists for the selected Program, Semester and Academic Session." });

    if (nextProgramId) {
      row.programId = nextProgramId;
      row.program = nextProgram.name;
    } else if (body.program !== undefined) {
      row.program = String(body.program || "").trim();
    }
    if (body.academicSession !== undefined) row.academicSession = nextSessionId;
    row.semester = nextSemester;
    row.name = nextName;
    if (body.maxClassesPerDay !== undefined) row.maxClassesPerDay = Number(body.maxClassesPerDay || 6);
    if (body.capacity !== undefined) row.capacity = Math.max(Number(body.capacity || 0), 0);

    await row.save();
    res.json(await Section.findById(row._id).populate("programId", "name code").populate("academicSession", "name active").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.delete("/api/academic-structure/sections/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage sections." });
  try {
    const row = await Section.findById(req.params.id).select("_id name");
    if (!row) return res.status(404).json({ message: "Section not found." });
    const [studentCount, subjectCount, timetableCount, sessionPlanCount] = await Promise.all([
      Student.countDocuments({ section: row._id }),
      Subject.countDocuments({ section: row._id }),
      Timetable.countDocuments({ "entries.section": row._id }),
      SessionPlan.countDocuments({ "weeks.entries.section": row._id })
    ]);
    if (studentCount || subjectCount || timetableCount || sessionPlanCount) {
      return res.status(409).json({
        message: `Cannot delete section "${row.name}" while it is referenced by ${studentCount} student record(s), ${subjectCount} subject mapping(s), ${timetableCount} timetable version(s), or ${sessionPlanCount} full-session plan(s). Reassign/archive linked records first.`
      });
    }
    await Section.findByIdAndDelete(row._id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

async function resolveProgramFromText(value) {
  const wanted = String(value || "").trim().toLowerCase();
  if (!wanted) return null;
  const candidates = await Program.find().select("_id name code").lean();
  return candidates.find(program =>
    [program.name, program.code].some(candidate =>
      String(candidate || "").trim().toLowerCase() === wanted
    )
  ) || null;
}

function crud(path, Model) {
  app.get(`/api/${path}`, requireAuth, async (_req,res) => {
    try { res.json(await Model.find().sort({ createdAt: -1 })); }
    catch(e) { res.status(500).json({message:e.message}); }
  });
  app.post(`/api/${path}`, requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try {
      const body = {...(req.body || {})};

      if (path === "sections") {
        if (body.programId) {
          const program = await Program.findById(body.programId).lean();
          if (!program) return res.status(404).json({message:"Program not found."});
          body.program = program.name;
        } else if (body.program) {
          const program = await resolveProgramFromText(body.program);
          if (program) {
            body.programId = program._id;
            body.program = program.name;
          }
        }
        if (body.academicSession) {
          const session = await AcademicSession.findById(body.academicSession).lean();
          if (!session) return res.status(404).json({message:"Academic Session not found."});
        } else {
          const active = await AcademicSession.findOne({active:true}).select("_id").lean();
          if (active) body.academicSession = active._id;
        }
        if (body.programId && body.academicSession) {
          const session = await AcademicSession.findById(body.academicSession).lean();
          const programLinked = (session?.programDates || []).some(row => String(row.program) === String(body.programId));
          if (!programLinked) return res.status(400).json({message:"Link this Program to the selected Academic Session first in Academic Sessions."});
          const semesterName = String(body.semester || "").trim();
          const semesterMaster = semesterName ? await Semester.findOne({academicSession:body.academicSession,program:body.programId,name:semesterName,active:true}).lean() : null;
          if (!semesterMaster) return res.status(400).json({message:"Select a semester configured for this Academic Session and Program in Master Data Settings → Semesters."});
        }
      }

      if (path === "subjects") {
        if (!body.section || !body.faculty || !body.name) {
          return res.status(400).json({message:"Subject Name, Faculty and Section are required."});
        }
        const [section, faculty] = await Promise.all([
          Section.findById(body.section).lean(),
          Faculty.findById(body.faculty).lean()
        ]);
        if (!section) return res.status(404).json({message:"Section not found."});
        if (!faculty) return res.status(404).json({message:"Faculty not found."});
        let sessionId = body.academicSession || section.academicSession || "";
        if (!sessionId) sessionId = (await AcademicSession.findOne({active:true}).select("_id").lean())?._id || "";
        if (!sessionId) return res.status(400).json({message:"Set an active academic session or use Subject & Faculty Mapping to assign this subject."});
        const session = await AcademicSession.findById(sessionId).select("_id").lean();
        if (!session) return res.status(404).json({message:"Academic Session not found."});
        if (section.academicSession && String(section.academicSession) !== String(session._id)) {
          return res.status(400).json({message:"Selected section belongs to a different Academic Session."});
        }
        let programId = body.programId || section.programId || null;
        let program = programId ? await Program.findById(programId).lean() : null;
        if (body.programId && !program) return res.status(404).json({message:"Program not found."});
        if (!program && section.program) program = await resolveProgramFromText(section.program);
        if (program && !subjectProgramMatchesSection(section, program)) {
          return res.status(400).json({message:"Selected program does not match the selected section."});
        }
        body.academicSession = session._id;
        body.programId = program?._id || section.programId || null;
        const weeklyIssue = subjectWeeklyLimitIssue(body);
        if (weeklyIssue) return res.status(400).json({message:weeklyIssue});
      }

      if (path === "timeslots") {
        if (body.academicSession === "") body.academicSession = null;
        if (body.program === "") body.program = null;
        body.semester = String(body.semester || "").trim();
        const slotIssue = timeSlotInputIssue(body);
        if (slotIssue) return res.status(400).json({ message: slotIssue });
        if (body.academicSession) {
          const session = await AcademicSession.findById(body.academicSession).lean();
          if (!session) return res.status(404).json({ message: "Academic Session not found." });
        }
        if (body.program) {
          const program = await Program.findById(body.program).lean();
          if (!program) return res.status(404).json({ message: "Program not found." });
        }
        if (body.semester && body.program && body.academicSession) {
          const session = await AcademicSession.findById(body.academicSession).lean();
          if (!(session?.programDates || []).some(row => String(row.program) === String(body.program))) {
            return res.status(400).json({message:"The selected Program is not linked to this Academic Session."});
          }
          const semester = await Semester.findOne({academicSession:body.academicSession,program:body.program,name:body.semester,active:true}).lean();
          if (!semester) return res.status(400).json({message:"Select a Semester configured for this Academic Session and Program."});
        }
        const conflict = timeSlotConflictIssue(body, await TimeSlot.find({ day: String(body.day).trim() }).lean());
        if (conflict) return res.status(409).json({ message: conflict });
      }

      res.status(201).json(await Model.create(body));
    } catch(e) { res.status(400).json({message:e.message}); }
  });
  app.put(`/api/${path}/:id`, requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try {
      const body = {...req.body};
      delete body._id;
      delete body.createdAt;
      delete body.updatedAt;

      if (path === "sections") {
        const row = await Section.findById(req.params.id).lean();
        if (!row) return res.status(404).json({message:"Record not found"});
        const nextSessionId = body.academicSession !== undefined ? (body.academicSession || null) : (row.academicSession || null);
        if (body.academicSession !== undefined && nextSessionId) {
          const session = await AcademicSession.findById(nextSessionId).lean();
          if (!session) return res.status(404).json({message:"Academic Session not found."});
        }
        let nextProgram = null;
        if (body.programId !== undefined) {
          nextProgram = body.programId ? await Program.findById(body.programId).lean() : null;
          if (body.programId && !nextProgram) return res.status(404).json({message:"Program not found."});
        } else if (body.program !== undefined) {
          nextProgram = await resolveProgramFromText(body.program);
        } else if (row.programId) {
          nextProgram = await Program.findById(row.programId).lean();
        }
        const nextProgramId = nextProgram?._id || (body.programId === undefined && body.program === undefined ? (row.programId || null) : null);
        const nextProgramText = String(nextProgram?.name || (body.program !== undefined ? body.program : row.program) || "").trim();
        const nextSemester = String(body.semester !== undefined ? body.semester : row.semester || "").trim();
        const nextName = String(body.name !== undefined ? body.name : row.name || "").trim();
        if (nextProgramId && nextSessionId) {
          const session = await AcademicSession.findById(nextSessionId).lean();
          if (!session || !(session.programDates || []).some(item => String(item.program) === String(nextProgramId))) {
            return res.status(400).json({message:"Link this Program to the selected Academic Session first in Academic Sessions."});
          }
          const semesterMaster = await Semester.findOne({academicSession:nextSessionId,program:nextProgramId,name:nextSemester,active:true}).lean();
          if (!semesterMaster) return res.status(400).json({message:"Select a semester configured for this Academic Session and Program in Master Data Settings → Semesters."});
        }
        const programChanged = String(nextProgramId || "") !== String(row.programId || "")
          || (!nextProgramId && nextProgramText.toLowerCase() !== String(row.program || "").trim().toLowerCase());
        const sessionChanged = String(nextSessionId || "") !== String(row.academicSession || "");
        const semesterChanged = nextSemester !== String(row.semester || "").trim();
        if (programChanged || sessionChanged || semesterChanged) {
          const [studentCount, subjectCount] = await Promise.all([
            Student.countDocuments({section:row._id}),
            Subject.countDocuments({section:row._id})
          ]);
          if (studentCount || subjectCount) return res.status(409).json({
            message:`This section has linked records (${studentCount} student record(s), ${subjectCount} subject mapping(s)). Create a target section and use student promotion/mapping workflows rather than changing its program, semester or academic session in place.`
          });
        }
        const duplicateFilter = {_id:{$ne:row._id},academicSession:nextSessionId,semester:nextSemester,name:nextName};
        if (nextProgramId) duplicateFilter.programId = nextProgramId;
        else duplicateFilter.program = nextProgramText;
        const duplicate = await Section.findOne(duplicateFilter).lean();
        if (duplicate) return res.status(409).json({message:"This section already exists for the selected Program, Semester and Academic Session."});
        if (nextProgramId) {
          body.programId = nextProgramId;
          body.program = nextProgram?.name || nextProgramText;
        } else if (body.program !== undefined) {
          body.program = nextProgramText;
          body.programId = null;
        }
        if (body.academicSession !== undefined) body.academicSession = nextSessionId;
      }

      if (path === "subjects") {
        const row = await Subject.findById(req.params.id).lean();
        if (!row) return res.status(404).json({message:"Record not found"});
        const sectionId = body.section !== undefined ? body.section : row.section;
        const facultyId = body.faculty !== undefined ? body.faculty : row.faculty;
        const [section, faculty] = await Promise.all([
          Section.findById(sectionId).lean(),
          Faculty.findById(facultyId).lean()
        ]);
        if (!section) return res.status(404).json({message:"Section not found."});
        if (!faculty) return res.status(404).json({message:"Faculty not found."});
        let sessionId = body.academicSession !== undefined ? (body.academicSession || "") : (row.academicSession || section.academicSession || "");
        if (!sessionId) sessionId = (await AcademicSession.findOne({active:true}).select("_id").lean())?._id || "";
        if (!sessionId) return res.status(400).json({message:"Set an active academic session or use Subject & Faculty Mapping to assign this subject."});
        const session = await AcademicSession.findById(sessionId).select("_id").lean();
        if (!session) return res.status(404).json({message:"Academic Session not found."});
        if (section.academicSession && String(section.academicSession) !== String(session._id)) {
          return res.status(400).json({message:"Selected section belongs to a different Academic Session."});
        }
        let programId = body.programId !== undefined ? (body.programId || null) : (section.programId || row.programId || null);
        let program = programId ? await Program.findById(programId).lean() : null;
        if (body.programId && !program) return res.status(404).json({message:"Program not found."});
        if (!program && section.program) program = await resolveProgramFromText(section.program);
        if (program && !subjectProgramMatchesSection(section, program)) {
          return res.status(400).json({message:"Selected program does not match the selected section."});
        }
        body.academicSession = session._id;
        body.programId = program?._id || section.programId || row.programId || null;
        const weeklyIssue = subjectWeeklyLimitIssue({
          classesPerWeek: body.classesPerWeek ?? row.classesPerWeek,
          totalSessions: body.totalSessions ?? row.totalSessions,
          maxClassesPerWeek: body.maxClassesPerWeek ?? row.maxClassesPerWeek
        });
        if (weeklyIssue) return res.status(400).json({message:weeklyIssue});
      }

      if (path === "timeslots") {
        const row = await TimeSlot.findById(req.params.id).lean();
        if (!row) return res.status(404).json({ message: "Record not found" });
        if (body.academicSession === "") body.academicSession = null;
        if (body.program === "") body.program = null;
        if (body.semester !== undefined) body.semester = String(body.semester || "").trim();
        const candidate = { ...row, ...body };
        const slotIssue = timeSlotInputIssue(candidate);
        if (slotIssue) return res.status(400).json({ message: slotIssue });
        if (candidate.academicSession) {
          const session = await AcademicSession.findById(candidate.academicSession).lean();
          if (!session) return res.status(404).json({ message: "Academic Session not found." });
        }
        if (candidate.program) {
          const program = await Program.findById(candidate.program).lean();
          if (!program) return res.status(404).json({ message: "Program not found." });
        }
        if (candidate.semester && candidate.program && candidate.academicSession) {
          const session = await AcademicSession.findById(candidate.academicSession).lean();
          if (!(session?.programDates || []).some(item => String(item.program) === String(candidate.program))) {
            return res.status(400).json({message:"The selected Program is not linked to this Academic Session."});
          }
          const semester = await Semester.findOne({academicSession:candidate.academicSession,program:candidate.program,name:candidate.semester,active:true}).lean();
          if (!semester) return res.status(400).json({message:"Select a Semester configured for this Academic Session and Program."});
        }
        const conflict = timeSlotConflictIssue(
          candidate,
          await TimeSlot.find({ day: String(candidate.day).trim() }).lean(),
          req.params.id
        );
        if (conflict) return res.status(409).json({ message: conflict });
      }

      const updated = await Model.findByIdAndUpdate(
        req.params.id,
        body,
        { new: true, runValidators: true }
      );

      if (!updated) return res.status(404).json({message: "Record not found"});
      res.json(updated);
    } catch(e) {
      res.status(400).json({message:e.message});
    }
  });
  app.delete(`/api/${path}/:id`, requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try {
      const id = req.params.id;
      const dependencyMap = {
        faculty: [
          [Subject, {faculty:id}, "subject assignment(s)"],
          [Timetable, {"entries.faculty":id}, "timetable entry/entries"],
          [SessionPlan, {"weeks.entries.faculty":id}, "full-session plan entry/entries"]
        ],
        subjects: [
          [Timetable, {"entries.subject":id}, "timetable entry/entries"],
          [SessionPlan, {"weeks.entries.subject":id}, "full-session plan entry/entries"]
        ],
        sections: [
          [Student, {section:id}, "student record(s)"],
          [Subject, {section:id}, "subject assignment(s)"],
          [Timetable, {"entries.section":id}, "timetable entry/entries"],
          [SessionPlan, {"weeks.entries.section":id}, "full-session plan entry/entries"]
        ],
        rooms: [
          [Timetable, {"entries.room":id}, "timetable entry/entries"],
          [SessionPlan, {"weeks.entries.room":id}, "full-session plan entry/entries"]
        ],
        timeslots: [],
        programs: [
          [Section, {programId:id}, "section(s)"],
          [Subject, {programId:id}, "subject mapping(s)"],
          [TimeSlot, {program:id}, "time-slot mapping(s)"],
          [Semester, {program:id}, "semester master record(s)"],
          [AcademicSession, {"programDates.program":id}, "academic-session program date(s)"]
        ]
      };
      for(const [Dep, filter, label] of (dependencyMap[path]||[])){
        const count = await Dep.countDocuments(filter);
        if(count) return res.status(409).json({message:`Cannot delete this ${path.slice(0,-1)} because ${count} ${label} depend on it. Resolve the dependencies first.`});
      }
      const deleted = await Model.findByIdAndDelete(id);
      if(!deleted) return res.status(404).json({message:"Record not found"});
      res.json({ok:true});
    } catch(e) { res.status(400).json({message:e.message}); }
  });
}
crud("faculty", Faculty);
crud("subjects", Subject);
crud("sections", Section);
crud("rooms", Room);
crud("timeslots", TimeSlot);
crud("programs", Program);


// ---------------- Phase 3: Subject & Faculty Academic Mapping ----------------
app.get("/api/subject-mappings", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const filter = {};
    if (req.query.sessionId) filter.academicSession = req.query.sessionId;
    if (req.query.sectionId) filter.section = req.query.sectionId;
    if (req.query.facultyId) filter.faculty = req.query.facultyId;
    if (req.query.programId) filter.programId = req.query.programId;
    if (req.query.active !== undefined) filter.active = String(req.query.active) !== "false";
    const rows = await Subject.find(filter)
      .populate("academicSession", "name active")
      .populate("programId", "name code")
      .populate("faculty", "name code")
      .populate("section", "program semester name academicSession")
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/subject-mappings", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage subject mappings." });
  try {
    const b = req.body || {};
    if (!b.academicSession || !b.section || !b.faculty || !b.name) return res.status(400).json({ message: "Academic Session, Section, Faculty and Subject Name are required." });
    const [session, section, faculty, program] = await Promise.all([
      AcademicSession.findById(b.academicSession).lean(),
      Section.findById(b.section).lean(),
      Faculty.findById(b.faculty).lean(),
      b.programId ? Program.findById(b.programId).lean() : null
    ]);
    if (!session) return res.status(404).json({ message: "Academic Session not found." });
    if (!section) return res.status(404).json({ message: "Section not found." });
    if (!faculty) return res.status(404).json({ message: "Faculty not found." });
    if (b.programId && !program) return res.status(404).json({ message: "Program not found." });
    if (section.academicSession && String(section.academicSession) !== String(session._id)) return res.status(400).json({ message: "Selected section belongs to a different Academic Session." });
    if (program && !subjectProgramMatchesSection(section, program)) {
      return res.status(400).json({ message: "Selected program does not match the selected section. Choose the section's program or correct the section mapping first." });
    }
    const programId = program?._id || section.programId || null;
    const exists = await Subject.findOne({ academicSession: session._id, section: section._id, code: String(b.code || "").trim() || undefined, name: String(b.name).trim() });
    if (exists) return res.status(409).json({ message: "This subject is already mapped to the selected section and academic session." });
    const classesPerWeek = Math.max(1, Number(b.classesPerWeek || 1));
    const totalSessions = Math.max(0, Number(b.totalSessions || 0));
    const maxClassesPerWeek = Number(b.maxClassesPerWeek || classesPerWeek);
    const weeklyIssue = subjectWeeklyLimitIssue({classesPerWeek,totalSessions,maxClassesPerWeek});
    if (weeklyIssue) return res.status(400).json({message:weeklyIssue});
    const row = await Subject.create({
      academicSession: session._id,
      programId,
      subjectType: b.subjectType || "CORE",
      active: b.active !== false,
      name: String(b.name).trim(), code: String(b.code || "").trim(),
      faculty: faculty._id, section: section._id,
      classesPerWeek,
      totalSessions,
      maxClassesPerWeek,
      duration: Number(b.duration || 1), roomType: b.roomType || "Classroom"
    });
    res.status(201).json(await Subject.findById(row._id).populate("academicSession", "name active").populate("programId", "name code").populate("faculty", "name code").populate("section", "program semester name academicSession").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put("/api/subject-mappings/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage subject mappings." });
  try {
    const row = await Subject.findById(req.params.id);
    if (!row) return res.status(404).json({ message: "Subject mapping not found." });
    const b = req.body || {};
    const session = b.academicSession ? await AcademicSession.findById(b.academicSession).lean() : await AcademicSession.findById(row.academicSession).lean();
    const section = b.section ? await Section.findById(b.section).lean() : await Section.findById(row.section).lean();
    const faculty = b.faculty ? await Faculty.findById(b.faculty).lean() : await Faculty.findById(row.faculty).lean();
    if (!session || !section || !faculty) return res.status(404).json({ message: "Academic Session, Section or Faculty not found." });
    if (section.academicSession && String(section.academicSession) !== String(session._id)) return res.status(400).json({ message: "Selected section belongs to a different Academic Session." });
    const explicitProgram = b.programId ? await Program.findById(b.programId).lean() : null;
    if (b.programId && !explicitProgram) return res.status(404).json({ message: "Program not found." });
    const programId = explicitProgram?._id || section.programId || row.programId || null;
    const mappedProgram = explicitProgram || (programId ? await Program.findById(programId).lean() : null);
    if (mappedProgram && !subjectProgramMatchesSection(section, mappedProgram)) {
      return res.status(400).json({ message: "Selected program does not match the selected section. Choose the section's program or correct the section mapping first." });
    }
    const nextClassesPerWeek = b.classesPerWeek !== undefined ? Number(b.classesPerWeek) : Number(row.classesPerWeek || 1);
    const nextTotalSessions = b.totalSessions !== undefined ? Number(b.totalSessions || 0) : Number(row.totalSessions || 0);
    const nextMaxClassesPerWeek = b.maxClassesPerWeek !== undefined
      ? Number(b.maxClassesPerWeek || 0)
      : Number(row.maxClassesPerWeek || b.classesPerWeek || row.classesPerWeek || 1);
    const weeklyIssue = subjectWeeklyLimitIssue({
      classesPerWeek:nextClassesPerWeek,
      totalSessions:nextTotalSessions,
      maxClassesPerWeek:nextMaxClassesPerWeek
    });
    if (weeklyIssue) return res.status(400).json({message:weeklyIssue});
    Object.assign(row, {
      academicSession: session._id,
      programId,
      subjectType: b.subjectType !== undefined ? b.subjectType : (row.subjectType || "CORE"),
      active: b.active !== undefined ? Boolean(b.active) : row.active !== false,
      name: b.name !== undefined ? String(b.name).trim() : row.name,
      code: b.code !== undefined ? String(b.code || "").trim() : row.code,
      faculty: faculty._id,
      section: section._id,
      classesPerWeek: nextClassesPerWeek,
      totalSessions: nextTotalSessions,
      maxClassesPerWeek: nextMaxClassesPerWeek,
      duration: b.duration !== undefined ? Number(b.duration) : Number(row.duration || 1),
      roomType: b.roomType !== undefined ? b.roomType : (row.roomType || "Classroom")
    });
    await row.save();
    res.json(await Subject.findById(row._id).populate("academicSession", "name active").populate("programId", "name code").populate("faculty", "name code").populate("section", "program semester name academicSession").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.delete("/api/subject-mappings/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage subject mappings." });
  try {
    const row = await Subject.findById(req.params.id).select("_id name");
    if (!row) return res.status(404).json({ message: "Subject mapping not found." });
    const [timetableCount, sessionPlanCount] = await Promise.all([
      Timetable.countDocuments({"entries.subject": row._id}),
      SessionPlan.countDocuments({"weeks.entries.subject": row._id})
    ]);
    if (timetableCount || sessionPlanCount) {
      return res.status(409).json({
        message: `Cannot remove subject "${row.name}" because it is referenced by ${timetableCount} timetable version(s) and ${sessionPlanCount} full-session plan(s). Deactivate it or create a replacement mapping to preserve historical schedules.`
      });
    }
    await Subject.findByIdAndDelete(row._id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.get("/api/subject-mappings/summary", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "");
    if (!sessionId) return res.status(400).json({ message: "sessionId is required." });
    const [sections, subjects] = await Promise.all([
      Section.find({ academicSession: sessionId }).populate("programId", "name code").lean(),
      Subject.find({ academicSession: sessionId, active: { $ne: false } }).populate("faculty", "name code").populate("section", "program semester name").lean()
    ]);
    const bySection = sections.map(section => {
      const mapped = subjects.filter(s => String(s.section?._id || s.section) === String(section._id));
      return { section, subjectCount: mapped.length, weeklyLoad: mapped.reduce((n, s) => n + Number(s.classesPerWeek || 0), 0), subjects: mapped };
    });
    res.json({ sessionId, sections: bySection, totalSubjects: subjects.length, totalWeeklyLoad: subjects.reduce((n, s) => n + Number(s.classesPerWeek || 0), 0), unmappedSections: bySection.filter(x => x.subjectCount === 0).length });
  } catch (e) { res.status(500).json({ message: e.message }); }
});



function excelText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.text) return String(value.text).trim();
  return String(value).trim();
}

function excelBool(value) {
  const v = excelText(value).toLowerCase();
  return ["yes", "y", "true", "1", "available", "✓"].includes(v);
}

function norm(value) {
  return excelText(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function firstValue(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find(k => norm(k) === norm(name));
    if (key && excelText(row[key])) return excelText(row[key]);
  }
  return "";
}

app.get("/api/import/template", requireAuth, async (_req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const sheets = {
      Programs: [
        ["Name","Code","Department","DurationYears","Active"],
        ["Bachelor of Business Administration","BBA","Management",4,"Yes"]
      ],
      Faculty: [
        ["Name","Code","MaxWorkingDays","MaxClassesPerDay"],
        ["Dr. Amit Sharma","F001",3,3]
      ],
      Sections: [
        ["Program","Semester","Section","MaxClassesPerDay"],
        ["BBA","III","CB (Gr A)",5]
      ],
      Rooms: [
        ["Name","Type","Capacity"],
        ["Room 101","Classroom",60],
        ["Lab 1","Lab",40]
      ],
      TimeSlots: [
        ["Program","Day","StartTime","EndTime","Order","IsBreak"],
        ["BBA","Monday","09:00","10:00",1,"No"],
        ["BBA","Monday","10:00","11:00",2,"No"],
        ["","Monday","12:00","13:00",3,"No"]
      ],
      Subjects: [
        ["Name","Code","Faculty","Program","Semester","Section","ClassesPerWeek","Duration","RoomType"],
        ["Marketing Management","MKT","Dr. Amit Sharma","BBA","III","CB (Gr A)",3,1,"Classroom"]
      ],
      Availability: [
        ["Faculty","Day","StartTime","EndTime","Available"],
        ["Dr. Amit Sharma","Monday","09:00","10:00","Yes"],
        ["Dr. Amit Sharma","Thursday","09:00","10:00","No"]
      ]
    };
    for (const [name, rows] of Object.entries(sheets)) {
      const ws = wb.addWorksheet(name);
      rows.forEach(row => ws.addRow(row));
      ws.getRow(1).font = { bold: true };
      ws.columns.forEach(c => c.width = 20);
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="timetable-import-template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.post("/api/import/excel", requireAuth, allowRoles("ADMIN", "SCHEDULER"), upload.single("file"), async (req, res) => {
  let dbSession = null;
  try {
    if (!req.file) return res.status(400).json({ message: "Please select an Excel file." });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    const required = ["Programs","Faculty","Sections","Rooms","TimeSlots","Subjects"];
    const missing = required.filter(name => !wb.getWorksheet(name));
    if (missing.length) {
      return res.status(400).json({ message: `Missing sheets: ${missing.join(", ")}` });
    }

    const importAcademicSessionId = String(req.body?.academicSessionId || req.body?.sessionId || "").trim();
    if (importAcademicSessionId) {
      const importSession = await AcademicSession.findById(importAcademicSessionId).lean();
      if (!importSession) return res.status(404).json({ message: "Selected academic session was not found." });
    }

    const topologyType = String(mongoose.connection.getClient?.()?.topology?.description?.type || "");
    const transactional = topologyType.includes("ReplicaSet") || isProduction;
    if (transactional) {
      dbSession = await mongoose.startSession();
      dbSession.startTransaction();
    }

    const readRows = name => {
      const ws = wb.getWorksheet(name);
      const rows = [];
      const headers = ws.getRow(1).values.slice(1).map(excelText);
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const obj = {};
        headers.forEach((h, i) => obj[h] = excelText(row.getCell(i + 1).value));
        if (Object.values(obj).some(v => v !== "")) rows.push(obj);
      });
      return rows;
    };

    const programRows = readRows("Programs");
    const facultyRows = readRows("Faculty");
    const sectionRows = readRows("Sections");
    const roomRows = readRows("Rooms");
    const slotRows = readRows("TimeSlots");
    const subjectRows = readRows("Subjects");
    const availabilityRows = wb.getWorksheet("Availability") ? readRows("Availability") : [];

    const programMap = new Map();

    for (const r of programRows) {
      if (!r.Name) continue;

      const doc = await Program.findOneAndUpdate(
        { code: r.Code || r.Name },
        {
          name: r.Name,
          code: r.Code || "",
          department: r.Department || "",
          durationYears: Number(r.DurationYears || 4),
          active: excelBool(r.Active)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );

      programMap.set((r.Code || r.Name).toLowerCase(), doc);
      programMap.set(r.Name.toLowerCase(), doc);
    }

    const facultyMap = new Map();
    for (const r of facultyRows) {
      if (!r.Name) continue;
      const doc = await Faculty.findOneAndUpdate(
        { name: r.Name },
        {
          name: r.Name,
          code: r.Code || "",
          maxWorkingDays: Number(r.MaxWorkingDays || 5),
          maxClassesPerDay: Number(r.MaxClassesPerDay || 4)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
      facultyMap.set(r.Name.toLowerCase(), doc);
    }

    const sectionMap = new Map();
    for (const r of sectionRows) {
      if (!r.Section || !r.Program || !r.Semester) continue;

      const programDoc =
        programMap.get((r.Program || "").toLowerCase());

      const programName = programDoc?.name || r.Program;

      const doc = await Section.findOneAndUpdate(
        { program: r.Program, semester: r.Semester, name: r.Section, academicSession: importAcademicSessionId || null },
        {
          programId: programDoc?._id || null,
          academicSession: importAcademicSessionId || null,
          program: programName,
          semester: r.Semester,
          name: r.Section,
          maxClassesPerDay: Number(r.MaxClassesPerDay || 5)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
      sectionMap.set(`${r.Program}|${r.Semester}|${r.Section}`.toLowerCase(), doc);
    }

    for (const r of roomRows) {
      if (!r.Name) continue;
      await Room.findOneAndUpdate(
        { name: r.Name },
        { name: r.Name, type: r.Type || "Classroom", capacity: Number(r.Capacity || 60) },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
    }

    for (const r of slotRows) {
      if (!r.Day || !r.StartTime || !r.EndTime) continue;
      const programText = firstValue(r,["Program","Programme"]);
      const programDoc = programText
        ? programMap.get(programText.toLowerCase())
        : null;
      await TimeSlot.findOneAndUpdate(
        { program: programDoc?._id||null, day: r.Day, startTime: r.StartTime, endTime: r.EndTime },
        {
          program: programDoc?._id||null,
          day: r.Day,
          startTime: r.StartTime,
          endTime: r.EndTime,
          order: Number(r.Order || 1),
          isBreak: excelBool(r.IsBreak)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
    }

    let subjectsImported = 0;
    const skippedSubjects = [];

    // Build additional lookup maps so imports work with either names or codes.
    const facultyLookup = new Map();
    for (const [k,v] of facultyMap) facultyLookup.set(norm(k),v);
    for (const f of await Faculty.find().session(dbSession)) {
      if (f.name) facultyLookup.set(norm(f.name),f);
      if (f.code) facultyLookup.set(norm(f.code),f);
    }

    const sectionLookup = new Map();
    for (const [k,v] of sectionMap) sectionLookup.set(norm(k),v);
    for (const s of await Section.find().session(dbSession)) {
      sectionLookup.set(norm(`${s.program}|${s.semester}|${s.name}`),s);
      sectionLookup.set(norm(s.name),s);
    }

    for (const r of subjectRows) {
      const name = firstValue(r,["Name","Subject","Subject Name","SubjectName"]);
      const code = firstValue(r,["Code","Subject Code","SubjectCode"]);
      const facultyName = firstValue(r,["Faculty","Faculty Name","FacultyName","Teacher","Teacher Name"]);
      const program = firstValue(r,["Program","Programme"]);
      const semester = firstValue(r,["Semester","Term"]);
      const sectionName = firstValue(r,["Section","Section Name","SectionName"]);
      const classesPerWeek = firstValue(r,["ClassesPerWeek","Classes / Week","Classes Week","Weekly","Weekly Classes"]);
      const duration = firstValue(r,["Duration","Periods","Duration Periods"]);
      const roomType = firstValue(r,["RoomType","Room Type","Room"]);

      const facultyDoc = facultyLookup.get(norm(facultyName));
      let sectionDoc = sectionLookup.get(norm(`${program}|${semester}|${sectionName}`));
      if (!sectionDoc && sectionName) sectionDoc = sectionLookup.get(norm(sectionName));

      if (!name) {
        skippedSubjects.push({name:"(blank)",reason:"Subject name missing"});
        continue;
      }
      if (!facultyDoc) {
        skippedSubjects.push({name,reason:`Faculty not found: ${facultyName || "(blank)"}`});
        continue;
      }
      if (!sectionDoc) {
        skippedSubjects.push({name,reason:`Section not found: ${program || ""} ${semester || ""} ${sectionName || "(blank)"}`.trim()});
        continue;
      }

      await Subject.findOneAndUpdate(
        { name, code: code || "", section: sectionDoc._id, academicSession: importAcademicSessionId || sectionDoc.academicSession || null },
        {
          name,
          code,
          academicSession: importAcademicSessionId || sectionDoc.academicSession || null,
          programId: sectionDoc.programId || null,
          faculty: facultyDoc._id,
          section: sectionDoc._id,
          classesPerWeek: Number(classesPerWeek || 1),
          duration: Math.min(3,Math.max(1,Number(duration || 1))),
          roomType: ["Classroom","Lab","Any"].includes(roomType) ? roomType : "Classroom"
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session: dbSession }
      );
      subjectsImported++;
    }

    // If an Availability sheet exists, it becomes the authoritative day/period matrix.
    const availabilityByFaculty = new Map();
    for (const r of availabilityRows) {
      const f = facultyMap.get((r.Faculty || "").toLowerCase());
      if (!f || !r.Day || !r.StartTime || !r.EndTime) continue;
      const key = String(f._id);
      if (!availabilityByFaculty.has(key)) availabilityByFaculty.set(key, { availableDays: new Set(), unavailableSlots: [] });
      const item = availabilityByFaculty.get(key);
      const slot = `${r.Day}|${r.StartTime}-${r.EndTime}`;
      if (excelBool(r.Available)) item.availableDays.add(r.Day);
      else item.unavailableSlots.push(slot);
    }
    for (const [fid, a] of availabilityByFaculty) {
      await Faculty.findByIdAndUpdate(fid, {
        availableDays: [...a.availableDays],
        unavailableSlots: a.unavailableSlots
      }, { session: dbSession });
    }

    if (dbSession) {
      await dbSession.commitTransaction();
      await dbSession.endSession();
    }

    res.json({
      ok: true,
      imported: {
        programs: programRows.length,
        faculty: facultyRows.length,
        sections: sectionRows.length,
        rooms: roomRows.length,
        timeSlots: slotRows.length,
        subjects: subjectsImported,
        skippedSubjects,
        availabilityRows: availabilityRows.length
      }
    });
  } catch (e) {
    console.error(e);
    try { if (dbSession) { await dbSession.abortTransaction(); await dbSession.endSession(); } } catch {}
    res.status(500).json({ message: `Excel import failed: ${e.message}` });
  }
});

app.get("/api/timetable/readiness", requireAuth, allowRoles("ADMIN","SCHEDULER"), async (req,res) => {
  try {
    const sessionId=String(req.query.sessionId||"").trim();
    if(!sessionId) return res.status(400).json({message:"sessionId is required."});
    const session=await AcademicSession.findById(sessionId).lean();
    if(!session) return res.status(404).json({message:"Academic session not found."});

    const requestedProgramIds=String(req.query.programIds||"").split(",").map(value=>value.trim()).filter(Boolean);
    if(requestedProgramIds.some(id=>!mongoose.isValidObjectId(id))) return res.status(400).json({message:"One or more selected program IDs are invalid."});
    const [allSections, programs]=await Promise.all([
      Section.find({ academicSession: sessionId }).lean(),
      Program.find({active:{$ne:false}}).lean()
    ]);
    const programMap=new Map(programs.map(program=>[String(program._id),program]));
    const selectedPrograms=requestedProgramIds.map(id=>programMap.get(id));
    if(requestedProgramIds.length&&selectedPrograms.some(program=>!program)) return res.status(400).json({message:"One or more selected programs do not exist or are inactive."});
    const selectedProgramNames=new Set(selectedPrograms.flatMap(program=>[program.name,program.code].filter(Boolean).map(value=>String(value).trim().toLowerCase())));
    const sections=allSections.filter(section=>{
      if(!requestedProgramIds.length)return true;
      const programId=String(section.programId?._id||section.programId||"");
      return requestedProgramIds.includes(programId)||selectedProgramNames.has(String(section.program||"").trim().toLowerCase());
    });
    const sectionIds=sections.map(section=>section._id);
    const [subjects, faculty, rooms, slots]=await Promise.all([
      Subject.find({
        $and: [
          { $or: [{ academicSession: sessionId }, { academicSession: null }] },
          { section: { $in: sectionIds } },
          { active: { $ne: false } }
        ]
      }).lean(),
      Faculty.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean()
    ]);

    const facultyMap=new Map(faculty.map(x=>[String(x._id),x]));
    const sectionMap=new Map(sections.map(x=>[String(x._id),x]));
    const issues=[];
    const warnings=[];
    const usableSlots=slots.filter(x=>x&&!x.isBreak&&String(x.day)!=="Sunday"
      &&(!String(x.academicSession||"")||String(x.academicSession)===sessionId));
    const days=[...new Set(usableSlots.map(x=>String(x.day)))];

    const push=(severity,category,message,meta={})=>{
      const item={severity,category,message,...meta};
      (severity==="ERROR"?issues:warnings).push(item);
    };

    if(!sections.length) push("ERROR","Sections","No sections are configured for this academic session.");
    if(!subjects.length) push("ERROR","Subject Mapping","No active subject mappings are configured for this academic session.");
    if(!faculty.length) push("ERROR","Faculty","No faculty records are configured.");
    if(!rooms.length) push("ERROR","Rooms","No rooms are configured.");
    if(!usableSlots.length) push("ERROR","Time Slots","No usable non-break Monday-Saturday time slots are configured.");

    for(const section of sections){
      const scopedSlots=resolveTimeSlotsForSection(usableSlots,section,programs,sessionId);
      if(!scopedSlots.length){
        push("ERROR","Time Slots",`No time slots are configured for ${section.program||"Program"} · ${section.semester||"Semester"} · ${section.name||"Section"} in this academic session.`);
      }
    }

    const mappedSectionIds=new Set(subjects.map(x=>String(x.section||"")));
    for(const section of sections){
      if(!mappedSectionIds.has(String(section._id))) push("WARNING","Section Coverage",`${section.program||"Program"} · ${section.semester||""} · ${section.name||"Section"} has no active subject mappings.`);
    }

    const facultyLoad=new Map();
    const sectionLoad=new Map();
    const roomNeeds=new Map();
    let requiredSessions=0;
    let invalidSubjects=0;

    for(const sub of subjects){
      const fid=String(sub.faculty||"");
      const sid=String(sub.section||"");
      const f=facultyMap.get(fid);
      const sec=sectionMap.get(sid);
      const weekly=Math.max(0,Number(sub.classesPerWeek||0));
      requiredSessions+=weekly;
      if(!f || !sec){
        invalidSubjects++;
        push("ERROR","Subject Mapping",`${sub.name||"Unnamed subject"} has an invalid Faculty or Section reference.`);
        continue;
      }
      facultyLoad.set(fid,(facultyLoad.get(fid)||0)+weekly);
      sectionLoad.set(sid,(sectionLoad.get(sid)||0)+weekly);
      const type=String(sub.roomType||"Classroom");
      roomNeeds.set(type,(roomNeeds.get(type)||0)+weekly);
      if(weekly<1) push("ERROR","Weekly Load",`${sub.name||"Unnamed subject"} has zero classes per week.`);
      const scopedSlots=resolveTimeSlotsForSection(usableSlots,sec,programs,sessionId);
      if(Number(sub.duration||1)>scopedSlots.length) push("ERROR","Duration",`${sub.name||"Unnamed subject"} requires ${sub.duration} consecutive periods, but its program/semester timetable has fewer usable periods.`);
    }

    for(const [fid,load] of facultyLoad){
      const f=facultyMap.get(fid); if(!f) continue;
      const availableDays=Array.isArray(f.availableDays)&&f.availableDays.length?f.availableDays.filter(d=>days.includes(d)):days;
      const maxWorkingDays=Math.max(1,Number(f.maxWorkingDays||7));
      const maxPerDay=Math.max(1,Number(f.maxClassesPerDay||1));
      const capacity=Math.min(availableDays.length,maxWorkingDays)*maxPerDay;
      if(!availableDays.length) push("ERROR","Faculty Availability",`${f.name||"Faculty"} has no available working day matching the configured time slots.`);
      else if(load>capacity) push("ERROR","Faculty Workload",`${f.name||"Faculty"} is assigned ${load} weekly class periods but has an estimated capacity of ${capacity}.`);
      else if(load>capacity*0.85) push("WARNING","Faculty Workload",`${f.name||"Faculty"} is close to the weekly capacity (${load}/${capacity}).`);
    }

    for(const [sid,load] of sectionLoad){
      const sec=sectionMap.get(sid); if(!sec) continue;
      const maxPerDay=Math.max(1,Number(sec.maxClassesPerDay||1));
      const sectionDays=[...new Set(resolveTimeSlotsForSection(usableSlots,sec,programs,sessionId).map(slot=>String(slot.day)))];
      const capacity=sectionDays.length*maxPerDay;
      if(load>capacity) push("ERROR","Section Workload",`${sec.program||"Program"} · ${sec.semester||""} · ${sec.name||"Section"} requires ${load} periods but has an estimated weekly capacity of ${capacity}.`);
    }

    const roomTypes={Classroom:0,Lab:0,Any:0};
    for(const room of rooms){ const t=String(room.type||"Classroom"); roomTypes[t]=(roomTypes[t]||0)+1; }
    if(!roomTypes.Classroom&&!roomTypes.Any) push("ERROR","Room Capacity","No Classroom/Any room is configured for classroom subjects.");
    if(!roomTypes.Lab&&!roomTypes.Any && (roomNeeds.get("Lab")||0)>0) push("ERROR","Room Capacity","Lab subjects are mapped, but no Lab/Any room is configured.");

    const blockedByFaculty=[];
    for(const sub of subjects){
      const f=facultyMap.get(String(sub.faculty||""));
      if(!f) continue;
      const unavailable=new Set(Array.isArray(f.unavailableSlots)?f.unavailableSlots:[]);
      const section=sectionMap.get(String(sub.section||""));
      const scopedSlots=resolveTimeSlotsForSection(usableSlots,section,programs,sessionId);
      const scopedDays=[...new Set(scopedSlots.map(slot=>String(slot.day)))];
      const availDays=new Set(Array.isArray(f.availableDays)&&f.availableDays.length?f.availableDays:scopedDays);
      const possible=scopedSlots.filter(slot=>availDays.has(String(slot.day))&&!unavailable.has(`${slot.day}|${slot.startTime}-${slot.endTime}`));
      if(!possible.length) blockedByFaculty.push(sub.name||"Unnamed subject");
    }
    if(blockedByFaculty.length) push("ERROR","Faculty Availability",`${blockedByFaculty.length} subject mapping(s) have no available period after faculty availability restrictions.`);

    const status=issues.length?"NOT_READY":warnings.length?"READY_WITH_WARNINGS":"READY";
    res.json({
      session:{_id:session._id,name:session.name,active:session.active},
      scope:{programIds:requestedProgramIds,programNames:selectedPrograms.map(program=>program.name)},
      status,
      summary:{sections:sections.length,subjects:subjects.length,faculty:faculty.length,rooms:rooms.length,usableSlots:usableSlots.length,workingDays:days.length,requiredSessions,invalidSubjects,errors:issues.length,warnings:warnings.length},
      issues:[...issues,...warnings],
      details:{facultyLoad:[...facultyLoad.entries()].map(([id,load])=>({facultyId:id,name:facultyMap.get(id)?.name||"Faculty",weeklyLoad:load})),sectionLoad:[...sectionLoad.entries()].map(([id,load])=>({sectionId:id,label:[sectionMap.get(id)?.program,sectionMap.get(id)?.semester,sectionMap.get(id)?.name].filter(Boolean).join(" · "),weeklyLoad:load}))}
    });
  } catch(e){ res.status(500).json({message:e.message}); }
});

app.post("/api/timetable/generate", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
  try {
    const academicSessionId=req.body?.academicSessionId||null;
    const requestedProgramIds=Array.isArray(req.body?.programIds)
      ? [...new Set(req.body.programIds.map(value=>String(value||"").trim()).filter(Boolean))]
      : [];
    let selectedSession=null;
    if(academicSessionId){
      selectedSession=await AcademicSession.findById(academicSessionId).lean();
      if(!selectedSession)return res.status(404).json({message:"Selected academic session was not found."});
    }
    if(requestedProgramIds.some(id=>!mongoose.isValidObjectId(id))){
      return res.status(400).json({message:"One or more selected program IDs are invalid."});
    }

    const [faculty, rawSections, rooms, allSlots, programs] = await Promise.all([
      Faculty.find().lean(),
      academicSessionId ? Section.find({academicSession:academicSessionId}).lean() : Section.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean(),
      Program.find({active:{$ne:false}}).lean()
    ]);
    const allSections=rawSections.map(section=>{
      const calendar=selectedSession
        ? resolveProgramCalendar(selectedSession.programDates||[],section,programs)
        : null;
      const start=calendar?.startDate||selectedSession?.startDate||null;
      const end=calendar?.endDate||selectedSession?.endDate||null;
      return {
        ...section,
        _calendarStartDate:start?new Date(start).toISOString().slice(0,10):"",
        _calendarEndDate:end?new Date(end).toISOString().slice(0,10):""
      };
    });
    const slots=allSlots.filter(slot=>!String(slot.academicSession||"")
      ||String(slot.academicSession)===String(academicSessionId||""));
    const programById=new Map(programs.map(program=>[String(program._id),program]));
    const selectedPrograms=requestedProgramIds.map(id=>programById.get(id));
    if(requestedProgramIds.length && selectedPrograms.some(program=>!program)){
      return res.status(400).json({message:"One or more selected programs do not exist or are inactive. Refresh Programs and try again."});
    }
    const selectedProgramNames=new Set(selectedPrograms.flatMap(program=>[program.name,program.code].filter(Boolean).map(value=>String(value).trim().toLowerCase())));
    const isSelectedSection=section=>{
      if(!requestedProgramIds.length)return true;
      const programId=String(section.programId?._id||section.programId||"");
      if(programId && requestedProgramIds.includes(programId))return true;
      const legacyProgram=String(section.program||"").trim().toLowerCase();
      return selectedProgramNames.has(legacyProgram);
    };
    const sections=allSections.filter(isSelectedSection);
    if(selectedSession?.programDates?.length){
      const missingCalendars=sections.filter(section=>!resolveProgramCalendar(selectedSession.programDates,section,programs));
      if(missingCalendars.length){
        return res.status(422).json({message:"Configure academic dates for every selected program/semester before timetable generation: "+missingCalendars.map(section=>[section.program,section.semester,section.name].filter(Boolean).join(" · ")).join(", ")});
      }
    }
    if(requestedProgramIds.length && !sections.length){
      return res.status(400).json({message:"No sections are mapped to the selected program(s) in this academic session."});
    }

    // Load session subjects, then scope generation to the selected sections.
    const allSessionSectionIds=allSections.map(section=>section._id);
    const subjectFilter=academicSessionId
      ? {$and:[{$or:[{academicSession:academicSessionId},{academicSession:null}]},{section:{$in:allSessionSectionIds}},{active:{$ne:false}}]}
      : {active:{$ne:false}};
    const allSubjects=await Subject.find(subjectFilter).lean();
    const selectedSectionIds=new Set(sections.map(section=>String(section._id)));
    const subjects=allSubjects.filter(subject=>selectedSectionIds.has(String(subject.section?._id||subject.section||"")));

    let settings=null;
    try{
      settings=await SchedulerSetting.findOne({key:"default"}).lean();
      const override=settings?.sessionOverrides?.find(x=>String(x.academicSession)===String(academicSessionId));
      if(override)settings={...settings,...override};
    }catch(settingsError){console.error("Scheduler settings unavailable:",settingsError.message);}

    if(!subjects.length)return res.status(400).json({message:"No active subjects found for the selected program(s) and academic session."});
    const holidayDays=new Set(["Sunday",...(Array.isArray(settings?.holidayDays)?settings.holidayDays:[])]);
    const usableSlots=slots.filter(slot=>!slot.isBreak&&!holidayDays.has(String(slot.day))&&(!String(slot.academicSession||"")||String(slot.academicSession)===String(academicSessionId||"")));
    if(!usableSlots.length)return res.status(400).json({message:`No usable time slots found after excluding holidays (${[...holidayDays].join(", ")}). Add Time Slots for working days first.`});
    if(!faculty.length)return res.status(400).json({message:"No faculty found. Add or import Faculty first."});
    if(!sections.length)return res.status(400).json({message:"No sections found. Add or import Sections first."});
    if(!rooms.length)return res.status(400).json({message:"No rooms found. Add or import Rooms first."});

    const facultyIds=new Set(faculty.map(item=>String(item._id)));
    const sectionIds=new Set(sections.map(item=>String(item._id)));
    const invalidSubjects=[];
    const validSubjects=[];
    for(const subject of subjects){
      const facultyId=subject.faculty?String(subject.faculty._id||subject.faculty):"";
      const sectionId=subject.section?String(subject.section._id||subject.section):"";
      const reasons=[];
      if(!facultyId)reasons.push("Faculty reference is empty");
      else if(!facultyIds.has(facultyId))reasons.push(`Faculty ID ${facultyId} does not exist`);
      if(!sectionId)reasons.push("Section reference is empty");
      else if(!sectionIds.has(sectionId))reasons.push(`Section ID ${sectionId} does not exist in the selected program/session`);
      if(reasons.length)invalidSubjects.push({name:subject.name,faculty:facultyId,section:sectionId,reasons});
      else validSubjects.push(subject);
    }
    console.log("GENERATION DATA CHECK",{programs:requestedProgramIds.length?selectedPrograms.map(p=>p.name):["ALL"],faculty:faculty.length,sections:sections.length,subjects:subjects.length,validSubjects:validSubjects.length,invalidSubjects:invalidSubjects.length,invalid:invalidSubjects.slice(0,20)});
    if(!validSubjects.length)return res.status(422).json({message:"No valid subjects can be scheduled for the selected program(s).",warnings:[`${invalidSubjects.length} subject(s) have invalid Faculty/Section references.`],diagnostics:invalidSubjects.slice(0,50)});

    const generationRuns=Math.max(1,Math.min(30,Number(req.body?.generationRuns||settings?.generationRuns||env.schedulerGenerationRuns)));
    const generationTimeLimitMs=Math.max(1000,Math.min(120000,Number(req.body?.generationTimeLimitMs||settings?.generationTimeLimitMs||env.schedulerGenerationTimeLimitMs)));
    // Read the current session timetable before generating. When only some
    // programs are selected, entries from the other programs are immutable
    // reservations during candidate search, not merely checked after generation.
    const currentQuery=academicSessionId?{academicSession:academicSessionId,isCurrent:true}:{isCurrent:true};
    const current=await Timetable.findOne(currentQuery).sort({version:-1}).lean();
    const reservedEntries=requestedProgramIds.length
      ? (current?.entries||[])
          .filter(entry=>!selectedSectionIds.has(String(entry.section?._id||entry.section||"")))
          .map(entry=>{
            const sectionId=String(entry.section?._id||entry.section||"");
            const section=allSections.find(item=>String(item._id)===sectionId);
            return {
              ...entry,
              calendarStartDate:entry.calendarStartDate||section?._calendarStartDate||"",
              calendarEndDate:entry.calendarEndDate||section?._calendarEndDate||""
            };
          })
      : [];

    const result=generateBestTimetable({
      faculty,subjects:validSubjects,sections,rooms,slots:usableSlots,programs,
      settings:settings||{},reservedEntries,runs:generationRuns,totalMaxMillis:generationTimeLimitMs,
      perRunMillis:Math.max(750,Math.floor(generationTimeLimitMs/generationRuns)),
      attemptsPerRun:env.schedulerGenerationAttempts,
      academicSessionId
    });
    const requiredSessions=validSubjects.reduce((n,subject)=>n+Number(subject.classesPerWeek||0),0);
    console.log("Timetable generation:",{programs:requestedProgramIds.length?selectedPrograms.map(p=>p.name):["ALL"],requestedSessions:requiredSessions,generatedSessions:result.entries?.length||0,warnings:result.warnings||[]});
    const validation=validateTimetable({entries:result.entries||[],faculty,sections,subjects:validSubjects,rooms,slots:usableSlots,programs,settings:settings||{},academicSessionId,holidayDays:settings?.holidayDays||["Sunday"]});
    if(!(result.entries?.length))return res.status(422).json({message:"No timetable entries could be generated.",warnings:result.warnings||[],diagnostics:invalidSubjects.slice(0,50)});
    if(result.entries.length<requiredSessions)return res.status(422).json({message:`Timetable generation is incomplete: ${result.entries.length}/${requiredSessions} required weekly sessions were scheduled. Nothing was saved.`,warnings:result.warnings||[],validation});
    if(!validation.valid)return res.status(422).json({message:"Generated timetable failed hard-constraint validation. Nothing was saved.",warnings:result.warnings||[],validation});

    // For program-scoped runs, keep all other programs' current entries and replace
    // only the selected program entries. Validate the merged timetable before saving.
    const preservedEntries=requestedProgramIds.length ? reservedEntries : [];
    const mergedEntries=[...preservedEntries,...(result.entries||[])];
    const allValidSubjects=allSubjects.filter(subject=>{
      const facultyId=String(subject.faculty?._id||subject.faculty||"");
      const sectionId=String(subject.section?._id||subject.section||"");
      return facultyIds.has(facultyId)&&allSections.some(section=>String(section._id)===sectionId);
    });
    const mergedValidation=requestedProgramIds.length?validateTimetable({
      entries:mergedEntries,faculty,sections:allSections,subjects:allValidSubjects,rooms,slots:usableSlots,programs,
      settings:settings||{},academicSessionId,holidayDays:settings?.holidayDays||["Sunday"]
    }):validation;
    if(requestedProgramIds.length&&!mergedValidation.valid){
      return res.status(422).json({message:"The selected program timetable conflicts with existing entries from other programs. Nothing was saved.",warnings:result.warnings||[],validation:mergedValidation});
    }

    if(academicSessionId)await Timetable.updateMany({academicSession:academicSessionId},{$set:{isCurrent:false}});
    const lastVersion=academicSessionId
      ? await Timetable.findOne({academicSession:academicSessionId}).sort({version:-1}).select("version")
      : await Timetable.findOne().sort({version:-1}).select("version");
    const nextVersion=Number(lastVersion?.version||0)+1;
    const saved=await Timetable.create({
      ...result,
      entries:mergedEntries,
      optimizationScore:result.metrics?.qualityScore??result.score??null,
      optimizationMetrics:result.metrics||null,
      optimizationRuns:generationRuns,
      academicSession:academicSessionId,
      version:nextVersion,
      versionLabel:`Version ${nextVersion}`,
      isCurrent:true,
      createdBy:req.user?.username||"",
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:"",
      generationScope:requestedProgramIds.length?{programIds:requestedProgramIds,programNames:selectedPrograms.map(p=>p.name)}:null
    });
    const populated=await Timetable.findById(saved._id).populate("entries.section entries.subject entries.faculty entries.room");
    res.json(populated);
  }catch(e){
    console.error("TIMETABLE GENERATION ERROR",e);
    res.status(500).json({message:e.message,stack:process.env.NODE_ENV==="development"?e.stack:undefined});
  }
});

app.get("/api/timetable/versions", requireAuth, async (req,res)=>{
  try{
    const sessionId=String(req.query.sessionId||"").trim();
    if(!sessionId)return res.status(400).json({message:"An academic session is required to list timetable versions."});
    if(!mongoose.isValidObjectId(sessionId))return res.status(400).json({message:"Invalid academic session ID."});
    const rows=await Timetable.find({academicSession:sessionId})
      .select("version versionLabel status isCurrent createdAt updatedAt notes academicSession totalEntries entries approvalHistory statusChangedAt statusNote")
      .sort({version:-1}).lean();
    const manager = ["ADMIN","SCHEDULER"].includes(String(req.user?.role||"").toUpperCase());
    res.json(rows.map(x=>({
      ...x,
      notes:manager ? x.notes : undefined,
      totalEntries:x.totalEntries??x.entries?.length??0,
      entries:undefined,
      approvalHistory:undefined,
      statusNote:undefined
    })));
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/timetable/versions/compare", requireAuth, allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const fromId=String(req.query.fromId||"").trim();
    const toId=String(req.query.toId||"").trim();
    const sessionId=String(req.query.sessionId||"").trim();
    if(!fromId||!toId||!sessionId){
      return res.status(400).json({message:"Select an academic session and two timetable versions to compare."});
    }
    if(!mongoose.isValidObjectId(fromId)||!mongoose.isValidObjectId(toId)||!mongoose.isValidObjectId(sessionId)){
      return res.status(400).json({message:"One or more selected IDs are invalid."});
    }
    if(fromId===toId)return res.status(400).json({message:"Select two different timetable versions."});
    const [fromVersion,toVersion]=await Promise.all([
      populatedTimetableQuery(Timetable.findOne({_id:fromId,academicSession:sessionId})).lean(),
      populatedTimetableQuery(Timetable.findOne({_id:toId,academicSession:sessionId})).lean()
    ]);
    if(!fromVersion||!toVersion){
      return res.status(404).json({message:"Both versions must exist in the selected academic session."});
    }
    const diff=compareTimetableVersions(fromVersion.entries||[],toVersion.entries||[]);
    res.json({
      sessionId,
      from:{_id:fromVersion._id,version:fromVersion.version,versionLabel:fromVersion.versionLabel||`Version ${fromVersion.version}`,status:fromVersion.status||"DRAFT",createdAt:fromVersion.createdAt,totalEntries:(fromVersion.entries||[]).length},
      to:{_id:toVersion._id,version:toVersion.version,versionLabel:toVersion.versionLabel||`Version ${toVersion.version}`,status:toVersion.status||"DRAFT",createdAt:toVersion.createdAt,totalEntries:(toVersion.entries||[]).length},
      ...diff
    });
  }catch(e){res.status(500).json({message:e.message});}
});

app.post("/api/timetable/:id/restore", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role)){
    return res.status(403).json({message:"Only Admin or Scheduler can restore timetable versions."});
  }
  let sessionId="";
  let previousCurrentIds=[];
  let switchedCurrent=false;
  let restoredVersionId="";
  try{
    const sourceId=String(req.params.id||"").trim();
    const note=String(req.body?.note||"").trim();
    const requestedSessionId=String(req.body?.sessionId||req.query?.sessionId||"").trim();
    if(!mongoose.isValidObjectId(sourceId)){
      return res.status(400).json({message:"Invalid timetable version ID."});
    }
    if(note.length<3){
      return res.status(400).json({message:"Enter a restoration reason of at least 3 characters."});
    }
    const source=await Timetable.findById(sourceId).lean();
    if(!source)return res.status(404).json({message:"Timetable version not found."});
    if(!source.academicSession){
      return res.status(409).json({message:"This legacy timetable version has no academic-session mapping and cannot be restored safely. Assign it to a session first."});
    }
    sessionId=String(source.academicSession);
    if(requestedSessionId&&requestedSessionId!==sessionId){
      return res.status(409).json({message:"The selected version does not belong to the active academic session."});
    }
    if(source.isCurrent!==false){
      return res.status(409).json({message:"This is already the current version. Choose an older version to restore."});
    }

    const filter={academicSession:source.academicSession};
    const currentVersions=await Timetable.find({...filter,isCurrent:true}).select("_id status version").lean();
    previousCurrentIds=currentVersions.map(row=>row._id);
    const last=await Timetable.findOne(filter).sort({version:-1}).select("version").lean();
    const next=Number(last?.version||0)+1;
    const now=new Date();
    const historyEntry={
      from:"VERSION_RESTORE",
      to:"DRAFT",
      note:`Restored from ${source.versionLabel||`Version ${source.version}`}. Reason: ${note}`,
      user:req.user?.id||null,
      username:req.user?.username||"",
      role:req.user?.role||"",
      changedAt:now
    };

    // Mark the prior current version inactive, then compensate if creating the
    // new Draft fails so the session does not get stranded without a current version.
    await Timetable.updateMany({...filter,isCurrent:true},{$set:{isCurrent:false}});
    switchedCurrent=true;
    const restored=await Timetable.create({
      academicSession:source.academicSession,
      generatedAt:now,
      entries:Array.isArray(source.entries)?source.entries:[],
      score:source.score,
      optimizationScore:source.optimizationScore,
      optimizationMetrics:source.optimizationMetrics,
      optimizationRuns:source.optimizationRuns||0,
      optimizationComparison:source.optimizationComparison||[],
      warnings:source.warnings||[],
      version:next,
      versionLabel:`Version ${next} · Restored from ${source.versionLabel||`Version ${source.version}`}`,
      isCurrent:true,
      createdBy:req.user?.username||"",
      notes:note,
      status:"DRAFT",
      statusChangedAt:now,
      statusNote:note,
      approvalHistory:[historyEntry]
    });
    restoredVersionId=String(restored._id);
    try{
      const AuditLog=(await import("./models/AuditLog.js")).default;
      await AuditLog.create({
        action:"TIMETABLE_VERSION_RESTORED",
        category:"TIMETABLE",
        description:`Restored ${source.versionLabel||`Version ${source.version}`} as Version ${next} Draft.`,
        user:req.user?.id||null,
        username:req.user?.username||"",
        role:req.user?.role||"",
        targetType:"Timetable",
        targetId:String(restored._id),
        metadata:{sessionId,sourceTimetableId:String(source._id),sourceVersion:source.version,restoredVersion:next,reason:note,previousCurrentIds:previousCurrentIds.map(String)},
        ipAddress:req.ip||""
      });
    }catch(auditError){
      console.error("Timetable version restoration audit failed:",auditError.message);
    }
    const populated=await Timetable.findById(restored._id)
      .populate("entries.section entries.subject entries.faculty entries.room")
      .populate("approvalHistory.user","name username role");
    res.status(201).json(populated);
  }catch(e){
    if(switchedCurrent&&sessionId){
      try{
        if(restoredVersionId){
          await Timetable.updateOne({_id:restoredVersionId},{$set:{isCurrent:false}});
        }
        if(previousCurrentIds.length){
          await Timetable.updateMany({_id:{$in:previousCurrentIds}},{$set:{isCurrent:true}});
        }
      }catch(compensationError){
        console.error("Failed to restore current timetable after rollback:",compensationError.message);
      }
    }
    if(res.headersSent){res.end();return;}
    res.status(400).json({message:e.message});
  }
});

app.post("/api/timetable/clone", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res)=>{
  let createdCloneId = "";
  let previousCurrentId = "";
  let targetSessionId = "";
  try{
    const sourceId = String(req.body?.sourceTimetableId || "").trim();
    targetSessionId = String(req.body?.targetSessionId || "").trim();
    if(!sourceId || !targetSessionId) {
      return res.status(400).json({message:"Source timetable and target academic session are required."});
    }

    const [source,target] = await Promise.all([
      Timetable.findById(sourceId).lean(),
      AcademicSession.findById(targetSessionId).lean()
    ]);
    if(!source) return res.status(404).json({message:"Source timetable version not found."});
    if(!target) return res.status(404).json({message:"Target academic session not found."});
    if(!source.academicSession) {
      return res.status(409).json({message:"The source timetable has no academic-session mapping and cannot be cloned safely."});
    }
    if(String(source.academicSession)===String(target._id)) {
      return res.status(400).json({message:"Source and target academic sessions must be different."});
    }

    const sourceEntries = Array.isArray(source.entries) ? source.entries : [];
    if(!sourceEntries.length) {
      return res.status(409).json({message:"The selected source timetable has no classes to clone."});
    }

    const sourceSectionIds = [...new Set(sourceEntries.map(e=>String(e.section||"")).filter(Boolean))];
    const sourceSubjectIds = [...new Set(sourceEntries.map(e=>String(e.subject||"")).filter(Boolean))];
    if(sourceSectionIds.length===0 || sourceSubjectIds.length===0) {
      return res.status(409).json({message:"The source timetable contains entries without valid Section or Subject mappings."});
    }

    const [sourceSections,sourceSubjects,targetSections,allTargetSubjects] = await Promise.all([
      Section.find({_id:{$in:sourceSectionIds}}).populate("programId","name code").lean(),
      Subject.find({_id:{$in:sourceSubjectIds}}).lean(),
      Section.find({academicSession:target._id}).populate("programId","name code").lean(),
      Subject.find({
        active:{$ne:false},
        $or:[{academicSession:target._id},{academicSession:null}]
      }).lean()
    ]);

    const normalize = value => String(value??"").trim().toLowerCase().replace(/\s+/g," ");
    const idOf = value => String(value?._id??value??"");
    const programTokens = section => new Set([
      section?.programId?.code,
      section?.programId?.name,
      section?.program
    ].map(normalize).filter(Boolean));
    const sameSection = (a,b) => {
      if(normalize(a?.semester)!==normalize(b?.semester) || normalize(a?.name)!==normalize(b?.name)) return false;
      const aProgramId=idOf(a?.programId), bProgramId=idOf(b?.programId);
      if(aProgramId && bProgramId) return aProgramId===bProgramId;
      const aTokens=programTokens(a), bTokens=programTokens(b);
      for(const token of aTokens) if(bTokens.has(token)) return true;
      return false;
    };

    const sourceSectionMap = new Map(sourceSections.map(section=>[String(section._id),section]));
    const sourceSubjectMap = new Map(sourceSubjects.map(subject=>[String(subject._id),subject]));
    const targetSectionMap = new Map();
    const mappingIssues = [];

    for(const sourceSectionId of sourceSectionIds){
      const sourceSection=sourceSectionMap.get(sourceSectionId);
      if(!sourceSection){
        mappingIssues.push(`Source section ${sourceSectionId} no longer exists.`);
        continue;
      }
      const matches=targetSections.filter(section=>sameSection(sourceSection,section));
      if(matches.length!==1){
        const label=[sourceSection.programId?.name||sourceSection.program,sourceSection.semester,sourceSection.name].filter(Boolean).join(" · ");
        mappingIssues.push(matches.length
          ? `Target session has more than one matching section for ${label}; make its Program/Semester/Section mapping unique.`
          : `Target session is missing a matching section for ${label}. Create the target section first.`);
        continue;
      }
      targetSectionMap.set(sourceSectionId,matches[0]);
    }

    const targetSectionsIds = new Set(targetSections.map(s=>String(s._id)));
    const targetSubjectsBySection = new Map();
    for(const subject of allTargetSubjects){
      const sectionId=String(subject.section||"");
      if(!targetSectionsIds.has(sectionId)) continue;
      const rows=targetSubjectsBySection.get(sectionId)||[];
      rows.push(subject);
      targetSubjectsBySection.set(sectionId,rows);
    }
    const targetSubjectMap = new Map();

    for(const sourceSubjectId of sourceSubjectIds){
      const sourceSubject=sourceSubjectMap.get(sourceSubjectId);
      if(!sourceSubject){
        mappingIssues.push(`Source subject ${sourceSubjectId} no longer exists.`);
        continue;
      }

      const sourceEntriesForSubject=sourceEntries.filter(e=>String(e.subject||"")===sourceSubjectId);
      const sourceSectionId=String(sourceSubject.section||"");
      if(sourceSectionId && sourceEntriesForSubject.some(e=>String(e.section||"")!==sourceSectionId)){
        mappingIssues.push(`Source subject ${sourceSubject.name||sourceSubjectId} is scheduled against a different section than its master-data mapping.`);
        continue;
      }
      const sourceEntrySectionIds=[...new Set(sourceEntriesForSubject.map(e=>String(e.section||"")).filter(Boolean))];
      if(sourceEntrySectionIds.length!==1){
        mappingIssues.push(`Source subject ${sourceSubject.name||sourceSubjectId} appears under multiple or missing sections.`);
        continue;
      }
      const targetSection=targetSectionMap.get(sourceEntrySectionIds[0]);
      if(!targetSection) continue;

      const candidates=targetSubjectsBySection.get(String(targetSection._id))||[];
      const code=normalize(sourceSubject.code);
      const name=normalize(sourceSubject.name);
      const codeMatches=code?candidates.filter(s=>normalize(s.code)===code):[];
      const label=`${sourceSubject.name||"Unnamed subject"} in ${targetSection.programId?.name||targetSection.program||""} · ${targetSection.semester} · ${targetSection.name}`;
      let match=null;
      if(codeMatches.length===1){
        match=codeMatches[0];
      }else if(codeMatches.length>1){
        mappingIssues.push(`Target mapping for ${label} has a duplicated subject code. Ensure its subject code is unique within the section.`);
        continue;
      }else{
        const nameMatches=candidates.filter(s=>normalize(s.name)===name &&
          (!sourceSubject.subjectType || !s.subjectType || s.subjectType===sourceSubject.subjectType));
        if(nameMatches.length===1) match=nameMatches[0];
        else {
          mappingIssues.push(nameMatches.length
            ? `Target mapping for ${label} is ambiguous. Ensure its subject name is unique within the section.`
            : `Target session has no matching subject for ${label}. Map the subject to the target section first.`);
          continue;
        }
      }
      if(!match.faculty){
        mappingIssues.push(`Target subject ${match.name||match.code||match._id} has no Faculty mapping.`);
        continue;
      }
      targetSubjectMap.set(sourceSubjectId,match);
    }

    if(mappingIssues.length){
      return res.status(409).json({
        message:"Timetable cannot be cloned until target-session master data is mapped. No timetable version was changed.",
        mappingIssues
      });
    }

    const [faculty,rooms,slots,programs,settingDoc] = await Promise.all([
      Faculty.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean(),
      Program.find().lean(),
      SchedulerSetting.findOne({key:"default"}).lean()
    ]);
    const facultyById = new Map(faculty.map(f=>[String(f._id),f]));
    const roomIds = [...new Set(sourceEntries.map(e=>String(e.room||"")).filter(Boolean))];
    const roomsById = new Map(rooms.map(r=>[String(r._id),r]));
    const referenceIssues = [];
    for(const entry of sourceEntries){
      const subject=targetSubjectMap.get(String(entry.subject||""));
      if(!subject || !facultyById.has(String(subject.faculty||""))){
        referenceIssues.push(`Target Faculty reference is missing for ${subject?.name||entry.subject||"a scheduled subject"}.`);
      }
      if(!entry.room || !roomsById.has(String(entry.room))){
        referenceIssues.push(`Room reference ${String(entry.room||"(empty)")} is missing from the master data.`);
      }
    }
    if(referenceIssues.length){
      return res.status(409).json({message:"Target-session mappings are incomplete. No timetable version was changed.",mappingIssues:[...new Set(referenceIssues)]});
    }

    const mappedEntries = sourceEntries.map(entry=>{
      const targetSection=targetSectionMap.get(String(entry.section||""));
      const targetSubject=targetSubjectMap.get(String(entry.subject||""));
      return {
        day:entry.day,
        startTime:entry.startTime,
        endTime:entry.endTime,
        order:entry.order,
        duration:entry.duration||1,
        section:targetSection._id,
        subject:targetSubject._id,
        faculty:targetSubject.faculty,
        room:entry.room
      };
    });

    let effectiveSettings=settingDoc||{};
    const override=settingDoc?.sessionOverrides?.find(x=>String(x.academicSession)===String(target._id));
    if(override) effectiveSettings={...settingDoc,...override};
    const validation=validateTimetable({
      entries:mappedEntries,
      faculty,
      sections:targetSections,
      subjects:allTargetSubjects,
      rooms,
      slots,
      programs,
      settings:effectiveSettings,
      holidayDays:effectiveSettings?.holidayDays||["Sunday"],
      holidayDates:target.holidayDates||[]
    });
    if(!validation.valid){
      return res.status(409).json({
        message:"The cloned timetable would violate target-session constraints. No timetable version was changed.",
        validation
      });
    }

    const last=await Timetable.findOne({academicSession:target._id}).sort({version:-1}).select("version");
    const next=Number(last?.version||0)+1;
    const previousCurrent=await Timetable.findOne({academicSession:target._id,isCurrent:true}).select("_id").lean();
    previousCurrentId=String(previousCurrent?._id||"");

    const cloned=await Timetable.create({
      entries:mappedEntries,
      score:source.score,
      optimizationScore:source.optimizationScore,
      optimizationMetrics:source.optimizationMetrics,
      optimizationRuns:source.optimizationRuns,
      optimizationComparison:source.optimizationComparison||[],
      warnings:[...(source.warnings||[]),...validation.warnings],
      academicSession:target._id,
      version:next,
      versionLabel:String(req.body?.versionLabel||`Version ${next}`),
      isCurrent:false,
      createdBy:req.user?.username||"",
      notes:String(req.body?.notes||""),
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:"Cloned from another academic session."
    });
    createdCloneId=String(cloned._id);

    await Timetable.updateMany({_id:{$ne:cloned._id},academicSession:target._id},{$set:{isCurrent:false}});
    const currentClone=await Timetable.findByIdAndUpdate(cloned._id,{$set:{isCurrent:true}},{new:true});
    if(!currentClone) throw new Error("The cloned timetable could not be marked current.");

    const populated=await Timetable.findById(cloned._id).populate("academicSession entries.section entries.subject entries.faculty entries.room");
    return res.status(201).json(populated);
  }catch(e){
    if(createdCloneId && targetSessionId){
      try{await Timetable.deleteOne({_id:createdCloneId,academicSession:targetSessionId});}catch{}
    }
    if(previousCurrentId){
      try{await Timetable.updateOne({_id:previousCurrentId,academicSession:targetSessionId},{$set:{isCurrent:true}});}catch{}
    }
    return res.status(400).json({message:e.message});
  }
});

app.patch("/api/timetable/move", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const { entryId, day, startTime } = req.body || {};
    if (!entryId || !day || !startTime) {
      return res.status(400).json({ message: "entryId, day and startTime are required." });
    }

    const [timetable, allSlots, settings] = await Promise.all([
      Timetable.findOne({ "entries._id": entryId }),
      TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }),
      SchedulerSetting.findOne({ key: "default" }).lean()
    ]);

    if (!timetable) return res.status(404).json({ message: "No generated timetable found." });
    if ((timetable.status || "DRAFT") !== "DRAFT") {
      return res.status(409).json({ message: `Timetable is ${timetable.status || "DRAFT"}. Return it to DRAFT before making changes.` });
    }

    const entry = timetable.entries.id(entryId);
    if (!entry) return res.status(404).json({ message: "Timetable class not found." });

    const holidayDays = new Set(["Sunday", ...(Array.isArray(settings?.holidayDays) ? settings.holidayDays : [])]);
    if (holidayDays.has(String(day))) {
      return res.status(409).json({ message: `${day} is configured as a holiday. Classes cannot be scheduled on a holiday.` });
    }

    const duration = Math.max(1, Number(entry.duration || 1));
    const daySlots = allSlots
      .filter(s => s.day === day)
      .sort((a,b) => Number(a.order||0)-Number(b.order||0));
    const startIndex = daySlots.findIndex(s => s.startTime === startTime);
    if (startIndex < 0) return res.status(400).json({ message: "Selected start period is not configured." });

    const targetBlock = daySlots.slice(startIndex, startIndex + duration);
    if (targetBlock.length !== duration) {
      return res.status(409).json({ message: `This class requires ${duration} consecutive periods, but there are not enough periods remaining on ${day}.` });
    }
    for (let i=1;i<targetBlock.length;i++) {
      if (Number(targetBlock[i].order) !== Number(targetBlock[i-1].order)+1) {
        return res.status(409).json({ message: `The selected period does not have ${duration} consecutive periods available.` });
      }
    }

    const samePosition = entry.day === day && Number(entry.order) === Number(targetBlock[0].order);
    if (samePosition) return res.json({ message: "Class is already in this position." });

    const targetKeys = new Set(targetBlock.map(slot => `${slot.day}|${slot.startTime}-${slot.endTime}`));
    const others = timetable.entries.filter(e => String(e._id) !== String(entryId));

    function entryKeys(e) {
      const dslots = allSlots.filter(s=>s.day===e.day).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
      const idx=dslots.findIndex(s=>Number(s.order)===Number(e.order));
      if(idx<0) return [];
      return dslots.slice(idx,idx+Math.max(1,Number(e.duration||1)))
        .map(s=>`${s.day}|${s.startTime}-${s.endTime}`);
    }

    const conflictBy=(field,label)=>{
      for(const other of others){
        if(String(other[field])!==String(entry[field])) continue;
        const overlap=entryKeys(other).some(k=>targetKeys.has(k));
        if(overlap) return `${label} conflict: the ${label.toLowerCase()} already has a class in one of the selected periods.`;
      }
      return null;
    };

    const facultyConflict=conflictBy("faculty","Faculty");
    if(facultyConflict) return res.status(409).json({message:facultyConflict});
    const sectionConflict=conflictBy("section","Section");
    if(sectionConflict) return res.status(409).json({message:sectionConflict});
    const roomConflict=conflictBy("room","Room");
    if(roomConflict) return res.status(409).json({message:roomConflict});

    const faculty = await Faculty.findById(entry.faculty);
    const section = await Section.findById(entry.section);
    const subject = await Subject.findById(entry.subject);
    const room = await Room.findById(entry.room);
    if(!faculty || !section || !subject || !room) {
      return res.status(400).json({message:"Faculty, section, subject or room master data is missing."});
    }

    if(Array.isArray(faculty.availableDays) && faculty.availableDays.length && !faculty.availableDays.includes(day)) {
      return res.status(409).json({message:`Faculty is not available on ${day}.`});
    }

    const unavailable=new Set(Array.isArray(faculty.unavailableSlots)?faculty.unavailableSlots:[]);
    if(targetBlock.some(s=>unavailable.has(`${s.day}|${s.startTime}-${s.endTime}`))) {
      return res.status(409).json({message:"Faculty is unavailable in one or more selected periods."});
    }

    const facultyDayClasses=others.filter(e=>String(e.faculty)===String(entry.faculty)&&e.day===day).length;
    if(facultyDayClasses+1>Number(faculty.maxClassesPerDay||99)) {
      return res.status(409).json({message:"Faculty daily class limit would be exceeded."});
    }

    const facultyDays=new Set(others.filter(e=>String(e.faculty)===String(entry.faculty)).map(e=>e.day));
    facultyDays.add(day);
    if(facultyDays.size>Number(faculty.maxWorkingDays||7)) {
      return res.status(409).json({message:"Faculty maximum working-day limit would be exceeded."});
    }

    const sectionDayClasses=others.filter(e=>String(e.section)===String(entry.section)&&e.day===day).length;
    if(sectionDayClasses+1>Number(section.maxClassesPerDay||99)) {
      return res.status(409).json({message:"Section daily class limit would be exceeded."});
    }

    const desiredType=String(subject.roomType||"Classroom").toLowerCase();
    const roomType=String(room.type||"Classroom").toLowerCase();
    if(desiredType!=="any" && desiredType!==roomType) {
      return res.status(409).json({message:`Room type conflict: ${subject.roomType} is required.`});
    }

    if(settings?.avoidSameSubjectSameDay) {
      const duplicate=others.some(e=>String(e.subject)===String(entry.subject)&&e.day===day);
      if(duplicate) return res.status(409).json({message:"Subject distribution rule: this subject already has another class on the selected day."});
    }

    const currentOrders=others
      .filter(e=>String(e.faculty)===String(entry.faculty)&&e.day===day)
      .flatMap(e=>{const d=Math.max(1,Number(e.duration||1));return Array.from({length:d},(_,i)=>Number(e.order||0)+i);});
    const newFacultyRun=[...currentOrders,...targetBlock.map(s=>Number(s.order))].sort((a,b)=>a-b);
    const maxRun=(arr)=>{
      let best=0,run=0,prev=null;
      for(const n of [...new Set(arr)].sort((a,b)=>a-b)){if(prev!==null&&n===prev+1)run++;else run=1;best=Math.max(best,run);prev=n;}
      return best;
    };
    if(maxRun(newFacultyRun)>Number(settings?.maxConsecutiveFaculty||2)) {
      return res.status(409).json({message:"Faculty consecutive-class limit would be exceeded."});
    }

    const currentSectionOrders=others
      .filter(e=>String(e.section)===String(entry.section)&&e.day===day)
      .flatMap(e=>{const d=Math.max(1,Number(e.duration||1));return Array.from({length:d},(_,i)=>Number(e.order||0)+i);});
    const newSectionRun=[...currentSectionOrders,...targetBlock.map(s=>Number(s.order))].sort((a,b)=>a-b);
    if(maxRun(newSectionRun)>Number(settings?.maxConsecutiveSection||3)) {
      return res.status(409).json({message:"Section consecutive-class limit would be exceeded."});
    }

    const previousPosition = {
      day: entry.day,
      startTime: entry.startTime,
      endTime: entry.endTime,
      order: entry.order,
      duration: entry.duration
    };

    entry.day=day;
    entry.startTime=targetBlock[0].startTime;
    entry.endTime=targetBlock.at(-1).endTime;
    entry.order=Number(targetBlock[0].order);
    entry.duration=duration;

    const programs = await Program.find().lean();
    const validation = validateTimetable({
      entries: timetable.entries.map(x => x.toObject ? x.toObject() : x),
      faculty: await Faculty.find().lean(),
      sections: await Section.find().lean(),
      subjects: await Subject.find().lean(),
      rooms: await Room.find().lean(),
      slots: allSlots,
      programs,
      settings: settings || {},
      holidayDays: settings?.holidayDays || ["Sunday"]
    });

    if (!validation.valid) {
      entry.day = previousPosition.day;
      entry.startTime = previousPosition.startTime;
      entry.endTime = previousPosition.endTime;
      entry.order = previousPosition.order;
      entry.duration = previousPosition.duration;
      return res.status(409).json({
        message: "Move rejected by the timetable hard-constraint validator.",
        validation
      });
    }

    await timetable.save();

    const populated=await Timetable.findById(timetable._id)
      .populate("entries.section entries.subject entries.faculty entries.room");
    res.json({message:"Class moved successfully.",timetable:populated});
  } catch(e) {
    console.error("PATCH /api/timetable/move failed:",e);
    res.status(500).json({message:e.message});
  }
});

app.patch("/api/timetable/status", requireAuth, async (req, res) => {
  try {
    const { status, note = "", sessionId = null, timetableId = null } = req.body || {};
    const allowed = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED", "LOCKED"];
    if (!allowed.includes(status)) return res.status(400).json({ message: `Invalid status. Allowed: ${allowed.join(", ")}` });

    const role = req.user?.role || "";
    const permissions = {
      DRAFT: ["ADMIN", "SCHEDULER"],
      SUBMITTED: ["ADMIN", "SCHEDULER"],
      APPROVED: ["ADMIN"],
      PUBLISHED: ["ADMIN"],
      LOCKED: ["ADMIN"]
    };
    if (!permissions[status]?.includes(role)) {
      return res.status(403).json({ message: `Role ${role || "USER"} cannot change a timetable to ${status}.` });
    }

    let effectiveSessionId = String(sessionId || "").trim();
    if (!timetableId && !effectiveSessionId) {
      const activeSession = await AcademicSession.findOne({ active: true }).select("_id").lean();
      effectiveSessionId = String(activeSession?._id || "");
    }
    if (!timetableId && !effectiveSessionId) {
      return res.status(400).json({ message: "An academic session is required to change timetable status." });
    }

    const timetable = timetableId
      ? await Timetable.findById(timetableId)
      : await Timetable.findOne({ academicSession: effectiveSessionId, isCurrent: true }).sort({ createdAt: -1 });
    if (!timetable) return res.status(404).json({ message: "No current timetable found for the selected academic session." });
    if (timetable.isCurrent === false) {
      return res.status(409).json({ message: "Only the current timetable version can change workflow status." });
    }

    const current = timetable.status || "DRAFT";
    const transitions = {
      DRAFT: ["SUBMITTED"],
      SUBMITTED: ["DRAFT", "APPROVED"],
      APPROVED: ["SUBMITTED", "PUBLISHED"],
      PUBLISHED: ["LOCKED", "DRAFT"],
      LOCKED: ["PUBLISHED"]
    };
    if (status !== current && !transitions[current]?.includes(status)) {
      return res.status(409).json({ message: `Cannot change status from ${current} to ${status}.` });
    }
    if (status === current) return res.status(409).json({ message: `Timetable is already ${status}.` });

    // Recheck against current master-data constraints before progressing a timetable
    // into a submitted/approved/published/locked state. Availability may have changed
    // since this timetable version was generated.
    if (["SUBMITTED", "APPROVED", "PUBLISHED", "LOCKED"].includes(status)) {
      const validation = await validateStoredTimetable(timetable);
      if (!validation.valid) {
        return res.status(409).json({
          message: `Timetable cannot be changed to ${status} because current master-data constraints are violated. Fix the listed issues and run Validation Center again. Nothing was changed.`,
          validation
        });
      }
    }

    const noteText = String(note || "").trim();
    const noteRequired = workflowNoteRequired(current, status);
    if (noteRequired && noteText.length < 3) {
      return res.status(400).json({ message: "Remarks are required for return, approval, publication, and unlock-related workflow actions." });
    }

    const entry = {
      from: current,
      to: status,
      note: noteText,
      user: req.user?.id || null,
      username: req.user?.username || "",
      role,
      changedAt: new Date()
    };
    timetable.status = status;
    timetable.statusChangedAt = entry.changedAt;
    timetable.statusNote = noteText;
    timetable.approvalHistory = [...(timetable.approvalHistory || []), entry];
    await timetable.save();
    try {
      const AuditLog = (await import("./models/AuditLog.js")).default;
      await AuditLog.create({action:`TIMETABLE_${status}`,category:"TIMETABLE",description:`Timetable ${timetable.versionLabel || `Version ${timetable.version}`} changed from ${current} to ${status}.`,user:req.user?.id||null,username:req.user?.username||"",role,targetType:"Timetable",targetId:String(timetable._id),metadata:{from:current,to:status,note:noteText,sessionId:timetable.academicSession?String(timetable.academicSession):null},ipAddress:req.ip||""});
    } catch (auditError) { console.error("Timetable workflow audit failed:", auditError.message); }

    const populated = await Timetable.findById(timetable._id)
      .populate("entries.section entries.subject entries.faculty entries.room")
      .populate("approvalHistory.user", "name username role");
    res.json({ message: `Timetable status changed to ${status}.`, timetable: populated });
  } catch (e) {
    console.error("PATCH /api/timetable/status failed:", e);
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/timetable/status", requireAuth, async (req, res) => {
  try {
    const timetable = req.query.timetableId
      ? await Timetable.findById(req.query.timetableId).populate("approvalHistory.user", "name username role").lean()
      : await currentTimetableFor(req);
    res.json({
      timetableId: timetable?._id || null,
      version: timetable?.version || null,
      versionLabel: timetable?.versionLabel || "",
      status: timetable?.status || "DRAFT",
      statusChangedAt: timetable?.statusChangedAt || null,
      statusNote: ["ADMIN", "SCHEDULER"].includes(req.user?.role) ? (timetable?.statusNote || "") : "",
      approvalHistory: ["ADMIN", "SCHEDULER"].includes(req.user?.role) ? (timetable?.approvalHistory || []) : []
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/timetable/workflow", requireAuth, async (req, res) => {
  try {
    const timetable = await currentTimetableFor(req);
    const status = timetable?.status || "DRAFT";
    const role = req.user?.role || "";
    const actions = {
      DRAFT: [{status:"SUBMITTED",roles:["ADMIN","SCHEDULER"]}],
      SUBMITTED: [{status:"DRAFT",roles:["ADMIN","SCHEDULER"],requiresNote:true},{status:"APPROVED",roles:["ADMIN"],requiresNote:true}],
      APPROVED: [{status:"SUBMITTED",roles:["ADMIN"],requiresNote:true},{status:"PUBLISHED",roles:["ADMIN"],requiresNote:true}],
      PUBLISHED: [{status:"LOCKED",roles:["ADMIN"]},{status:"DRAFT",roles:["ADMIN"],requiresNote:true}],
      LOCKED: [{status:"PUBLISHED",roles:["ADMIN"],requiresNote:true}]
    };
    res.json({
      timetableId:timetable?._id||null,
      version:timetable?.version||null,
      versionLabel:timetable?.versionLabel||"",
      status,
      role,
      canEditDraft:["ADMIN","SCHEDULER"].includes(role) && status === "DRAFT",
      actions:(actions[status]||[]).map(x=>({...x,allowed:x.roles.includes(role)})),
      history:["ADMIN","SCHEDULER"].includes(role) ? (timetable?.approvalHistory||[]) : []
    });
  } catch(e){ res.status(500).json({message:e.message}); }
});


function filterTimetableExportEntries(timetable, req) {
  const visibleEntries = filterTimetableEntriesForUser(timetable.entries || [], req.user);
  const view = String(req.query.view || "all").trim().toLowerCase();
  const selectedId = String(req.query.selectedId || "").trim();
  const rawSectionId = String(req.query.sectionId || (view === "section" ? selectedId : "")).trim();
  const sectionId = rawSectionId.toUpperCase() === "ALL" ? "" : rawSectionId;
  const programFilter = String(req.query.program || "ALL").trim();
  const semesterFilter = String(req.query.semester || "ALL").trim();
  const search = String(req.query.search || "").trim().toLowerCase();
  const allowedViews = new Set(["all", "section", "faculty", "room"]);
  if (!allowedViews.has(view)) {
    const error = new Error("Invalid export view. Use section, faculty, room, or all.");
    error.status = 400;
    throw error;
  }
  if (view !== "all" && !selectedId) {
    const error = new Error("Select a section, faculty, or room before exporting.");
    error.status = 400;
    throw error;
  }

  const key = view === "section" ? "section" : view === "faculty" ? "faculty" : view === "room" ? "room" : "";
  const entries = visibleEntries.filter(entry => {
    if (key) {
      const value = entry[key]?._id || entry[key];
      if (String(value || "") !== selectedId) return false;
    }

    const section = entry.section && typeof entry.section === "object" ? entry.section : {};
    const rawProgram = section.program && typeof section.program === "object"
      ? (section.program.name || section.program.code || "")
      : (section.programName || section.program || section.programId?.name || "");
    const program = String(rawProgram || "").trim();
    const semester = String(section.semester ?? section.year ?? "").trim();
    const sectionName = String(section.name || "").trim();

    if (sectionId && String(section._id || entry.section || "") !== sectionId) return false;
    if (programFilter && programFilter !== "ALL" && program !== programFilter) return false;
    if (semesterFilter && semesterFilter !== "ALL" && semester !== semesterFilter) return false;

    if (search) {
      const haystack = [
        program, semester, sectionName, entry.day, entry.startTime, entry.endTime,
        entry.subject?.name, entry.subject?.code, entry.faculty?.name, entry.room?.name
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  return { view, entries };
}

function exportFileBaseName(view, entries, selectedId) {
  const selected = view === "section" ? entries[0]?.section
    : view === "faculty" ? entries[0]?.faculty
    : view === "room" ? entries[0]?.room : null;
  const label = String(selected?.name || selected?.program || view || "all")
    .replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return view === "all" ? "generated-timetable" : `timetable-${label || selectedId.slice(-8)}`;
}

app.get("/api/timetable/export/excel", requireAuth, async (req, res) => {
  try {
    const XLSX = (await import("xlsx")).default;
    const t = await currentTimetableFor(req);
    if (!t) return res.status(404).json({message:"No generated timetable found."});
    const { view, entries } = filterTimetableExportEntries(t, req);
    if (!entries.length) return res.status(404).json({message:"No timetable entries found for the selected filter."});

    const rows = entries.map(e => ({
      Day: e.day,
      Start: e.startTime,
      End: e.endTime,
      Program: e.section?.program || e.section?.programId?.name || "",
      Semester: e.section?.semester || "",
      Section: e.section?.name || "",
      Subject: e.subject?.name || "",
      SubjectCode: e.subject?.code || "",
      Faculty: e.faculty?.name || "",
      Room: e.room?.name || ""
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Timetable");
    const buffer = XLSX.write(wb, {type:"buffer", bookType:"xlsx"});
    const baseName = exportFileBaseName(view, entries, String(req.query.selectedId || ""));
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  } catch(e) {
    res.status(e.status || 500).json({message:e.message});
  }
});

app.get("/api/timetable/export/pdf", requireAuth, async (req, res) => {
  try {
    const PDFDocument = (await import("pdfkit")).default;
    const t = await currentTimetableFor(req);
    if (!t) return res.status(404).json({message:"No generated timetable found."});
    const { view, entries } = filterTimetableExportEntries(t, req);
    if (!entries.length) return res.status(404).json({message:"No timetable entries found for the selected filter."});

    const title = view === "all" ? "Generated Timetable"
      : view === "section" ? "Section-wise Timetable"
      : view === "faculty" ? "Faculty-wise Timetable" : "Room-wise Timetable";
    const baseName = exportFileBaseName(view, entries, String(req.query.selectedId || ""));
    res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
    res.setHeader("Content-Type", "application/pdf");

    const doc = new PDFDocument({margin:36, size:"A4", layout:"landscape"});
    doc.pipe(res);
    doc.fontSize(18).text(title, {align:"center"});
    doc.moveDown();
    doc.fontSize(9);

    const headers = ["Day","Time","Program","Semester","Section","Subject","Faculty","Room"];
    const widths = [55,65,65,55,60,150,105,65];
    let y = doc.y;
    const drawHeader = () => {
      let x = 36;
      doc.font("Helvetica-Bold");
      headers.forEach((h,i)=>{ doc.text(h,x,y,{width:widths[i],continued:false}); x+=widths[i]; });
      doc.font("Helvetica");
      y += 18;
    };
    drawHeader();

    for (const e of entries) {
      if (y > 540) { doc.addPage(); y=36; drawHeader(); }
      const values = [
        e.day,
        `${e.startTime}-${e.endTime}`,
        e.section?.program || e.section?.programId?.name || "",
        e.section?.semester || "",
        e.section?.name || "",
        e.subject?.name || "",
        e.faculty?.name || "",
        e.room?.name || ""
      ];
      let x=36;
      values.forEach((v,i)=>{ doc.text(String(v),x,y,{width:widths[i],height:30,ellipsis:true}); x+=widths[i]; });
      y += 28;
    }
    doc.end();
  } catch(e) {
    res.status(e.status || 500).json({message:e.message});
  }
});

function analyticsLabel(section){
  return [section?.program||section?.programId?.name||"",section?.semester||"",section?.name||""].filter(Boolean).join(" · ") || "Unassigned";
}

app.get("/api/analytics", requireAuth, async (req,res) => {
  try {
    const requestedSessionId=String(req.query.sessionId||"").trim();
    const selectedSession=requestedSessionId
      ? await AcademicSession.findById(requestedSessionId).select("_id").lean()
      : await AcademicSession.findOne({active:true}).select("_id").lean();
    if(requestedSessionId && !selectedSession) return res.status(404).json({message:"Academic session not found."});
    if(!selectedSession) return res.json({hasTimetable:false,summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0},faculty:[],rooms:[],sections:[],daily:[],conflicts:[],quality:null,warnings:[]});
    const filter={academicSession:selectedSession._id,isCurrent:true};
    const timetable=await Timetable.findOne(filter).sort({createdAt:-1}).populate("entries.section entries.subject entries.faculty entries.room").lean();
    if(!timetable) return res.json({hasTimetable:false,summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0},faculty:[],rooms:[],sections:[],daily:[],conflicts:[],quality:null,warnings:[]});

    const isManager=["ADMIN","SCHEDULER"].includes(req.user?.role);
    const entries=filterTimetableEntriesForUser(timetable.entries||[],req.user);
    const metrics=isManager?(timetable.optimizationMetrics||{}):{};
    const facultyMap=new Map(), roomMap=new Map(), sectionMap=new Map(), dayMap=new Map();
    for(const e of entries){
      const duration=Math.max(1,Number(e.duration||1));
      const fid=String(e.faculty?._id||e.faculty||""); const rid=String(e.room?._id||e.room||""); const sid=String(e.section?._id||e.section||"");
      if(fid){const x=facultyMap.get(fid)||{id:fid,name:e.faculty?.name||"Unknown",classes:0,periods:0,days:new Set()};x.classes++;x.periods+=duration;x.days.add(e.day);facultyMap.set(fid,x)}
      if(rid){const x=roomMap.get(rid)||{id:rid,name:e.room?.name||"Unknown",type:e.room?.type||"—",classes:0,periods:0};x.classes++;x.periods+=duration;roomMap.set(rid,x)}
      if(sid){const x=sectionMap.get(sid)||{id:sid,label:analyticsLabel(e.section),classes:0,periods:0};x.classes++;x.periods+=duration;sectionMap.set(sid,x)}
      dayMap.set(e.day,(dayMap.get(e.day)||0)+duration);
    }
    const maxFacultyPeriods=Math.max(1,...[...facultyMap.values()].map(x=>x.periods));
    const maxRoomPeriods=Math.max(1,...[...roomMap.values()].map(x=>x.periods));
    const faculty=[...facultyMap.values()].map(x=>({...x,days:x.days.size,utilization:Number((x.periods/maxFacultyPeriods*100).toFixed(1))}));
    const rooms=[...roomMap.values()].map(x=>({...x,utilization:Number((x.periods/maxRoomPeriods*100).toFixed(1))}));
    const required=isManager?Number(metrics.requiredSessions||entries.length):null;
    const scheduled=isManager?Number(metrics.scheduledSessions||entries.length):entries.length;
    const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const daily=days.map(day=>({day,periods:dayMap.get(day)||0}));
    const conflicts=timetableConflicts(entries).map(conflict=>({
      ...conflict,
      entries:(conflict.subjects||[]).map(subject=>({subject}))
    }));
    const warnings=[];
    if((metrics.unscheduledSessions||0)>0) warnings.push(`${metrics.unscheduledSessions} required session(s) remain unscheduled.`);
    if((metrics.subjectSameDayRepeats||0)>0) warnings.push(`${metrics.subjectSameDayRepeats} subject same-day repeat(s) were detected by the generation quality model.`);
    res.json({hasTimetable:true,timetableId:timetable._id,version:timetable.version,versionLabel:timetable.versionLabel,status:timetable.status,createdAt:timetable.createdAt,summary:{requiredSessions:required,scheduledSessions:scheduled,coverage:isManager?Number((required?scheduled/required*100:100).toFixed(1)):null,unscheduledSessions:isManager?Math.max(0,required-scheduled):null},faculty,rooms,sections:[...sectionMap.values()],daily,dailyMax:Math.max(1,...daily.map(x=>x.periods)),conflicts,quality:isManager?{...metrics,optimizationScore:timetable.optimizationScore}:{},warnings:isManager?[...(timetable.warnings||[]),...warnings]:[]});
  } catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/analytics/conflicts", requireAuth, async (req,res) => {
  try{
    const requestedSessionId=String(req.query.sessionId||"").trim();
    const selectedSession=requestedSessionId
      ? await AcademicSession.findById(requestedSessionId).select("_id").lean()
      : await AcademicSession.findOne({active:true}).select("_id").lean();
    if(requestedSessionId && !selectedSession) return res.status(404).json({message:"Academic session not found."});
    if(!selectedSession) return res.json({hasTimetable:false,conflicts:[]});
    const filter={academicSession:selectedSession._id,isCurrent:true};
    const t=await Timetable.findOne(filter).sort({createdAt:-1}).populate("entries.section entries.subject entries.faculty entries.room").lean();
    if(!t) return res.json({hasTimetable:false,conflicts:[]});
    const entries=filterTimetableEntriesForUser(t.entries||[],req.user);
    const conflicts=timetableConflicts(entries).map(conflict=>({
      ...conflict,
      entries:(conflict.subjects||[]).map(subject=>({subject}))
    }));
    res.json({hasTimetable:true,timetableId:t._id,version:t.version,conflicts});
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/timetable/latest", requireAuth, async (req,res) => {
  try {
    const t = await currentTimetableFor(req);
    res.json(t ? timetableForUser(t, req.user) : {entries:[],warnings:[],status:"DRAFT"});
  } catch (e) {
    res.status(500).json({message:e.message});
  }
});


// ---------------- Final integration APIs: portals, reports, validation, sharing ----------------
function populatedTimetableQuery(query){
  return query
    .populate("academicSession","name active")
    .populate("entries.section","program semester name academicSession")
    .populate("entries.subject","name code subjectType classesPerWeek duration roomType")
    .populate("entries.faculty","name code maxWorkingDays maxClassesPerDay")
    .populate("entries.room","name type capacity")
    .populate("approvalHistory.user","name username role");
}

function entryOverlaps(a,b){
  if(String(a.day)!==String(b.day)) return false;
  const clockMinutes=value=>{
    const match=String(value??"").trim().match(/^(\d{1,2}):(\d{2})$/);
    if(!match)return NaN;
    const hour=Number(match[1]),minute=Number(match[2]);
    if(hour<0||hour>23||minute<0||minute>59)return NaN;
    return hour*60+minute;
  };
  const aStart=clockMinutes(a.startTime),aEnd=clockMinutes(a.endTime);
  const bStart=clockMinutes(b.startTime),bEnd=clockMinutes(b.endTime);
  if([aStart,aEnd,bStart,bEnd].every(Number.isFinite)){
    // Period order is local to a program/semester schedule, not globally comparable.
    return aStart<bEnd&&bStart<aEnd;
  }
  const ao=Number(a.order||0),bo=Number(b.order||0);
  const ad=Math.max(1,Number(a.duration||1)),bd=Math.max(1,Number(b.duration||1));
  return ao<bo+bd&&bo<ao+ad;
}

function timetableConflicts(entries){
  const conflicts=[];
  const fields=[["faculty","Faculty"],["section","Section"],["room","Room"]];
  for(let i=0;i<entries.length;i++){
    for(let j=i+1;j<entries.length;j++){
      if(!entryOverlaps(entries[i],entries[j])) continue;
      for(const [field,label] of fields){
        const a=String(entries[i][field]?._id||entries[i][field]||"");
        const b=String(entries[j][field]?._id||entries[j][field]||"");
        if(a && a===b) conflicts.push({
          type:label,
          resource:entries[i][field]?.name||entries[i].section?.name||"Resource",
          day:entries[i].day,
          startTime:entries[i].startTime,
          endTime:entries[i].endTime,
          subjects:[entries[i].subject?.name||"Subject",entries[j].subject?.name||"Subject"]
        });
      }
    }
  }
  return conflicts;
}

function timetableForUser(timetable, user){
  if(!timetable) return timetable;
  const role=String(user?.role||"").toUpperCase();
  if(["ADMIN","SCHEDULER"].includes(role)) return timetable;
  return {
    ...timetable,
    entries:filterTimetableEntriesForUser(timetable.entries||[],user),
    warnings:[],
    optimizationMetrics:null,
    optimizationComparison:[],
    optimizationScore:null,
    optimizationRuns:0,
    score:null,
    approvalHistory:[],
    statusNote:"",
    notes:""
  };
}

async function currentTimetableFor(req){
  let sessionId = String(req?.query?.sessionId || "").trim();
  if(!sessionId){
    const active = await AcademicSession.findOne({active:true}).select("_id").lean();
    sessionId = active?._id ? String(active._id) : "";
  }
  if(!sessionId) return null;
  return populatedTimetableQuery(
    Timetable.findOne({academicSession:sessionId,isCurrent:true}).sort({createdAt:-1})
  ).lean();
}

// Validate a stored version against the latest faculty availability, sections,
// rooms, time slots, holidays and scheduler constraints. This is intentionally
// separate from generation validation because master data can change afterwards.
async function validateStoredTimetable(timetable){
  const academicSessionId=String(timetable?.academicSession?._id||timetable?.academicSession||"").trim();
  const [
    faculty,
    sections,
    subjects,
    rooms,
    slots,
    programs,
    settingDoc,
    academicSession
  ]=await Promise.all([
    Faculty.find().lean(),
    Section.find().lean(),
    Subject.find().lean(),
    Room.find().lean(),
    TimeSlot.find().sort({day:1,order:1}).lean(),
    Program.find().lean(),
    SchedulerSetting.findOne({key:"default"}).lean(),
    academicSessionId
      ? AcademicSession.findById(academicSessionId).lean()
      : AcademicSession.findOne({active:true}).lean()
  ]);

  let settings=settingDoc||{};
  const override=settingDoc?.sessionOverrides?.find(
    item=>String(item.academicSession)===academicSessionId
  );
  if(override) settings={...settingDoc,...override};

  const entries=(timetable?.entries||[]).map(
    entry=>entry?.toObject ? entry.toObject() : entry
  );
  return validateTimetable({
    entries,
    faculty,
    sections,
    subjects,
    rooms,
    slots,
    programs,
    settings,
    academicSessionId,
    holidayDays:settings.holidayDays||["Sunday"],
    holidayDates:academicSession?.holidayDates||[]
  });
}

// Personal timetable for Faculty, Viewer, Admin and Scheduler users.
app.get("/api/personal-timetable", requireAuth, async (req,res)=>{
  try{
    const role=String(req.user?.role||"").toUpperCase();
    let type="";
    let targetId="";
    let account=null;
    if(["FACULTY","VIEWER"].includes(role)){
      account=await User.findById(req.user?.id).select("faculty section active").lean();
      if(!account||account.active===false){
        return res.status(401).json({message:"User account is inactive or no longer available. Please sign in again."});
      }
    }

    if(role==="FACULTY"){
      type="FACULTY";
      targetId=String(account?.faculty||req.user?.faculty||"");
      if(!targetId){
        return res.json({
          type,target:null,session:null,timetable:null,entries:[],rows:[],
          today:{day:String(req.query.day||""),rows:[]},
          weekly:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=>({day,classes:0,periods:0})),
          upcoming:null,summary:{classes:0,periods:0,workingDays:0},
          message:"No Faculty account mapping is configured for this user."
        });
      }
    }else if(role==="VIEWER"){
      type="SECTION";
      targetId=String(account?.section||"");
      if(!targetId){
        return res.status(400).json({message:"No Section is mapped to this Viewer account. Ask an administrator to assign a section, then sign in again."});
      }
    }else if(role==="ADMIN"||role==="SCHEDULER"){
      type=String(req.query.type||"SECTION").trim().toUpperCase();
      if(!["FACULTY","SECTION"].includes(type)){
        return res.status(400).json({message:"type must be FACULTY or SECTION."});
      }
      targetId=String(req.query.id||"").trim();
    }else{
      return res.status(403).json({message:"Personal timetable access is restricted."});
    }

    const [t, target] = await Promise.all([
      currentTimetableFor(req),
      targetId
        ? (type==="FACULTY"
            ? Faculty.findById(targetId).select("name code").lean()
            : Section.findById(targetId).populate("programId","name code").lean())
        : Promise.resolve(null)
    ]);
    if(targetId&&!target) return res.status(404).json({message:type==="FACULTY"?"Faculty not found.":"Section not found."});

    const needsSelection=["ADMIN","SCHEDULER"].includes(role)&&!targetId;
    let allEntries=!needsSelection&&Array.isArray(t?.entries)?t.entries:[];
    if(targetId){
      allEntries=allEntries.filter(e=>String(e[type==="FACULTY"?"faculty":"section"]?._id||e[type==="FACULTY"?"faculty":"section"]||"")===targetId);
    }

    const stringifySection=e=>{
      const section=e.section&&typeof e.section==="object"?e.section:{};
      return [section.program||section.programId?.name,section.semester,section.name].filter(Boolean).join(" · ")||"Section";
    };
    const rows=allEntries.map((e,index)=>({
      id:String(e._id||[e.day,e.startTime,e.endTime,e.subject?._id||e.subject,index].join("|")),
      day:String(e.day||""),
      startTime:String(e.startTime||""),
      endTime:String(e.endTime||""),
      order:Number(e.order||0),
      duration:Math.max(1,Number(e.duration||1)),
      subject:e.subject?.name||"Subject",
      subjectCode:e.subject?.code||"",
      section:stringifySection(e),
      faculty:e.faculty?.name||"Faculty",
      room:e.room?.name||"—",
      sectionId:String(e.section?._id||e.section||""),
      facultyId:String(e.faculty?._id||e.faculty||"")
    }));

    const weekDays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const requestedDay=String(req.query.day||"").trim();
    const todayDay=weekDays.includes(requestedDay)
      ? requestedDay
      : new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"Asia/Kolkata"}).format(new Date());
    const requestedNow=String(req.query.now||"").trim();
    const nowTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(requestedNow)
      ? requestedNow
      : new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
    const minutes=value=>{
      const match=/^(\d{1,2}):(\d{2})$/.exec(String(value||""));
      return match?Number(match[1])*60+Number(match[2]):Number.NaN;
    };
    const todayRows=rows.filter(row=>row.day===todayDay).sort((a,b)=>minutes(a.startTime)-minutes(b.startTime));
    const nowMinutes=minutes(nowTime);
    const upcoming=todayRows.find(row=>minutes(row.startTime)<=nowMinutes&&minutes(row.endTime)>nowMinutes)
      ||todayRows.find(row=>minutes(row.startTime)>nowMinutes)
      ||null;
    const weekly=weekDays.map(day=>{
      const dayRows=rows.filter(row=>row.day===day);
      return {day,classes:dayRows.length,periods:dayRows.reduce((n,row)=>n+row.duration,0)};
    });
    const periods=rows.reduce((n,row)=>n+row.duration,0);
    const activeSession=t?.academicSession||await AcademicSession.findOne({active:true}).select("_id name active").lean();
    const normalizedTarget=target&&type==="SECTION"
      ? {...target,program:target.programId?.name||target.program||"",programCode:target.programId?.code||""}
      : target;
    const timetable=t?{
      _id:t._id,status:t.status||"DRAFT",version:t.version,
      versionLabel:t.versionLabel||"",createdAt:t.createdAt,
      academicSession:t.academicSession||null
    }:null;

    res.json({
      type,target:normalizedTarget||null,session:activeSession||null,timetable,
      entries:allEntries,rows,today:{day:todayDay,rows:todayRows},weekly,upcoming,
      summary:{classes:rows.length,periods,workingDays:new Set(rows.map(row=>row.day)).size}
    });
  }catch(e){res.status(500).json({message:e.message});}
});

// Faculty portal.
app.get("/api/faculty-portal", requireAuth, async (req,res)=>{
  try{
    if(!["ADMIN","SCHEDULER","FACULTY"].includes(req.user?.role)) return res.status(403).json({message:"Faculty portal access is restricted."});
    const facultyId=req.query.facultyId || req.user?.faculty;
    if(!facultyId) return res.status(400).json({message:"No Faculty is mapped to this user."});
    if(req.user?.role==="FACULTY" && String(req.user.faculty)!==String(facultyId)) return res.status(403).json({message:"You can only view your assigned Faculty portal."});
    const [faculty,t]=await Promise.all([
      Faculty.findById(facultyId).lean(),
      currentTimetableFor(req)
    ]);
    if(!faculty) return res.status(404).json({message:"Faculty not found."});
    const entries=(t?.entries||[]).filter(e=>String(e.faculty?._id||e.faculty)===String(facultyId));
    const periods=entries.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    const daily=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=>{
      const rows=entries.filter(e=>e.day===day);
      return {day,classes:rows.length,periods:rows.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0)};
    });
    res.json({faculty,timetable:t?{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel}:null,entries,daily,summary:{classes:entries.length,periods,workingDays:daily.filter(x=>x.classes).length,utilization:Number((periods/Math.max(1,faculty.maxWorkingDays*faculty.maxClassesPerDay)*100).toFixed(1))},notifications:[]});
  }catch(e){res.status(500).json({message:e.message});}
});

// Section portal.
app.get("/api/section-portal/sections", requireAuth, async (req,res)=>{
  try{
    const role=String(req.user?.role||"").toUpperCase();
    let filter={};
    if(role==="VIEWER"){
      const account=await User.findById(req.user?.id).select("section active").lean();
      if(!account||account.active===false){
        return res.status(401).json({message:"User account is inactive or no longer available. Please sign in again."});
      }
      const assignedSectionId=String(account.section||"");
      if(!assignedSectionId){
        return res.status(400).json({message:"No Section is mapped to this Viewer account. Ask an administrator to assign a section, then sign in again."});
      }
      filter={_id:assignedSectionId};
    }
    const rows=await Section.find(filter).populate("programId","name code").populate("academicSession","name active").sort({program:1,semester:1,name:1}).lean();
    res.json(rows.map(section=>({
      id:String(section._id),
      _id:String(section._id),
      name:section.name,
      program:section.programId?.name||section.program,
      programCode:section.programId?.code||"",
      semester:section.semester,
      academicSession:section.academicSession
    })));
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/section-portal", requireAuth, async (req,res)=>{
  try{
    const role=String(req.user?.role||"").toUpperCase();
    let assignedSectionId="";
    if(role==="VIEWER"){
      const account=await User.findById(req.user?.id).select("section active").lean();
      if(!account||account.active===false){
        return res.status(401).json({message:"User account is inactive or no longer available. Please sign in again."});
      }
      assignedSectionId=String(account.section||"");
      if(!assignedSectionId){
        return res.status(400).json({message:"No Section is mapped to this Viewer account. Ask an administrator to assign a section, then sign in again."});
      }
    }
    const sectionId=String(req.query.sectionId||assignedSectionId||req.user?.section||"");
    if(!sectionId) return res.status(400).json({message:"Section is required."});
    if(role==="VIEWER"&&sectionId!==assignedSectionId){
      return res.status(403).json({message:"You can only view your assigned Section portal."});
    }

    const [section,t]=await Promise.all([
      Section.findById(sectionId).populate("programId","name code").populate("academicSession","name active").lean(),
      currentTimetableFor(req)
    ]);
    if(!section) return res.status(404).json({message:"Section not found."});
    const sectionEntries=(t?.entries||[]).filter(entry=>String(entry.section?._id||entry.section)===String(sectionId));
    const timetableRows=sectionEntries.map((entry,index)=>({
      id:String(entry._id||[entry.day,entry.startTime,entry.endTime,entry.subject?._id||entry.subject,index].join("|")),
      day:String(entry.day||""),
      startTime:String(entry.startTime||""),
      endTime:String(entry.endTime||""),
      order:Number(entry.order||0),
      duration:Math.max(1,Number(entry.duration||1)),
      subject:entry.subject?.name||"Subject",
      subjectCode:entry.subject?.code||"",
      faculty:entry.faculty?.name||"Faculty",
      room:entry.room?.name||"—",
      section:entry.section?.name||section.name
    }));
    const periods=timetableRows.reduce((n,entry)=>n+entry.duration,0);
    const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const daily=days.map(day=>{
      const dayRows=timetableRows.filter(entry=>entry.day===day);
      return {
        day,
        classes:dayRows.length,
        periods:dayRows.reduce((n,entry)=>n+entry.duration,0),
        max:Number(section.maxClassesPerDay||0)
      };
    });
    const conflicts=timetableConflicts(sectionEntries).map(conflict=>({
      type:conflict.type,
      message:(conflict.subjects||[]).join(" and ")+" overlap on "+conflict.day+" at "+conflict.startTime+"."
    }));
    const session=t?.academicSession||section.academicSession||await AcademicSession.findOne({active:true}).select("_id name active").lean();
    const timetable=t?{
      _id:t._id,
      status:t.status||"DRAFT",
      version:t.version,
      versionLabel:t.versionLabel||""
    }:null;
    const normalizedSection={
      ...section,
      program:section.programId?.name||section.program,
      programCode:section.programId?.code||""
    };
    res.json({
      section:normalizedSection,
      session:session||null,
      timetable,
      timetableRows,
      entries:timetableRows,
      summary:{
        classes:timetableRows.length,
        scheduledClasses:timetableRows.length,
        weeklyPeriods:periods,
        periods,
        workingDays:new Set(timetableRows.map(entry=>entry.day)).size
      },
      daily,
      conflicts,
      notifications:[]
    });
  }catch(e){res.status(500).json({message:e.message});}
});

// Validation Center.
app.get("/api/timetable/validation", requireAuth, async (req,res)=>{
  try{
    const t=await currentTimetableFor(req);
    if(!t) return res.json({hasTimetable:false,summary:{errors:0,warnings:0},issues:[{severity:"warning",category:"Timetable",message:"No timetable has been generated yet."}]});

    if(!["ADMIN","SCHEDULER"].includes(req.user?.role)){
      const scopedEntries=filterTimetableEntriesForUser(t.entries||[],req.user);
      const scopedConflicts=timetableConflicts(scopedEntries);
      const scopedIssues=scopedConflicts.map(conflict=>({
        severity:"error",
        category:conflict.type+" conflict",
        message:conflict.resource+" has overlapping classes on "+conflict.day+" at "+conflict.startTime+"."
      }));
      return res.json({
        hasTimetable:true,
        timetable:{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel},
        summary:{errors:scopedIssues.length,warnings:0,entries:scopedEntries.length,total:scopedIssues.length},
        issues:scopedIssues,
        conflicts:scopedConflicts,
        constraintValidation:{errors:[],warnings:[]}
      });
    }

    const issues=[];
    const conflicts=timetableConflicts(t.entries||[]);
    conflicts.forEach(c=>issues.push({severity:"error",category:`${c.type} conflict`,message:`${c.resource} has overlapping classes on ${c.day} at ${c.startTime}.`}));

    // Check the saved timetable against current master data too, not just
    // overlaps and warnings written when the timetable was originally generated.
    const constraintValidation=await validateStoredTimetable(t);
    constraintValidation.errors.forEach(message=>{
      const category=/unavailable/i.test(message)
        ? "Faculty Availability"
        : /holiday/i.test(message)
          ? "Holiday / Calendar"
          : /room/i.test(message)
            ? "Room Constraints"
            : /section/i.test(message)
              ? "Section Constraints"
              : "Timetable Constraint";
      issues.push({severity:"error",category,message});
    });
    constraintValidation.warnings.forEach(message=>{
      issues.push({severity:"warning",category:"Timetable Warning",message});
    });

    const metrics=t.optimizationMetrics||{};
    if(Number(metrics.unscheduledSessions||0)>0) issues.push({severity:"error",category:"Unscheduled sessions",message:`${metrics.unscheduledSessions} required session(s) remain unscheduled.`});
    if((t.warnings||[]).length) t.warnings.forEach(w=>issues.push({severity:"warning",category:"Generation warning",message:w}));
    res.json({
      hasTimetable:true,
      timetable:{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel},
      summary:{
        errors:issues.filter(x=>x.severity==="error").length,
        warnings:issues.filter(x=>x.severity==="warning").length,
        entries:(t.entries||[]).length,
        total:issues.length
      },
      issues,
      conflicts,
      constraintValidation
    });
  }catch(e){res.status(500).json({message:e.message});}
});

// Compare two timetable versions.
app.get("/api/timetable/change-history", requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res)=>{
  try{
    if(!req.query.fromId||!req.query.toId) return res.status(400).json({message:"Both timetable version IDs are required."});
    const [from,to]=await Promise.all([Timetable.findById(req.query.fromId).lean(),Timetable.findById(req.query.toId).lean()]);
    if(!from||!to) return res.status(404).json({message:"Both timetable versions are required."});
    if(!from.academicSession||!to.academicSession||String(from.academicSession)!==String(to.academicSession)) {
      return res.status(409).json({message:"Timetable changes can only be compared within the same academic session."});
    }
    const key=e=>`${e.section}|${e.subject}|${e.faculty}|${e.room}`;
    const a=new Map((from.entries||[]).map(e=>[key(e),e])), b=new Map((to.entries||[]).map(e=>[key(e),e]));
    const changes=[];
    for(const [k,e] of b){
      const old=a.get(k);
      if(!old) changes.push({type:"ADDED",subject:e.subject?.name||String(e.subject),day:e.day,startTime:e.startTime,endTime:e.endTime});
      else if(old.day!==e.day||old.startTime!==e.startTime||old.room!==e.room) changes.push({type:"MOVED",subject:e.subject?.name||String(e.subject),from:{day:old.day,startTime:old.startTime},to:{day:e.day,startTime:e.startTime}});
    }
    for(const [k,e] of a) if(!b.has(k)) changes.push({type:"REMOVED",subject:e.subject?.name||String(e.subject),day:e.day,startTime:e.startTime});
    res.json({from:{id:from._id,version:from.version,versionLabel:from.versionLabel},to:{id:to._id,version:to.version,versionLabel:to.versionLabel},changes});
  }catch(e){res.status(500).json({message:e.message});}
});

// Reports use the same authoritative timetable data as Analytics.
app.get("/api/reports/summary", requireAuth, allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const requestedSessionId=String(req.query.sessionId||"").trim();
    const session=requestedSessionId
      ? await AcademicSession.findById(requestedSessionId).select("_id name active").lean()
      : await AcademicSession.findOne({active:true}).select("_id name active").lean();

    if(requestedSessionId && !session) {
      return res.status(404).json({message:"Academic session not found."});
    }

    const sessionSummary=session?{_id:session._id,name:session.name,active:session.active}:null;
    if(!session) {
      return res.json({
        session:null,
        timetable:null,
        summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0,periods:0},
        faculty:[],rooms:[],sections:[],daily:[],issues:[],
        validation:{errors:0,warnings:0,issues:[]},
        subjects:[],warnings:[]
      });
    }

    const sessionId=String(session._id);
    const filter={academicSession:sessionId,isCurrent:true};
    const t=await populatedTimetableQuery(Timetable.findOne(filter).sort({createdAt:-1})).lean();

    if(!t) {
      return res.json({
        session:sessionSummary,
        timetable:null,
        summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0,periods:0},
        faculty:[],rooms:[],sections:[],daily:[],issues:[],
        validation:{errors:0,warnings:0,issues:[]},
        subjects:[],warnings:[]
      });
    }

    const entries=t.entries||[];
    const metrics=t.optimizationMetrics||{};
    const facultyMap=new Map(),roomMap=new Map(),sectionMap=new Map(),dayMap=new Map();
    for(const e of entries){
      const d=Math.max(1,Number(e.duration||1));
      const f=String(e.faculty?._id||e.faculty||"");
      if(f){
        const x=facultyMap.get(f)||{
          id:f,name:e.faculty?.name||"Unknown",classes:0,periods:0,
          workingDays:new Set(),dailyMap:new Map(),
          maxWorkingDays:Number(e.faculty?.maxWorkingDays||0),
          maxClassesPerDay:Number(e.faculty?.maxClassesPerDay||0)
        };
        x.classes++;
        x.periods+=d;
        x.workingDays.add(String(e.day));
        const dayStats=x.dailyMap.get(String(e.day))||{day:String(e.day),classes:0,periods:0};
        dayStats.classes++;
        dayStats.periods+=d;
        x.dailyMap.set(String(e.day),dayStats);
        facultyMap.set(f,x);
      }
      const r=String(e.room?._id||e.room||"");
      if(r){
        const x=roomMap.get(r)||{id:r,name:e.room?.name||"Unknown",type:e.room?.type||"—",classes:0,periods:0};
        x.classes++;x.periods+=d;roomMap.set(r,x);
      }
      const sid=String(e.section?._id||e.section||"");
      if(sid){
        const x=sectionMap.get(sid)||{id:sid,label:[e.section?.program,e.section?.semester,e.section?.name].filter(Boolean).join(" · "),classes:0,periods:0,required:0};
        x.classes++;x.periods+=d;sectionMap.set(sid,x);
      }
      dayMap.set(e.day,(dayMap.get(e.day)||0)+d);
    }

    const scheduleSections=sessionId
      ? await Section.find({academicSession:sessionId}).populate("programId","name code").lean()
      : [];
    for(const section of scheduleSections){
      const sid=String(section._id);
      if(!sectionMap.has(sid)){
        const program=section.programId?.name||section.program||"";
        sectionMap.set(sid,{
          id:sid,
          label:[program,section.semester,section.name].filter(Boolean).join(" · "),
          classes:0,
          periods:0,
          required:0
        });
      }
    }
    const scopedSectionIds=scheduleSections.map(x=>x._id);
    const subjectRows=scopedSectionIds.length
      ? await Subject.find({
          section:{$in:scopedSectionIds},
          active:{$ne:false},
          $or:[{academicSession:sessionId},{academicSession:null}]
        }).populate("faculty","name code").populate("section","program programId semester name").lean()
      : [];

    const scheduledBySubject=new Map();
    for(const entry of entries){
      const id=String(entry.subject?._id||entry.subject||"");
      if(id) scheduledBySubject.set(id,(scheduledBySubject.get(id)||0)+1);
    }
    const subjects=subjectRows.map(subject=>{
      const id=String(subject._id);
      const required=Math.max(0,Number(subject.classesPerWeek||0));
      const scheduled=scheduledBySubject.get(id)||0;
      return {
        id,
        name:subject.name||"Unnamed subject",
        code:subject.code||"",
        faculty:subject.faculty?.name||"",
        facultyId:String(subject.faculty?._id||subject.faculty||""),
        section:[subject.section?.programId?.name||subject.section?.program,subject.section?.semester,subject.section?.name].filter(Boolean).join(" · "),
        sectionId:String(subject.section?._id||subject.section||""),
        required,
        scheduled,
        unscheduled:Math.max(0,required-scheduled)
      };
    });
    // Load faculty limits and availability from master data so workload is
    // measured against configured capacity, including faculty with zero classes.
    const [facultyRows,workloadSlots,defaultSchedulerSettings]=await Promise.all([
      Faculty.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean(),
      SchedulerSetting.findOne({key:"default"}).lean()
    ]);
    const sessionOverride=defaultSchedulerSettings?.sessionOverrides?.find(
      item=>String(item.academicSession||"")===sessionId
    );
    const workloadSettings={...(defaultSchedulerSettings||{}),...(sessionOverride||{})};
    const holidayDays=new Set(["Sunday",...(Array.isArray(workloadSettings.holidayDays)?workloadSettings.holidayDays:[])]);
    const usableWorkloadSlots=workloadSlots.filter(slot=>slot&&!slot.isBreak&&!holidayDays.has(String(slot.day||"")));


    for(const row of facultyRows){
      const id=String(row._id);
      const existing=facultyMap.get(id)||{
        id,name:row.name||"Unknown",classes:0,periods:0,
        workingDays:new Set(),dailyMap:new Map()
      };
      existing.name=row.name||existing.name||"Unknown";
      existing.maxWorkingDays=Math.max(0,Number(row.maxWorkingDays||0));
      existing.maxClassesPerDay=Math.max(0,Number(row.maxClassesPerDay||0));
      existing.availableDays=Array.isArray(row.availableDays)?row.availableDays:[];
      existing.unavailableSlots=Array.isArray(row.unavailableSlots)?row.unavailableSlots:[];
      facultyMap.set(id,existing);
    }

    // Include any stale timetable/subject references as report rows too; missing
    // limits remain explicitly unconfigured instead of being inferred.
    for(const subject of subjects){
      if(subject.facultyId&&!facultyMap.has(subject.facultyId)){
        facultyMap.set(subject.facultyId,{
          id:subject.facultyId,name:subject.faculty||"Unknown",classes:0,periods:0,
          workingDays:new Set(),dailyMap:new Map(),maxWorkingDays:0,maxClassesPerDay:0,
          availableDays:[],unavailableSlots:[]
        });
      }
    }
    for(const subject of subjects){
      const section=sectionMap.get(subject.sectionId);
      if(section) section.required+=subject.required;
    }

    const requiredFromMetrics=Number(metrics.requiredSessions);
    const required=Number.isFinite(requiredFromMetrics)&&requiredFromMetrics>0
      ? requiredFromMetrics
      : (subjects.reduce((n,s)=>n+s.required,0)||entries.length);
    const scheduledFromMetrics=Number(metrics.scheduledSessions);
    const scheduled=Number.isFinite(scheduledFromMetrics)&&scheduledFromMetrics>0
      ? scheduledFromMetrics
      : entries.length;
    const periods=entries.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    const unscheduledSessions=Math.max(
      Number(metrics.unscheduledSessions||0),
      subjects.reduce((n,s)=>n+s.unscheduled,0),
      Math.max(0,required-scheduled)
    );
    const daily=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=>({
      day,classes:entries.filter(e=>e.day===day).length,periods:dayMap.get(day)||0
    }));
    const issues=timetableConflicts(entries).map(c=>({
      severity:"error",category:`${c.type} conflict`,
      message:`${c.resource} has overlapping classes on ${c.day} at ${c.startTime}.`
    }));
    if(unscheduledSessions>0){
      issues.push({severity:"error",category:"Unscheduled sessions",message:`${unscheduledSessions} required session(s) remain unscheduled.`});
    }
    (t.warnings||[]).forEach(w=>issues.push({severity:"warning",category:"Generation warning",message:String(w)}));
    const validation={
      errors:issues.filter(x=>x.severity==="error").length,
      warnings:issues.filter(x=>x.severity==="warning").length,
      issues
    };
    const maxFacultyPeriods=Math.max(1,...[...facultyMap.values()].map(x=>x.periods));
    const faculty=[...facultyMap.values()].map(x=>{
      const assignedSubjects=subjects.filter(subject=>subject.facultyId===x.id);
      const capacity=calculateFacultyWorkloadCapacity({
        classes:x.classes,
        periods:x.periods,
        maxWorkingDays:x.maxWorkingDays,
        maxClassesPerDay:x.maxClassesPerDay,
        availableDays:x.availableDays,
        unavailableSlots:x.unavailableSlots,
        dailyMap:x.dailyMap,
        usableSlots:usableWorkloadSlots
      });
      return {
        id:x.id,
        name:x.name,
        classes:x.classes,
        periods:x.periods,
        workingDays:x.workingDays.size,
        utilization:Number((x.periods/maxFacultyPeriods*100).toFixed(1)),
        ...capacity,
        subjectBreakdown:assignedSubjects.map(subject=>({
          id:subject.id,
          name:subject.name,
          code:subject.code,
          section:subject.section,
          required:subject.required,
          scheduled:subject.scheduled,
          unscheduled:subject.unscheduled
        }))
      };
    }).sort((a,b)=>b.classes-a.classes||a.name.localeCompare(b.name));
    const maxRoomPeriods=Math.max(1,...[...roomMap.values()].map(x=>x.periods));
    const rooms=[...roomMap.values()].map(x=>({
      ...x,
      utilization:Number((x.periods/maxRoomPeriods*100).toFixed(1))
    }));
    const sectionSummaries=[...sectionMap.values()].map(x=>({
      ...x,
      coverage:Number((x.required?x.classes/x.required*100:(x.classes?100:0)).toFixed(1))
    }));
    res.json({
      session:sessionSummary||t.academicSession||null,
      timetable:{_id:t._id,academicSession:t.academicSession?._id||t.academicSession,status:t.status,version:t.version,versionLabel:t.versionLabel,createdAt:t.createdAt},
      summary:{
        requiredSessions:required,
        scheduledSessions:scheduled,
        coverage:Number((required?scheduled/required*100:100).toFixed(1)),
        unscheduledSessions,
        periods
      },
      faculty,rooms,sections:sectionSummaries,daily,issues,validation,
      subjects,quality:t.optimizationMetrics||null,warnings:t.warnings||[]
    });
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/reports/export/:type", requireAuth, allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const format=String(req.params.type||"").toLowerCase();
    if(!["excel","pdf"].includes(format))return res.status(400).json({message:"Supported report types: excel, pdf."});
    const t=await currentTimetableFor(req);
    if(!t)return res.status(404).json({message:"No timetable available for this academic session."});

    const sessionId=String(t.academicSession?._id||t.academicSession||"");
    const session=typeof t.academicSession==="object"?t.academicSession:await AcademicSession.findById(sessionId).select("name").lean();
    const sessionName=String(session?.name||"Academic Session");
    const entries=t.entries||[];
    const subjectIdOf=entry=>String(entry.subject?._id||entry.subject||"");
    const facultyIdOf=entry=>String(entry.faculty?._id||entry.faculty||"");
    const roomIdOf=entry=>String(entry.room?._id||entry.room||"");
    const sectionIdOf=entry=>String(entry.section?._id||entry.section||"");
    const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const dailyMap=new Map(days.map(day=>[day,{day,classes:0,periods:0}]));

    const [sectionRows,roomRows,facultyRows,workloadSlots,defaultSchedulerSettings]=await Promise.all([
      Section.find({academicSession:sessionId}).populate("programId","name code").lean(),
      Room.find().lean(),
      Faculty.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean(),
      SchedulerSetting.findOne({key:"default"}).lean()
    ]);
    const sessionOverride=defaultSchedulerSettings?.sessionOverrides?.find(
      item=>String(item.academicSession||"")===sessionId
    );
    const workloadSettings={...(defaultSchedulerSettings||{}),...(sessionOverride||{})};
    const holidayDays=new Set(["Sunday",...(Array.isArray(workloadSettings.holidayDays)?workloadSettings.holidayDays:[])]);
    const usableWorkloadSlots=workloadSlots.filter(slot=>slot&&!slot.isBreak&&!holidayDays.has(String(slot.day||"")));

    const sectionLabel=section=>[section?.programId?.name||section?.program||"",section?.semester||"",section?.name||""].filter(Boolean).join(" · ")||"Unassigned";
    const sectionMap=new Map(sectionRows.map(section=>[String(section._id),{
      id:String(section._id),label:sectionLabel(section),classes:0,periods:0,required:0
    }]));
    const roomMap=new Map(roomRows.map(room=>[String(room._id),{
      id:String(room._id),name:room.name||"Unknown",type:room.type||"—",classes:0,periods:0
    }]));
    const facultyMap=new Map();
    const scheduledBySubject=new Map();

    for(const entry of entries){
      const duration=Math.max(1,Number(entry.duration||1));
      const facultyId=facultyIdOf(entry);
      if(facultyId){
        const faculty=facultyMap.get(facultyId)||{
          id:facultyId,name:entry.faculty?.name||"Unknown",classes:0,periods:0,workingDays:new Set(),daily:new Map()
        };
        faculty.classes++;
        faculty.periods+=duration;
        faculty.workingDays.add(String(entry.day||""));
        const current=faculty.daily.get(String(entry.day||""))||{classes:0,periods:0};
        current.classes++;
        current.periods+=duration;
        faculty.daily.set(String(entry.day||""),current);
        facultyMap.set(facultyId,faculty);
      }
      const roomId=roomIdOf(entry);
      if(roomId){
        const room=roomMap.get(roomId)||{id:roomId,name:entry.room?.name||"Unknown",type:entry.room?.type||"—",classes:0,periods:0};
        room.classes++;
        room.periods+=duration;
        roomMap.set(roomId,room);
      }
      const sectionId=sectionIdOf(entry);
      if(sectionId){
        const section=sectionMap.get(sectionId)||{id:sectionId,label:sectionLabel(entry.section),classes:0,periods:0,required:0};
        section.classes++;
        section.periods+=duration;
        sectionMap.set(sectionId,section);
      }
      const day=String(entry.day||"");
      if(dailyMap.has(day)){
        dailyMap.get(day).classes++;
        dailyMap.get(day).periods+=duration;
      }
      const subjectId=subjectIdOf(entry);
      if(subjectId)scheduledBySubject.set(subjectId,(scheduledBySubject.get(subjectId)||0)+1);
    }

    const sectionIds=sectionRows.map(section=>section._id);
    const subjectRows=sectionIds.length?await Subject.find({
      section:{$in:sectionIds},
      active:{$ne:false},
      $or:[{academicSession:sessionId},{academicSession:null}]
    }).populate("faculty","name code").populate("section","program programId semester name").lean():[];

    const subjects=subjectRows.map(subject=>{
      const id=String(subject._id);
      const sectionId=String(subject.section?._id||subject.section||"");
      const required=Math.max(0,Number(subject.classesPerWeek||0));
      const scheduled=scheduledBySubject.get(id)||0;
      const facultyId=String(subject.faculty?._id||subject.faculty||"");
      return {
        id,name:subject.name||"Unnamed subject",code:subject.code||"",
        section:sectionMap.get(sectionId)?.label||sectionLabel(subject.section),
        faculty:subject.faculty?.name||"",facultyId,sectionId,required,scheduled,
        unscheduled:Math.max(0,required-scheduled),
        coverage:required?Number(Math.min(100,scheduled/required*100).toFixed(1)):(scheduled?100:0)
      };
    });

    // Merge all faculty master records so staff with zero scheduled classes
    // and missing/incorrect capacity configuration are visible in exports too.
    for(const row of facultyRows){
      const id=String(row._id);
      const item=facultyMap.get(id)||{
        id,name:row.name||"Unknown",classes:0,periods:0,workingDays:new Set(),daily:new Map()
      };
      item.name=row.name||item.name||"Unknown";
      item.maxWorkingDays=Math.max(0,Number(row.maxWorkingDays||0));
      item.maxClassesPerDay=Math.max(0,Number(row.maxClassesPerDay||0));
      item.availableDays=Array.isArray(row.availableDays)?row.availableDays:[];
      item.unavailableSlots=Array.isArray(row.unavailableSlots)?row.unavailableSlots:[];
      facultyMap.set(id,item);
    }
    for(const subject of subjects){
      const section=sectionMap.get(subject.sectionId);
      if(section)section.required+=subject.required;
      if(subject.facultyId&&!facultyMap.has(subject.facultyId)){
        facultyMap.set(subject.facultyId,{
          id:subject.facultyId,name:subject.faculty||"Unknown",classes:0,periods:0,
          workingDays:new Set(),daily:new Map(),maxWorkingDays:0,maxClassesPerDay:0,
          availableDays:[],unavailableSlots:[]
        });
      }
    }

    const daysOfWeek=days;
    const faculty=[...facultyMap.values()].map(item=>{
      const capacity=calculateFacultyWorkloadCapacity({
        classes:item.classes,
        periods:item.periods,
        maxWorkingDays:item.maxWorkingDays,
        maxClassesPerDay:item.maxClassesPerDay,
        availableDays:item.availableDays,
        unavailableSlots:item.unavailableSlots,
        dailyMap:item.daily,
        usableSlots:usableWorkloadSlots
      });
      const daysOfLoad=Object.fromEntries(days.map(day=>[day,item.daily.get(day)?.periods||0]));
      const dayClassLoad=Object.fromEntries(days.map(day=>[`${day}Classes`,item.daily.get(day)?.classes||0]));
      return {
        name:item.name,
        classes:item.classes,
        periods:item.periods,
        workingDays:item.workingDays.size,
        ...capacity,
        ...daysOfLoad,
        ...dayClassLoad
      };
    }).sort((a,b)=>b.classes-a.classes||a.name.localeCompare(b.name));

    const maxRoomPeriods=Math.max(1,...[...roomMap.values()].map(item=>item.periods));
    const rooms=[...roomMap.values()].map(item=>({
      name:item.name,type:item.type,classes:item.classes,periods:item.periods,
      relativeLoad:Number((item.periods/maxRoomPeriods*100).toFixed(1))
    })).sort((a,b)=>b.periods-a.periods||a.name.localeCompare(b.name));
    const sections=[...sectionMap.values()].map(item=>({
      label:item.label,classes:item.classes,periods:item.periods,required:item.required,
      coverage:item.required?Number(Math.min(100,item.classes/item.required*100).toFixed(1)):(item.classes?100:0)
    })).sort((a,b)=>b.periods-a.periods||a.label.localeCompare(b.label));

    const totalPeriods=entries.reduce((sum,entry)=>sum+Math.max(1,Number(entry.duration||1)),0);
    const metric=t.optimizationMetrics||{};
    const requiredSessions=Number(metric.requiredSessions??subjects.reduce((sum,subject)=>sum+subject.required,0));
    const scheduledSessions=Number(metric.scheduledSessions??entries.length);
    const coverage=requiredSessions?Number((scheduledSessions/requiredSessions*100).toFixed(1)):100;
    const unscheduled=subjects.filter(subject=>subject.unscheduled>0);
    const conflicts=timetableConflicts(entries);
    const summaryRows=[
      {Item:"Academic Session",Value:sessionName},
      {Item:"Timetable Version",Value:t.versionLabel||("Version "+String(t.version||1))},
      {Item:"Status",Value:t.status||"DRAFT"},
      {Item:"Scheduled Classes",Value:entries.length},
      {Item:"Scheduled Periods",Value:totalPeriods},
      {Item:"Required Weekly Sessions",Value:requiredSessions},
      {Item:"Scheduled Sessions",Value:scheduledSessions},
      {Item:"Coverage",Value:String(coverage)+"%"},
      {Item:"Unscheduled Subject Requirements",Value:unscheduled.reduce((sum,subject)=>sum+subject.unscheduled,0)},
      {Item:"Faculty Included in Workload Report",Value:faculty.length},
      {Item:"Rooms in Master Data",Value:rooms.length},
      {Item:"Sections in Academic Session",Value:sections.length},
      {Item:"Resource Conflicts Detected",Value:conflicts.length}
    ];

    if(format==="excel"){
      const workbook=new ExcelJS.Workbook();
      workbook.creator="Time Table";
      workbook.subject="Academic workload and timetable reports";
      workbook.title=sessionName+" - Academic Reports";
      workbook.created=new Date();

      const addSheet=(name,columns,rows)=>{
        const sheet=workbook.addWorksheet(name);
        sheet.columns=columns;
        sheet.addRows(rows);
        sheet.views=[{state:"frozen",ySplit:1}];
        sheet.getRow(1).height=24;
        sheet.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};
        sheet.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1D4ED8"}};
        sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};
        sheet.eachRow(row=>row.eachCell(cell=>{
          cell.alignment={vertical:"middle",wrapText:true};
          cell.border={bottom:{style:"thin",color:{argb:"FFE2E8F0"}}};
        }));
        sheet.pageSetup={orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:1"};
        return sheet;
      };

      addSheet("Summary",[{header:"Report Item",key:"Item",width:38},{header:"Value",key:"Value",width:48}],summaryRows);
      addSheet("Faculty Workload",[
        {header:"Faculty",key:"name",width:26},{header:"Classes Scheduled",key:"classes",width:16},
        {header:"Periods Scheduled",key:"periods",width:16},{header:"Working Days Used",key:"workingDays",width:16},
        {header:"Max Classes / Day",key:"maxClassesPerDay",width:17},
        {header:"Max Working Days",key:"maxWorkingDays",width:17},
        {header:"Weekly Capacity (Classes)",key:"capacityClasses",width:22},
        {header:"Capacity Utilization %",key:"capacityUtilization",width:20},
        {header:"Available Periods",key:"availablePeriods",width:17},
        {header:"Free Periods",key:"freePeriods",width:13},
        {header:"Load Status",key:"loadStatus",width:22},
        ...daysOfWeek.flatMap(day=>[
          {header:day+" Periods",key:day,width:13},
          {header:day+" Classes",key:day+"Classes",width:13}
        ])
      ],faculty);
      addSheet("Subject Coverage",[
        {header:"Subject",key:"name",width:28},{header:"Code",key:"code",width:15},
        {header:"Section",key:"section",width:25},{header:"Faculty",key:"faculty",width:24},
        {header:"Required / Week",key:"required",width:16},{header:"Scheduled",key:"scheduled",width:12},
        {header:"Unscheduled",key:"unscheduled",width:14},{header:"Coverage %",key:"coverage",width:13}
      ],subjects);
      addSheet("Section Workload",[
        {header:"Section",key:"label",width:30},{header:"Classes",key:"classes",width:12},
        {header:"Periods",key:"periods",width:12},{header:"Required / Week",key:"required",width:16},
        {header:"Coverage %",key:"coverage",width:13}
      ],sections);
      addSheet("Room Load",[
        {header:"Room",key:"name",width:28},{header:"Type",key:"type",width:18},
        {header:"Classes",key:"classes",width:12},{header:"Periods",key:"periods",width:12},
        {header:"Relative Load %",key:"relativeLoad",width:18}
      ],rooms);
      addSheet("Daily Distribution",[
        {header:"Day",key:"day",width:18},{header:"Classes",key:"classes",width:12},{header:"Periods",key:"periods",width:12}
      ],days.map(day=>dailyMap.get(day)));
      addSheet("Timetable Entries",[
        {header:"Day",key:"day",width:14},{header:"Start",key:"startTime",width:12},
        {header:"End",key:"endTime",width:12},{header:"Program",key:"program",width:22},
        {header:"Semester",key:"semester",width:12},{header:"Section",key:"section",width:17},
        {header:"Subject",key:"subject",width:28},{header:"Subject Code",key:"subjectCode",width:16},
        {header:"Faculty",key:"faculty",width:25},{header:"Room",key:"room",width:18},
        {header:"Duration (Periods)",key:"duration",width:18}
      ],entries.map(entry=>({
        day:entry.day||"",startTime:entry.startTime||"",endTime:entry.endTime||"",
        program:entry.section?.program||entry.section?.programId?.name||"",
        semester:entry.section?.semester||"",section:entry.section?.name||"",
        subject:entry.subject?.name||"",subjectCode:entry.subject?.code||"",
        faculty:entry.faculty?.name||"",room:entry.room?.name||"",
        duration:Math.max(1,Number(entry.duration||1))
      })));
      addSheet("Validation",[
        {header:"Type",key:"type",width:18},{header:"Resource",key:"resource",width:26},
        {header:"Day",key:"day",width:14},{header:"Start",key:"startTime",width:12},
        {header:"End",key:"endTime",width:12},{header:"Subjects",key:"subjects",width:48}
      ],[
        ...conflicts.map(item=>({type:item.type,resource:item.resource,day:item.day,startTime:item.startTime,endTime:item.endTime,subjects:(item.subjects||[]).join(" / ")})),
        ...(t.warnings||[]).map(warning=>({type:"Generation warning",resource:String(warning),day:"",startTime:"",endTime:"",subjects:""}))
      ]);

      const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
      const filename="academic-reports-"+sessionName.replace(/[^a-z0-9_-]+/gi,"-")+".xlsx";
      res.setHeader("Content-Disposition",'attachment; filename="'+filename+'"');
      return res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
    }

    const PDFDocument=(await import("pdfkit")).default;
    const filename="academic-reports-"+sessionName.replace(/[^a-z0-9_-]+/gi,"-")+".pdf";
    res.setHeader("Content-Disposition",'attachment; filename="'+filename+'"');
    res.setHeader("Content-Type","application/pdf");
    const pdf=new PDFDocument({size:"A4",layout:"landscape",margin:26});
    pdf.pipe(res);
    const margin=26;
    const pageWidth=pdf.page.width;
    const pageHeight=pdf.page.height;
    const usableWidth=pageWidth-margin*2;
    let y=margin;
    pdf.font("Helvetica-Bold").fontSize(17).fillColor("#172033").text("Academic Reports",{x:margin,y,width:usableWidth,align:"center"});
    y+=27;
    pdf.font("Helvetica").fontSize(9).fillColor("#475569").text(sessionName+" | "+(t.versionLabel||("Version "+String(t.version||1)))+" | "+(t.status||"DRAFT"),{x:margin,y,width:usableWidth,align:"center"});
    y+=24;
    pdf.font("Helvetica-Bold").fontSize(9).fillColor("#172033").text("Summary",{x:margin,y});
    y+=15;
    const summaryLine="Classes: "+entries.length+"   Periods: "+totalPeriods+"   Required weekly sessions: "+requiredSessions+"   Scheduled: "+scheduledSessions+"   Coverage: "+coverage+"%   Unscheduled gaps: "+unscheduled.length+"   Conflicts: "+conflicts.length;
    pdf.font("Helvetica").fontSize(8).fillColor("#475569").text(summaryLine,{x:margin,y,width:usableWidth});
    y+=26;

    function drawTable(title,columns,rows){
      const naturalWidth=columns.reduce((sum,column)=>sum+column.width,0);
      const scale=Math.min(1,usableWidth/naturalWidth);
      const scaled=columns.map(column=>({...column,width:column.width*scale}));
      const tableWidth=scaled.reduce((sum,column)=>sum+column.width,0);
      const drawHeader=()=>{
        const height=20;
        pdf.save().fillColor("#EAF1FF").rect(margin,y,tableWidth,height).fill().restore();
        let x=margin;
        pdf.font("Helvetica-Bold").fontSize(7).fillColor("#172033");
        for(const column of scaled){
          pdf.text(column.label,x+3,y+5,{width:Math.max(8,column.width-6),height:12,lineBreak:false});
          x+=column.width;
        }
        y+=height;
      };
      if(y+32>pageHeight-margin){pdf.addPage({size:"A4",layout:"landscape",margin:26});y=margin;}
      pdf.font("Helvetica-Bold").fontSize(11).fillColor("#172033").text(title,margin,y);
      y+=16;
      drawHeader();
      for(const row of rows){
        const values=columns.map(column=>String(row[column.key]??"—"));
        const heights=values.map((value,index)=>{
          pdf.font("Helvetica").fontSize(6.5);
          return pdf.heightOfString(value,{width:Math.max(8,scaled[index].width-6),fontSize:6.5,lineGap:0.5});
        });
        const rowHeight=Math.max(16,Math.ceil(Math.max(1,...heights))+6);
        if(y+rowHeight>pageHeight-margin){
          pdf.addPage({size:"A4",layout:"landscape",margin:26});
          y=margin;
          pdf.font("Helvetica-Bold").fontSize(9).fillColor("#172033").text(title+" (continued)",margin,y);
          y+=14;
          drawHeader();
        }
        let x=margin;
        for(let index=0;index<columns.length;index++){
          pdf.save().fillColor("#FFFFFF").rect(x,y,scaled[index].width,rowHeight).fill().restore();
          pdf.strokeColor("#E2E8F0").lineWidth(0.35).rect(x,y,scaled[index].width,rowHeight).stroke();
          pdf.font("Helvetica").fontSize(6.5).fillColor("#334155")
            .text(values[index],x+3,y+3,{width:Math.max(8,scaled[index].width-6),height:rowHeight-5,fontSize:6.5,lineGap:0.5});
          x+=scaled[index].width;
        }
        y+=rowHeight;
      }
      y+=16;
    }

    drawTable("Faculty Workload",[
      {label:"Faculty",key:"name",width:115},{label:"Classes",key:"classes",width:40},
      {label:"Periods",key:"periods",width:42},{label:"Days",key:"workingDays",width:35},
      {label:"Capacity",key:"capacityClasses",width:48},{label:"Use %",key:"capacityUtilization",width:42},
      {label:"Free Periods",key:"freePeriods",width:50},{label:"Status",key:"loadStatus",width:92},
      ...daysOfWeek.map(day=>({label:day.slice(0,3)+" P",key:day,width:24}))
    ],faculty);
    drawTable("Subject Session Coverage",[
      {label:"Subject",key:"name",width:110},{label:"Code",key:"code",width:52},
      {label:"Section",key:"section",width:100},{label:"Faculty",key:"faculty",width:95},
      {label:"Required",key:"required",width:55},{label:"Scheduled",key:"scheduled",width:55},
      {label:"Gap",key:"unscheduled",width:45},{label:"Coverage %",key:"coverage",width:60}
    ],subjects);
    drawTable("Section Workload",[
      {label:"Section",key:"label",width:140},{label:"Classes",key:"classes",width:58},
      {label:"Periods",key:"periods",width:58},{label:"Required",key:"required",width:70},
      {label:"Coverage %",key:"coverage",width:70}
    ],sections);
    drawTable("Room Load",[
      {label:"Room",key:"name",width:140},{label:"Type",key:"type",width:100},
      {label:"Classes",key:"classes",width:62},{label:"Periods",key:"periods",width:62},
      {label:"Relative Load %",key:"relativeLoad",width:90}
    ],rooms);
    drawTable("Daily Distribution",[
      {label:"Day",key:"day",width:130},{label:"Classes",key:"classes",width:70},{label:"Periods",key:"periods",width:70}
    ],days.map(day=>dailyMap.get(day)));
    drawTable("Unscheduled Subjects",[
      {label:"Subject",key:"name",width:130},{label:"Code",key:"code",width:60},
      {label:"Section",key:"section",width:100},{label:"Faculty",key:"faculty",width:90},
      {label:"Required",key:"required",width:55},{label:"Scheduled",key:"scheduled",width:55},
      {label:"Gap",key:"unscheduled",width:45}
    ],unscheduled);
    drawTable("Resource Conflicts",[
      {label:"Type",key:"type",width:80},{label:"Resource",key:"resource",width:120},
      {label:"Day",key:"day",width:75},{label:"Start",key:"startTime",width:50},
      {label:"End",key:"endTime",width:50},{label:"Subjects",key:"subjects",width:220}
    ],conflicts.map(item=>({...item,subjects:(item.subjects||[]).join(" / ")})));
    pdf.end();
  }catch(e){
    if(res.headersSent){res.end();return;}
    res.status(500).json({message:e.message});
  }
});

// Public sharing administration and read-only endpoints.
app.get("/api/shareable-timetables", requireAuth, allowRoles("ADMIN"), async (_req,res)=>{
  try{
    const rows=await Timetable.find({status:{$in:["PUBLISHED","LOCKED"]}}).populate("academicSession","name").select("version versionLabel status academicSession createdAt").sort({createdAt:-1}).lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/share-links", requireAuth, allowRoles("ADMIN"), async (_req,res)=>{
  try{res.json(await ShareLink.find().populate("timetable","version versionLabel status").populate("academicSession","name").populate("section","program semester name").populate("faculty","name code").sort({createdAt:-1}).lean());}
  catch(e){res.status(500).json({message:e.message});}
});
app.post("/api/share-links", requireAuth, async (req,res)=>{
  if(req.user?.role!=="ADMIN") return res.status(403).json({message:"Only Admin can create public share links."});
  try{
    const timetable=await Timetable.findById(req.body?.timetableId);
    if(!timetable) return res.status(404).json({message:"Timetable not found."});
    if(!["PUBLISHED","LOCKED"].includes(timetable.status)) return res.status(409).json({message:"Only published or locked timetables can be shared."});
    const scope=String(req.body?.scope||"FULL").toUpperCase();
    if(!["FULL","SECTION","FACULTY"].includes(scope)) return res.status(400).json({message:"Scope must be FULL, SECTION or FACULTY."});
    const sectionId=String(req.body?.sectionId||"").trim();
    const facultyId=String(req.body?.facultyId||"").trim();
    if(scope==="SECTION"&&!sectionId) return res.status(400).json({message:"Section is required."});
    if(scope==="FACULTY"&&!facultyId) return res.status(400).json({message:"Faculty is required."});
    if(scope==="SECTION"&&!timetable.entries.some(entry=>String(entry.section?._id||entry.section||"")===sectionId)) {
      return res.status(400).json({message:"The selected section is not part of this timetable."});
    }
    if(scope==="FACULTY"&&!timetable.entries.some(entry=>String(entry.faculty?._id||entry.faculty||"")===facultyId)) {
      return res.status(400).json({message:"The selected faculty member is not assigned in this timetable."});
    }
    const expires=String(req.body?.expiresIn||"7d");
    if(!["1h","1d","7d","30d","never"].includes(expires)) return res.status(400).json({message:"Expiry must be 1h, 1d, 7d, 30d or never."});
    let expiresAt=null;
    const expiryMatch=/^(1h|1d|7d|30d)$/.exec(expires);
    if(expiryMatch) {
      const unit=expires.endsWith("h")?3600000:86400000;
      expiresAt=new Date(Date.now()+Number.parseInt(expires,10)*unit);
    }
    const token=(await import("crypto")).randomBytes(24).toString("hex");
    const row=await ShareLink.create({
      token,timetable:timetable._id,academicSession:timetable.academicSession,scope,
      section:scope==="SECTION"?sectionId:null,
      faculty:scope==="FACULTY"?facultyId:null,
      expiresAt,createdBy:req.user?.id||null,createdByName:req.user?.username||""
    });
    res.status(201).json(await ShareLink.findById(row._id).populate("timetable","version versionLabel status").populate("section","program semester name").populate("faculty","name code").lean());
  }catch(e){res.status(400).json({message:e.message});}
});
app.patch("/api/share-links/:id/toggle", requireAuth, async (req,res)=>{
  if(req.user?.role!=="ADMIN") return res.status(403).json({message:"Only Admin can manage share links."});
  const row=await ShareLink.findById(req.params.id); if(!row)return res.status(404).json({message:"Share link not found."});
  row.active=!row.active; await row.save(); res.json(row);
});
app.delete("/api/share-links/:id", requireAuth, async (req,res)=>{
  if(req.user?.role!=="ADMIN") return res.status(403).json({message:"Only Admin can delete share links."});
  const row=await ShareLink.findByIdAndDelete(req.params.id); if(!row)return res.status(404).json({message:"Share link not found."});res.json({ok:true});
});
app.get("/api/public/share/:token", async (req,res)=>{
  try{
    const row=await ShareLink.findOne({token:req.params.token}).populate("timetable").populate("academicSession","name").populate("section","program semester name").populate("faculty","name code");
    if(!row||!row.active)return res.status(404).json({message:"This public timetable link is unavailable."});
    if(row.expiresAt&&row.expiresAt<new Date())return res.status(410).json({message:"This public timetable link has expired."});
    const t=await populatedTimetableQuery(Timetable.findById(row.timetable._id)).lean();
    if(!t || !["PUBLISHED","LOCKED"].includes(t.status)){
      return res.status(404).json({message:"This public timetable link is unavailable."});
    }
    let entries=t.entries||[];
    if(row.scope==="SECTION") entries=entries.filter(e=>String(e.section?._id||e.section)===String(row.section?._id||row.section));
    if(row.scope==="FACULTY") entries=entries.filter(e=>String(e.faculty?._id||e.faculty)===String(row.faculty?._id||row.faculty));
    row.accessCount++;row.lastAccessedAt=new Date();await row.save();
    res.json({title:row.scope==="SECTION"?`${row.section?.program||""} · ${row.section?.semester||""} · ${row.section?.name||"Section"}`:row.scope==="FACULTY"?row.faculty?.name||"Faculty":"Complete Timetable",session:row.academicSession,timetable:{_id:t?._id,version:t?.version,versionLabel:t?.versionLabel,status:t?.status},entries});
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/public/share/:token/qr", async (req,res)=>{
  try{
    const row=await ShareLink.findOne({token:req.params.token}).populate("timetable","status"); if(!row||!row.active)return res.status(404).send("Unavailable");
    if(row.expiresAt&&row.expiresAt<new Date())return res.status(410).send("Expired");
    if(!row.timetable || !["PUBLISHED","LOCKED"].includes(row.timetable.status)) return res.status(404).send("Unavailable");
    const QRCode=(await import("qrcode")).default;
    const publicBase=String(env.publicAppUrl||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
    const png=await QRCode.toBuffer(`${publicBase}/share/${row.token}`);
    res.type("png").send(png);
  }catch(e){res.status(500).send("QR generation failed");}
});

async function ensureDefaultAdmin() {
  const username = "admin";
  const existing = await User.findOne({ username });
  if (existing) return;

  const defaultPassword = String(process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
  if (!defaultPassword || defaultPassword.length < 10 || defaultPassword === "admin123") {
    throw new Error("DEFAULT_ADMIN_PASSWORD must be configured to a non-default value of at least 10 characters.");
  }
  const passwordHash = await bcrypt.hash(defaultPassword, 12);
  await User.create({
    name: "System Administrator",
    username,
    passwordHash,
    role: "ADMIN",
    active: true
  });
  console.log("Default administrator created from DEFAULT_ADMIN_PASSWORD.");
}

const PORT = env.port;
let server;

app.get("/api/readiness", async (_req, res) => {
  const database = mongoose.connection.readyState === 1;
  res.status(database ? 200 : 503).json({ ok: database, database: database ? "connected" : "disconnected" });
});

app.get("/api/system/health", requireAuth, allowRoles("ADMIN"), async (_req, res) => {
  const startedAt = Number(globalThis.__APP_STARTED_AT || Date.now());
  const database = mongoose.connection.readyState === 1;
  let session = null;
  let timetable = null;
  try {
    session = await AcademicSession.findOne({active:true}).select("name _id").lean();
    if(session) timetable = await Timetable.findOne({academicSession:session._id,isCurrent:true}).select("version versionLabel status generatedAt").sort({createdAt:-1}).lean();
  } catch {}
  res.status(database ? 200 : 503).json({
    ok: database,
    environment: env.nodeEnv,
    node: process.version,
    uptimeSeconds: Math.floor((Date.now()-startedAt)/1000),
    database: database ? "connected" : "disconnected",
    activeSession: session,
    currentTimetable: timetable
  });
});

// Keep API failures JSON-shaped and avoid stack traces in production.
app.use(notFoundHandler);
app.use(errorHandler);

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  if (!server) return process.exit(0);
  server.close(async () => {
    try { await mongoose.connection.close(false); } catch (e) { console.error("MongoDB close failed:", e.message); }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

connectDB().then(async () => {
  await ensureDefaultAdmin();
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
    // Explicitly opt-in, idempotent demo seed. It runs after listen so Render
    // health checks are not blocked by sample-data insertion. Existing data is
    // never cleared, and the seed marker prevents repeat inserts on restarts.
    if (process.env.SEED_DEMO_DATA_ON_START === "true") {
      seedDemoData({ mongoose })
        .then(result => console.log("Demo data seed result:", JSON.stringify(result)))
        .catch(error => console.error("Demo data seed failed:", error?.message || error));
    }
  });
}).catch(err => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
