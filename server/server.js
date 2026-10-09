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
import AcademicSession from "./models/AcademicSession.js";
import Timetable from "./models/Timetable.js";
import SchedulerSetting from "./models/SchedulerSetting.js";
import { generateTimetable, generateBestTimetable } from "./services/generator.js";
import ExcelJS from "exceljs";
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
import User from "./models/User.js";
import ShareLink from "./models/ShareLink.js";
import Student from "./models/Student.js";

const app = express();
globalThis.__APP_STARTED_AT = Date.now();

if (env.trustProxy) {
  app.set("trust proxy", 1);
}

const isProduction = env.isProduction;
const configuredOrigins = env.corsOrigins;

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (configuredOrigins.length === 0 && !isProduction) return callback(null, true);
    if (configuredOrigins.includes(origin)) return callback(null, true);
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

function normalizeProgramDates(programDates){
  if(!Array.isArray(programDates)) return [];
  return programDates.filter(x=>x?.program&&x?.startDate&&x?.endDate).map(x=>({
    program:x.program,
    startDate:x.startDate,
    endDate:x.endDate
  }));
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
    const dates=programDates.map(x=>({start:new Date(x.startDate),end:new Date(x.endDate)})).filter(x=>!Number.isNaN(x.start.valueOf())&&!Number.isNaN(x.end.valueOf()));
    if(!body.name?.trim())return res.status(400).json({message:"Academic session name is required."});
    if(programDates.length!==dates.length || dates.some(x=>x.end<x.start))return res.status(400).json({message:"Every program must have a valid start date and end date."});
    const startDate=dates.length?new Date(Math.min(...dates.map(x=>x.start.valueOf()))):null;
    const endDate=dates.length?new Date(Math.max(...dates.map(x=>x.end.valueOf()))):null;
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
    const programDates=normalizeProgramDates(body.programDates);
    if(programDates.length){
      const dates=programDates.map(x=>({start:new Date(x.startDate),end:new Date(x.endDate)}));
      if(dates.some(x=>Number.isNaN(x.start.valueOf())||Number.isNaN(x.end.valueOf())||x.end<x.start))return res.status(400).json({message:"Every program must have a valid start date and end date."});
      row.programDates=programDates;
      row.startDate=new Date(Math.min(...dates.map(x=>x.start.valueOf())));
      row.endDate=new Date(Math.max(...dates.map(x=>x.end.valueOf())));
    }else if(body.programDates){
      row.programDates=[];
      row.startDate=body.startDate||null;
      row.endDate=body.endDate||null;
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
    row.holidayDates=holidays;await row.save();
    res.json(await AcademicSession.findById(row._id).populate("programDates.program","name code").lean());
  }catch(e){res.status(400).json({message:e.message});}
});


// ---------------- Academic Structure ----------------
// Program -> Semester -> Section is the canonical academic structure.
// Section.programId is the authoritative Program relationship; section.program/semester/name
// are retained as human-readable compatibility fields for existing timetable data.
app.get("/api/academic-structure", requireAuth, async (req, res) => {
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
    if (!programId || !semester || !name) return res.status(400).json({ message: "Program, Semester and Section Name are required." });
    const program = await Program.findById(programId).lean();
    if (!program) return res.status(404).json({ message: "Program not found." });
    if (academicSession) {
      const session = await AcademicSession.findById(academicSession).lean();
      if (!session) return res.status(404).json({ message: "Academic Session not found." });
    }
    const existing = await Section.findOne({ programId, academicSession: academicSession || null, semester: String(semester).trim(), name: String(name).trim() });
    if (existing) return res.status(409).json({ message: "This section already exists for the selected Program, Semester and Academic Session." });
    const row = await Section.create({ programId, academicSession: academicSession || null, program: program.name, semester: String(semester).trim(), name: String(name).trim(), maxClassesPerDay: Number(maxClassesPerDay || 6), capacity: Number(capacity || 0) });
    res.status(201).json(await Section.findById(row._id).populate("programId", "name code").populate("academicSession", "name active").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.put("/api/academic-structure/sections/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage sections." });
  try {
    const row = await Section.findById(req.params.id);
    if (!row) return res.status(404).json({ message: "Section not found." });
    const { programId, academicSession, semester, name, maxClassesPerDay, capacity } = req.body || {};
    if (programId) {
      const program = await Program.findById(programId).lean();
      if (!program) return res.status(404).json({ message: "Program not found." });
      row.programId = program._id;
      row.program = program.name;
    }
    if (academicSession !== undefined) row.academicSession = academicSession || null;
    if (semester !== undefined) row.semester = String(semester).trim();
    if (name !== undefined) row.name = String(name).trim();
    if (maxClassesPerDay !== undefined) row.maxClassesPerDay = Number(maxClassesPerDay || 6);
    if (capacity !== undefined) row.capacity = Math.max(Number(capacity || 0), 0);
    await row.save();
    res.json(await Section.findById(row._id).populate("programId", "name code").populate("academicSession", "name active").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.delete("/api/academic-structure/sections/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage sections." });
  try {
    const studentCount = await Student.countDocuments({ section: req.params.id, active: { $ne: false } });
    if (studentCount) return res.status(409).json({ message: `Cannot delete this section because ${studentCount} active student(s) are mapped to it. Move the students first.` });
    const row = await Section.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: "Section not found." });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

function crud(path, Model) {
  app.get(`/api/${path}`, requireAuth, async (_req,res) => {
    try { res.json(await Model.find().sort({ createdAt: -1 })); }
    catch(e) { res.status(500).json({message:e.message}); }
  });
  app.post(`/api/${path}`, requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try { res.status(201).json(await Model.create(req.body)); }
    catch(e) { res.status(400).json({message:e.message}); }
  });
  app.put(`/api/${path}/:id`, requireAuth, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try {
      const body = {...req.body};
      delete body._id;
      delete body.createdAt;
      delete body.updatedAt;

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
          [Timetable, {"entries.faculty":id}, "timetable entry/entries"]
        ],
        subjects: [
          [Timetable, {"entries.subject":id}, "timetable entry/entries"]
        ],
        sections: [
          [Student, {section:id, active:{$ne:false}}, "active student(s)"],
          [Subject, {section:id}, "subject assignment(s)"],
          [Timetable, {"entries.section":id}, "timetable entry/entries"]
        ],
        rooms: [
          [Timetable, {"entries.room":id}, "timetable entry/entries"]
        ],
        timeslots: [],
        programs: [
          [Section, {programId:id}, "section(s)"],
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
app.get("/api/subject-mappings", requireAuth, async (req, res) => {
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
    if (section.academicSession && String(section.academicSession) !== String(session._id)) return res.status(400).json({ message: "Selected section belongs to a different Academic Session." });
    const programId = program?._id || section.programId || null;
    const exists = await Subject.findOne({ academicSession: session._id, section: section._id, code: String(b.code || "").trim() || undefined, name: String(b.name).trim() });
    if (exists) return res.status(409).json({ message: "This subject is already mapped to the selected section and academic session." });
    const row = await Subject.create({
      academicSession: session._id,
      programId,
      subjectType: b.subjectType || "CORE",
      active: b.active !== false,
      name: String(b.name).trim(), code: String(b.code || "").trim(),
      faculty: faculty._id, section: section._id,
      classesPerWeek: Number(b.classesPerWeek || 1),
      totalSessions: Number(b.totalSessions || 0),
      maxClassesPerWeek: Number(b.maxClassesPerWeek || b.classesPerWeek || 1),
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
    const programId = b.programId || section.programId || row.programId || null;
    Object.assign(row, {
      academicSession: session._id, programId, subjectType: b.subjectType || row.subjectType || "CORE", active: b.active !== false,
      name: b.name !== undefined ? String(b.name).trim() : row.name,
      code: b.code !== undefined ? String(b.code || "").trim() : row.code,
      faculty: faculty._id, section: section._id,
      classesPerWeek: Number(b.classesPerWeek || row.classesPerWeek || 1),
      totalSessions: Number(b.totalSessions || 0), maxClassesPerWeek: Number(b.maxClassesPerWeek || row.maxClassesPerWeek || b.classesPerWeek || row.classesPerWeek || 1),
      duration: Number(b.duration || row.duration || 1), roomType: b.roomType || row.roomType || "Classroom"
    });
    await row.save();
    res.json(await Subject.findById(row._id).populate("academicSession", "name active").populate("programId", "name code").populate("faculty", "name code").populate("section", "program semester name academicSession").lean());
  } catch (e) { res.status(400).json({ message: e.message }); }
});

app.delete("/api/subject-mappings/:id", requireAuth, async (req, res) => {
  if (!["ADMIN", "SCHEDULER"].includes(req.user?.role)) return res.status(403).json({ message: "Only Admin or Scheduler can manage subject mappings." });
  try { const row = await Subject.findByIdAndDelete(req.params.id); if (!row) return res.status(404).json({ message: "Subject mapping not found." }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ message: e.message }); }
});

app.get("/api/subject-mappings/summary", requireAuth, async (req, res) => {
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

app.get("/api/timetable/readiness", requireAuth, async (req,res) => {
  try {
    const sessionId=String(req.query.sessionId||"").trim();
    if(!sessionId) return res.status(400).json({message:"sessionId is required."});
    const session=await AcademicSession.findById(sessionId).lean();
    if(!session) return res.status(404).json({message:"Academic session not found."});

    const sections = await Section.find({ academicSession: sessionId }).lean();
    const sectionIds = sections.map(s => s._id);
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
    const usableSlots=slots.filter(x=>x&&!x.isBreak&&String(x.day)!=="Sunday");
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
      if(Number(sub.duration||1)>usableSlots.length) push("ERROR","Duration",`${sub.name||"Unnamed subject"} requires ${sub.duration} consecutive periods, but the configured timetable has fewer usable periods.`);
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
      const capacity=days.length*maxPerDay;
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
      const availDays=new Set(Array.isArray(f.availableDays)&&f.availableDays.length?f.availableDays:days);
      const possible=usableSlots.filter(slot=>availDays.has(String(slot.day))&&!unavailable.has(`${slot.day}|${slot.startTime}-${slot.endTime}`));
      if(!possible.length) blockedByFaculty.push(sub.name||"Unnamed subject");
    }
    if(blockedByFaculty.length) push("ERROR","Faculty Availability",`${blockedByFaculty.length} subject mapping(s) have no available period after faculty availability restrictions.`);

    const status=issues.length?"NOT_READY":warnings.length?"READY_WITH_WARNINGS":"READY";
    res.json({
      session:{_id:session._id,name:session.name,active:session.active},
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
    if(academicSessionId){
      const session=await AcademicSession.findById(academicSessionId);
      if(!session)return res.status(404).json({message:"Selected academic session was not found."});
    }
    // IMPORTANT: load Subjects as raw documents. Do not depend on populate().
    // A valid MongoDB ObjectId reference is enough for the generator.
    const [faculty, sections, rooms, slots, programs] = await Promise.all([
      Faculty.find().lean(),
      academicSessionId ? Section.find({ academicSession: academicSessionId }).lean() : Section.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean(),
      Program.find().lean()
    ]);

    const sectionIdsForSession = sections.map(s => s._id);
    const subjectFilter = academicSessionId
      ? { $and: [
          { $or: [{ academicSession: academicSessionId }, { academicSession: null }] },
          { section: { $in: sectionIdsForSession } },
          { active: { $ne: false } }
        ] }
      : { active: { $ne: false } };
    const subjects = await Subject.find(subjectFilter).lean();

    let settings = null;
    try {
      settings = await SchedulerSetting.findOne({ key: "default" }).lean();
      const override = settings?.sessionOverrides?.find(x => String(x.academicSession) === String(academicSessionId));
      if (override) settings = { ...settings, ...override };
    } catch (settingsError) {
      console.error("Scheduler settings unavailable:", settingsError.message);
    }

    if (!subjects.length) return res.status(400).json({message:"No subjects found. Import or add Subjects first."});
    const holidayDays = new Set(["Sunday", ...(Array.isArray(settings?.holidayDays) ? settings.holidayDays : [])]);
    const usableSlots = slots.filter(s => !s.isBreak && !holidayDays.has(String(s.day)));
    if (!usableSlots.length) return res.status(400).json({message:`No usable time slots found after excluding holidays (${[...holidayDays].join(", ")}). Add Time Slots for working days first.`});
    if (!faculty.length) return res.status(400).json({message:"No faculty found. Add or import Faculty first."});
    if (!sections.length) return res.status(400).json({message:"No sections found. Add or import Sections first."});
    if (!rooms.length) return res.status(400).json({message:"No rooms found. Add or import Rooms first."});

    const facultyIds = new Set(faculty.map(f => String(f._id)));
    const sectionIds = new Set(sections.map(s => String(s._id)));

    const invalidSubjects = [];
    const validSubjects = [];

    for (const s of subjects) {
      const fid = s.faculty ? String(s.faculty._id || s.faculty) : "";
      const sid = s.section ? String(s.section._id || s.section) : "";
      const reasons = [];

      if (!fid) reasons.push("Faculty reference is empty");
      else if (!facultyIds.has(fid)) reasons.push(`Faculty ID ${fid} does not exist`);

      if (!sid) reasons.push("Section reference is empty");
      else if (!sectionIds.has(sid)) reasons.push(`Section ID ${sid} does not exist`);

      if (reasons.length) {
        invalidSubjects.push({name:s.name,faculty:fid,section:sid,reasons});
      } else {
        validSubjects.push(s);
      }
    }

    console.log("GENERATION DATA CHECK", {
      faculty: faculty.length,
      sections: sections.length,
      subjects: subjects.length,
      validSubjects: validSubjects.length,
      invalidSubjects: invalidSubjects.length,
      invalid: invalidSubjects.slice(0,20)
    });

    if (!validSubjects.length) {
      return res.status(422).json({
        message: "No valid subjects can be scheduled.",
        warnings: [
          `${invalidSubjects.length} subject(s) have invalid Faculty/Section references.`,
          "The server checked the actual MongoDB ObjectIds against the current Faculty and Section collections."
        ],
        diagnostics: invalidSubjects.slice(0,50)
      });
    }

    const generationRuns = Math.max(1, Math.min(30, Number(req.body?.generationRuns || settings?.generationRuns || env.schedulerGenerationRuns)));
    const generationTimeLimitMs = Math.max(1000, Math.min(120000, Number(req.body?.generationTimeLimitMs || settings?.generationTimeLimitMs || env.schedulerGenerationTimeLimitMs)));
    const result = generateBestTimetable({
      faculty,
      subjects: validSubjects,
      sections,
      rooms,
      slots: usableSlots,
      programs: await Program.find({}).lean(),
      settings: settings || {},
      runs: generationRuns,
      totalMaxMillis: generationTimeLimitMs,
      perRunMillis: Math.max(750, Math.floor(generationTimeLimitMs / generationRuns)),
      attemptsPerRun: env.schedulerGenerationAttempts
    });

    console.log("Timetable generation:", {
      requestedSessions: validSubjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0),
      generatedSessions: result.entries?.length || 0,
      warnings: result.warnings || []
    });

    const requiredSessions = validSubjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0);
    const validation = validateTimetable({
      entries: result.entries || [],
      faculty,
      sections,
      subjects: validSubjects,
      rooms,
      slots: usableSlots,
      programs,
      settings: settings || {},
      holidayDays: settings?.holidayDays || ["Sunday"]
    });

    if (!(result.entries?.length)) {
      return res.status(422).json({
        message: "No timetable entries could be generated.",
        warnings: result.warnings || [],
        diagnostics: invalidSubjects.slice(0,50)
      });
    }

    if (result.entries.length < requiredSessions) {
      return res.status(422).json({
        message: `Timetable generation is incomplete: ${result.entries.length}/${requiredSessions} required weekly sessions were scheduled. Nothing was saved.`,
        warnings: result.warnings || [],
        validation
      });
    }

    if (!validation.valid) {
      return res.status(422).json({
        message: "Generated timetable failed hard-constraint validation. Nothing was saved.",
        warnings: result.warnings || [],
        validation
      });
    }

    if(academicSessionId){
      await Timetable.updateMany({academicSession:academicSessionId},{$set:{isCurrent:false}});
    }
    const lastVersion=academicSessionId
      ? await Timetable.findOne({academicSession:academicSessionId}).sort({version:-1}).select("version")
      : await Timetable.findOne().sort({version:-1}).select("version");
    const nextVersion=Number(lastVersion?.version||0)+1;
    const saved = await Timetable.create({
      ...result,
      optimizationScore: result.metrics?.qualityScore ?? result.score ?? null,
      optimizationMetrics: result.metrics || null,
      optimizationRuns: generationRuns,
      academicSession: academicSessionId,
      version: nextVersion,
      versionLabel: `Version ${nextVersion}`,
      isCurrent: true,
      createdBy: req.user?.username||"",
      status: "DRAFT",
      statusChangedAt: new Date(),
      statusNote: ""
    });

    const populated = await Timetable.findById(saved._id)
      .populate("entries.section entries.subject entries.faculty entries.room");

    res.json(populated);
  } catch(e) {
    console.error("TIMETABLE GENERATION ERROR", e);
    res.status(500).json({message:e.message, stack:process.env.NODE_ENV === "development" ? e.stack : undefined});
  }
});


app.get("/api/timetable/versions", requireAuth, async (req,res)=>{
  try{
    const filter=req.query.sessionId?{academicSession:req.query.sessionId}:{};
    const rows=await Timetable.find(filter).select("version versionLabel status isCurrent createdAt updatedAt notes academicSession totalEntries entries").sort({version:-1}).lean();
    res.json(rows.map(x=>({...x,totalEntries:x.totalEntries??x.entries?.length??0,entries:undefined})));
  }catch(e){res.status(500).json({message:e.message});}
});

app.post("/api/timetable/:id/restore", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role))return res.status(403).json({message:"Only Admin or Scheduler can restore timetable versions."});
  try{
    const source=await Timetable.findById(req.params.id).lean();
    if(!source)return res.status(404).json({message:"Timetable version not found."});
    const filter=source.academicSession?{academicSession:source.academicSession}:{};
    await Timetable.updateMany(filter,{$set:{isCurrent:false}});
    const last=await Timetable.findOne(filter).sort({version:-1}).select("version");
    const next=Number(last?.version||0)+1;
    const restored=await Timetable.create({
      ...source,
      _id:undefined,
      version:next,
      versionLabel:`Version ${next} · Restored`,
      isCurrent:true,
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:`Restored from Version ${source.version}.`,
      createdBy:req.user?.username||"",
      createdAt:undefined,
      updatedAt:undefined,
      approvalHistory:[]
    });
    const populated=await Timetable.findById(restored._id).populate("entries.section entries.subject entries.faculty entries.room");
    res.status(201).json(populated);
  }catch(e){res.status(400).json({message:e.message});}
});

app.post("/api/timetable/clone", requireAuth, async (req,res)=>{
  if(!["ADMIN","SCHEDULER"].includes(req.user?.role))return res.status(403).json({message:"Only Admin or Scheduler can clone timetables."});
  try{
    const source=await Timetable.findById(req.body?.sourceTimetableId).lean();
    const target=await AcademicSession.findById(req.body?.targetSessionId);
    if(!source)return res.status(404).json({message:"Source timetable version not found."});
    if(!target)return res.status(404).json({message:"Target academic session not found."});
    await Timetable.updateMany({academicSession:target._id},{$set:{isCurrent:false}});
    const last=await Timetable.findOne({academicSession:target._id}).sort({version:-1}).select("version");
    const next=Number(last?.version||0)+1;
    const cloned=await Timetable.create({
      entries:source.entries||[],
      score:source.score,
      optimizationScore:source.optimizationScore,
      optimizationMetrics:source.optimizationMetrics,
      optimizationRuns:source.optimizationRuns,
      optimizationComparison:source.optimizationComparison||[],
      warnings:source.warnings||[],
      academicSession:target._id,
      version:next,
      versionLabel:String(req.body?.versionLabel||`Version ${next}`),
      isCurrent:true,
      createdBy:req.user?.username||"",
      notes:String(req.body?.notes||""),
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:"Cloned from another academic session."
    });
    const populated=await Timetable.findById(cloned._id).populate("academicSession entries.section entries.subject entries.faculty entries.room");
    res.status(201).json(populated);
  }catch(e){res.status(400).json({message:e.message});}
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

    const filter = timetableId
      ? { _id: timetableId }
      : { ...(sessionId ? { academicSession: sessionId } : {}), isCurrent: true };
    let timetable = await Timetable.findOne(filter).sort({ createdAt: -1 });
    if (!timetable && sessionId) timetable = await Timetable.findOne({ academicSession: sessionId }).sort({ createdAt: -1 });
    if (!timetable) return res.status(404).json({ message: "No timetable found for the selected academic session." });

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

    const noteText = String(note || "").trim();
    const noteRequired = ["DRAFT", "APPROVED", "PUBLISHED"].includes(status) && ["SUBMITTED", "APPROVED", "LOCKED"].includes(current);
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
      statusNote: timetable?.statusNote || "",
      approvalHistory: timetable?.approvalHistory || []
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
      SUBMITTED: [{status:"DRAFT",roles:["ADMIN","SCHEDULER"],requiresNote:true},{status:"APPROVED",roles:["ADMIN"]}],
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
      history:timetable?.approvalHistory||[]
    });
  } catch(e){ res.status(500).json({message:e.message}); }
});


function filterTimetableExportEntries(timetable, req) {
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
  const entries = (timetable.entries || []).filter(entry => {
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
    const filter=req.query.sessionId
      ? { academicSession:req.query.sessionId, isCurrent:true }
      : { isCurrent:true };
    const timetable=await Timetable.findOne(filter).sort({createdAt:-1}).populate("entries.section entries.subject entries.faculty entries.room").lean();
    if(!timetable) return res.json({hasTimetable:false,summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0},faculty:[],rooms:[],sections:[],daily:[],conflicts:[],quality:null,warnings:[]});

    const entries=timetable.entries||[];
    const metrics=timetable.optimizationMetrics||{};
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
    const required=Number(metrics.requiredSessions||entries.length), scheduled=Number(metrics.scheduledSessions||entries.length);
    const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const daily=days.map(day=>({day,periods:dayMap.get(day)||0}));
    const conflicts=[]; const seen=new Map();
    for(const e of entries){
      const key=`${e.day}|${e.startTime}|${e.endTime}`;
      for(const [type,id,label] of [["Faculty",String(e.faculty?._id||e.faculty||""),e.faculty?.name],["Section",String(e.section?._id||e.section||""),analyticsLabel(e.section)],["Room",String(e.room?._id||e.room||""),e.room?.name]]){
        if(!id) continue; const k=`${type}|${id}|${key}`;
        if(seen.has(k)) conflicts.push({type,label,day:e.day,startTime:e.startTime,endTime:e.endTime,entries:[seen.get(k),e.subject?.name||"Unknown"]});
        else seen.set(k,e.subject?.name||"Unknown");
      }
    }
    const warnings=[];
    if((metrics.unscheduledSessions||0)>0) warnings.push(`${metrics.unscheduledSessions} required session(s) remain unscheduled.`);
    if((metrics.subjectSameDayRepeats||0)>0) warnings.push(`${metrics.subjectSameDayRepeats} subject same-day repeat(s) were detected by the generation quality model.`);
    res.json({hasTimetable:true,timetableId:timetable._id,version:timetable.version,versionLabel:timetable.versionLabel,status:timetable.status,createdAt:timetable.createdAt,summary:{requiredSessions:required,scheduledSessions:scheduled,coverage:Number((required?scheduled/required*100:100).toFixed(1)),unscheduledSessions:Math.max(0,required-scheduled)},faculty,rooms,sections:[...sectionMap.values()],daily,dailyMax:Math.max(1,...daily.map(x=>x.periods)),conflicts,quality:{...metrics,optimizationScore:timetable.optimizationScore},warnings:[...(timetable.warnings||[]),...warnings]});
  } catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/analytics/conflicts", requireAuth, async (req,res) => {
  try{
    const filter={}; if(req.query.sessionId) filter.academicSession=req.query.sessionId;
    const t=await Timetable.findOne(filter).sort({createdAt:-1}).populate("entries.section entries.subject entries.faculty entries.room").lean();
    if(!t) return res.json({hasTimetable:false,conflicts:[]});
    const entries=t.entries||[], groups=new Map(), conflicts=[];
    for(const e of entries){
      const slot=`${e.day}|${e.startTime}|${e.endTime}`;
      for(const [type,id,label] of [["Faculty",String(e.faculty?._id||e.faculty||""),e.faculty?.name],["Section",String(e.section?._id||e.section||""),analyticsLabel(e.section)],["Room",String(e.room?._id||e.room||""),e.room?.name]]){
        if(!id) continue; const k=`${type}|${id}|${slot}`; const arr=groups.get(k)||[]; arr.push({subject:e.subject?.name||"Unknown",day:e.day,startTime:e.startTime,endTime:e.endTime,section:analyticsLabel(e.section),faculty:e.faculty?.name||"",room:e.room?.name||""}); groups.set(k,arr);
      }
    }
    for(const [k,arr] of groups) if(arr.length>1){const [type,,slot]=k.split("|"); conflicts.push({type,day:arr[0].day,startTime:arr[0].startTime,endTime:arr[0].endTime,resource:type==="Faculty"?arr[0].faculty:type==="Room"?arr[0].room:arr[0].section,entries:arr});}
    res.json({hasTimetable:true,timetableId:t._id,version:t.version,conflicts});
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/timetable/latest", requireAuth, async (req,res) => {
  try {
    const t = await currentTimetableFor(req);
    res.json(t || {entries:[],warnings:[],status:"DRAFT"});
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
  const ao=Number(a.order||0), bo=Number(b.order||0);
  const ad=Math.max(1,Number(a.duration||1)), bd=Math.max(1,Number(b.duration||1));
  return ao < bo+bd && bo < ao+ad;
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
          resource:entries[i][field]?.name||entries[i][section]?.name||"Resource",
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

// Personal timetable for Faculty/Viewer users.
app.get("/api/personal-timetable", requireAuth, async (req,res)=>{
  try{
    const t=await currentTimetableFor(req);
    if(!t) return res.json({timetable:null,entries:[],summary:{classes:0,periods:0,workingDays:0}});
    const role=req.user?.role;
    let entries=t.entries||[];
    if(role==="FACULTY"){
      if(!req.user?.faculty) return res.json({timetable:t,entries:[],summary:{classes:0,periods:0,workingDays:0},message:"No Faculty account mapping is configured for this user."});
      entries=entries.filter(e=>String(e.faculty?._id||e.faculty)===String(req.user.faculty));
    }else if(role==="VIEWER" && req.user?.section){
      entries=entries.filter(e=>String(e.section?._id||e.section)===String(req.user.section));
    }
    const periods=entries.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    res.json({timetable:{...t,entries},entries,summary:{classes:entries.length,periods,workingDays:new Set(entries.map(e=>e.day)).size}});
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
    const filter=req.user?.role==="VIEWER" && req.user?.section ? {_id:req.user.section} : {};
    const rows=await Section.find(filter).populate("programId","name code").populate("academicSession","name active").sort({program:1,semester:1,name:1}).lean();
    res.json(rows.map(s=>({id:s._id,_id:s._id,name:s.name,program:s.programId?.name||s.program,programCode:s.programId?.code||"",semester:s.semester,academicSession:s.academicSession})));
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/section-portal", requireAuth, async (req,res)=>{
  try{
    const sectionId=req.query.sectionId || req.user?.section;
    if(!sectionId) return res.status(400).json({message:"Section is required."});
    if(req.user?.role==="VIEWER" && String(req.user.section)!==String(sectionId)) return res.status(403).json({message:"You can only view your assigned Section portal."});
    const [section,t]=await Promise.all([Section.findById(sectionId).populate("programId","name code").lean(),currentTimetableFor(req)]);
    if(!section) return res.status(404).json({message:"Section not found."});
    const entries=(t?.entries||[]).filter(e=>String(e.section?._id||e.section)===String(sectionId));
    const periods=entries.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    res.json({section:{...section,program:section.programId?.name||section.program},timetable:t?{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel}:null,timetableRows:entries,entries,summary:{classes:entries.length,weeklyPeriods:periods,workingDays:new Set(entries.map(e=>e.day)).size},notifications:[]});
  }catch(e){res.status(500).json({message:e.message});}
});

// Validation Center.
app.get("/api/timetable/validation", requireAuth, async (req,res)=>{
  try{
    const t=await currentTimetableFor(req);
    if(!t) return res.json({hasTimetable:false,summary:{errors:0,warnings:0},issues:[{severity:"warning",category:"Timetable",message:"No timetable has been generated yet."}]});
    const issues=[];
    const conflicts=timetableConflicts(t.entries||[]);
    conflicts.forEach(c=>issues.push({severity:"error",category:`${c.type} conflict`,message:`${c.resource} has overlapping classes on ${c.day} at ${c.startTime}.`}));
    const metrics=t.optimizationMetrics||{};
    if(Number(metrics.unscheduledSessions||0)>0) issues.push({severity:"error",category:"Unscheduled sessions",message:`${metrics.unscheduledSessions} required session(s) remain unscheduled.`});
    if((t.warnings||[]).length) t.warnings.forEach(w=>issues.push({severity:"warning",category:"Generation warning",message:w}));
    res.json({hasTimetable:true,timetable:{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel},summary:{errors:issues.filter(x=>x.severity==="error").length,warnings:issues.filter(x=>x.severity==="warning").length},issues,conflicts});
  }catch(e){res.status(500).json({message:e.message});}
});

// Compare two timetable versions.
app.get("/api/timetable/change-history", requireAuth, async (req,res)=>{
  try{
    const [from,to]=await Promise.all([Timetable.findById(req.query.fromId).lean(),Timetable.findById(req.query.toId).lean()]);
    if(!from||!to) return res.status(404).json({message:"Both timetable versions are required."});
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
app.get("/api/reports/summary", requireAuth, async (req,res)=>{
  try{
    const filter=req.query.sessionId
      ? { academicSession:req.query.sessionId, isCurrent:true }
      : { isCurrent:true };
    const t=await populatedTimetableQuery(Timetable.findOne(filter).sort({createdAt:-1})).lean();
    if(!t) return res.json({timetable:null,summary:{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0},faculty:[],rooms:[],sections:[],daily:[],issues:[]});
    const entries=t.entries||[], metrics=t.optimizationMetrics||{};
    const facultyMap=new Map(),roomMap=new Map(),sectionMap=new Map(),dayMap=new Map();
    for(const e of entries){
      const d=Math.max(1,Number(e.duration||1));
      const f=String(e.faculty?._id||e.faculty||""); if(f){const x=facultyMap.get(f)||{id:f,name:e.faculty?.name||"Unknown",classes:0,periods:0};x.classes++;x.periods+=d;facultyMap.set(f,x);}
      const r=String(e.room?._id||e.room||""); if(r){const x=roomMap.get(r)||{id:r,name:e.room?.name||"Unknown",type:e.room?.type||"—",classes:0,periods:0};x.classes++;x.periods+=d;roomMap.set(r,x);}
      const s=String(e.section?._id||e.section||""); if(s){const x=sectionMap.get(s)||{id:s,label:[e.section?.program,e.section?.semester,e.section?.name].filter(Boolean).join(" · "),classes:0,periods:0,required:0};x.classes++;x.periods+=d;sectionMap.set(s,x);}
      dayMap.set(e.day,(dayMap.get(e.day)||0)+d);
    }
    const required=Number(metrics.requiredSessions||entries.length), scheduled=Number(metrics.scheduledSessions||entries.length);
    const daily=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=>({day,classes:entries.filter(e=>e.day===day).length,periods:dayMap.get(day)||0}));
    const issues=timetableConflicts(entries).map(c=>({severity:"error",category:`${c.type} conflict`,message:`${c.resource} has overlapping classes on ${c.day} at ${c.startTime}.`}));
    res.json({timetable:{_id:t._id,status:t.status,version:t.version,versionLabel:t.versionLabel,createdAt:t.createdAt},summary:{requiredSessions:required,scheduledSessions:scheduled,coverage:Number((required?scheduled/required*100:100).toFixed(1)),unscheduledSessions:Math.max(0,required-scheduled)},faculty:[...facultyMap.values()],rooms:[...roomMap.values()],sections:[...sectionMap.values()],daily,issues,quality:t.optimizationMetrics||null,warnings:t.warnings||[]});
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/reports/export/:type", requireAuth, async (req,res)=>{
  try{
    const t=await currentTimetableFor(req); if(!t) return res.status(404).json({message:"No timetable available."});
    if(req.params.type==="excel"){
      const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet("Timetable");
      ws.addRow(["Day","Start","End","Program","Semester","Section","Subject","Faculty","Room"]);
      (t.entries||[]).forEach(e=>ws.addRow([e.day,e.startTime,e.endTime,e.section?.program,e.section?.semester,e.section?.name,e.subject?.name,e.faculty?.name,e.room?.name]));
      res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition",'attachment; filename="timetable-report.xlsx"'); await wb.xlsx.write(res); return res.end();
    }
    if(req.params.type==="pdf"){
      const PDFDocument=(await import("pdfkit")).default; res.setHeader("Content-Type","application/pdf"); res.setHeader("Content-Disposition",'attachment; filename="timetable-report.pdf"');
      const doc=new PDFDocument({size:"A4",layout:"landscape",margin:30}); doc.pipe(res); doc.fontSize(16).text("Timetable Report",{align:"center"});doc.moveDown();
      (t.entries||[]).forEach(e=>doc.fontSize(8).text(`${e.day} ${e.startTime}-${e.endTime} | ${e.section?.name||""} | ${e.subject?.name||""} | ${e.faculty?.name||""} | ${e.room?.name||""}`));doc.end(); return;
    }
    return res.status(400).json({message:"Supported report types: excel, pdf."});
  }catch(e){res.status(500).json({message:e.message});}
});

// Public sharing administration and read-only endpoints.
app.get("/api/shareable-timetables", requireAuth, async (_req,res)=>{
  try{
    const rows=await Timetable.find({status:{$in:["PUBLISHED","LOCKED"]}}).populate("academicSession","name").select("version versionLabel status academicSession createdAt").sort({createdAt:-1}).lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});
app.get("/api/share-links", requireAuth, async (_req,res)=>{
  try{res.json(await ShareLink.find().populate("timetable","version versionLabel status").populate("academicSession","name").populate("section","program semester name").populate("faculty","name code").sort({createdAt:-1}).lean());}
  catch(e){res.status(500).json({message:e.message});}
});
app.post("/api/share-links", requireAuth, async (req,res)=>{
  if(req.user?.role!=="ADMIN") return res.status(403).json({message:"Only Admin can create public share links."});
  try{
    const timetable=await Timetable.findById(req.body?.timetableId);
    if(!timetable) return res.status(404).json({message:"Timetable not found."});
    if(!["PUBLISHED","LOCKED"].includes(timetable.status)) return res.status(409).json({message:"Only published or locked timetables can be shared."});
    const scope=req.body?.scope||"FULL";
    if(scope==="SECTION"&&!req.body?.sectionId) return res.status(400).json({message:"Section is required."});
    if(scope==="FACULTY"&&!req.body?.facultyId) return res.status(400).json({message:"Faculty is required."});
    const expires=req.body?.expiresIn||"7d";
    let expiresAt=null;
    const m=/^(\d+)(h|d)$/.exec(expires); if(m) expiresAt=new Date(Date.now()+Number(m[1])*(m[2]==="h"?3600000:86400000));
    const token=(await import("crypto")).randomBytes(24).toString("hex");
    const row=await ShareLink.create({token,timetable:timetable._id,academicSession:timetable.academicSession,scope,section:scope==="SECTION"?req.body.sectionId:null,faculty:scope==="FACULTY"?req.body.facultyId:null,expiresAt,createdBy:req.user?.id || null,createdByName:req.user?.username||""});
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
  server = app.listen(PORT, "0.0.0.0", () => console.log(`Server listening on port ${PORT}`));
}).catch(err => { console.error("MongoDB connection failed:", err.message); process.exit(1); });
