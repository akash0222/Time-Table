import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import Faculty from "./models/Faculty.js";
import Subject from "./models/Subject.js";
import Section from "./models/Section.js";
import Room from "./models/Room.js";
import TimeSlot from "./models/TimeSlot.js";
import Program from "./models/Program.js";
import Timetable from "./models/Timetable.js";
import SchedulerSetting from "./models/SchedulerSetting.js";
import AcademicSession from "./models/AcademicSession.js";
import { generateTimetable, generateBestTimetable } from "./services/generator.js";
import ExcelJS from "exceljs";
import multer from "multer";
import authRoutes from "./routes/auth.js";
import User from "./models/User.js";
import notificationRoutes from "./routes/notifications.js";
import auditRoutes from "./routes/audit.js";
import AuditLog from "./models/AuditLog.js";
import Notification from "./models/Notification.js";
import { requireAuth, allowRoles } from "./middleware/auth.js";
import optimizationRoutes from "./routes/optimization.js";
import ShareLink from "./models/ShareLink.js";
import crypto from "crypto";
import QRCode from "qrcode";
import sessionPlanRoutes from "./routes/sessionPlan.js";
import studentRoutes from "./routes/students.js";
import attendanceRoutes from "./routes/attendance.js";
import Student from "./models/Student.js";
import AttendanceSession from "./models/AttendanceSession.js";
import feeRoutes from "./routes/fees.js";
import studentPromotionRoutes from "./routes/studentPromotion.js";
import studentProfileRoutes from "./routes/studentProfile.js";
import FeeHead from "./models/FeeHead.js";
import FeeInvoice from "./models/FeeInvoice.js";
import FeePayment from "./models/FeePayment.js";

const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = String(process.env.CLIENT_URL || "http://localhost:5173")
  .split(",").map(v => v.trim()).filter(Boolean);

if (String(process.env.TRUST_PROXY || "false").toLowerCase() === "true") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error("CORS origin not allowed."); error.status = 403; return callback(error);
  },
  credentials: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));


app.use("/api/auth", authRoutes);
app.use("/api/session-plans", requireAuth, sessionPlanRoutes);

// Phase 25: public read-only timetable sharing. These endpoints intentionally
// sit before requireAuth so a share token never exposes the administration UI.
app.get("/api/public/share/:token", async (req, res) => {
  try {
    const link = await ShareLink.findOne({ token: req.params.token, active: true })
      .populate("timetable")
      .populate("section", "name program semester")
      .populate("faculty", "name code")
      .populate("academicSession", "name")
      .lean();
    if (!link) return res.status(404).json({ message: "Share link not found or disabled." });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(410).json({ message: "This share link has expired." });
    if (!link.timetable) return res.status(404).json({ message: "Shared timetable is no longer available." });
    if (!["PUBLISHED", "LOCKED"].includes(link.timetable.status)) return res.status(403).json({ message: "This timetable is not published for public viewing." });

    const populated = await Timetable.findById(link.timetable._id)
      .populate("entries.section entries.subject entries.faculty entries.room")
      .lean();
    if (!populated) return res.status(404).json({ message: "Shared timetable is no longer available." });

    let entries = populated.entries || [];
    if (link.scope === "SECTION") entries = entries.filter(e => String(e.section?._id || e.section) === String(link.section?._id));
    if (link.scope === "FACULTY") entries = entries.filter(e => String(e.faculty?._id || e.faculty) === String(link.faculty?._id));

    await ShareLink.updateOne({ _id: link._id }, { $inc: { accessCount: 1 }, $set: { lastAccessedAt: new Date() } });
    res.json({
      title: link.scope === "SECTION" ? `${link.section?.program || ""} · ${link.section?.semester || ""} · ${link.section?.name || "Section"}`.trim() : link.scope === "FACULTY" ? `${link.faculty?.name || "Faculty"} Timetable` : "College Timetable",
      scope: link.scope,
      session: link.academicSession ? { id: link.academicSession._id, name: link.academicSession.name } : null,
      timetable: { id: populated._id, version: populated.version, versionLabel: populated.versionLabel, status: populated.status, generatedAt: populated.generatedAt },
      expiresAt: link.expiresAt,
      entries
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});


function getPublicShareUrl(token, req) {
  const base = process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || "http://localhost:5173";
  return `${String(base).replace(/\/$/, "")}/share/${encodeURIComponent(token)}`;
}

// Phase 26: QR code for a public share link. This endpoint is intentionally public
// because the QR code itself only contains the already-public read-only share URL.
app.get("/api/public/share/:token/qr", async (req, res) => {
  try {
    const link = await ShareLink.findOne({ token: req.params.token, active: true }).lean();
    if (!link) return res.status(404).json({ message: "Share link not found or disabled." });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(410).json({ message: "This share link has expired." });
    const timetable = await Timetable.findById(link.timetable).select("status").lean();
    if (!timetable || !["PUBLISHED", "LOCKED"].includes(timetable.status)) return res.status(403).json({ message: "This timetable is not published for public viewing." });
    const png = await QRCode.toBuffer(getPublicShareUrl(link.token, req), { width: 520, margin: 2, errorCorrectionLevel: "M" });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/public/share/:token/qr-url", async (req, res) => {
  try {
    const link = await ShareLink.findOne({ token: req.params.token, active: true }).select("token expiresAt timetable").lean();
    if (!link) return res.status(404).json({ message: "Share link not found or disabled." });
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(410).json({ message: "This share link has expired." });
    const timetable = await Timetable.findById(link.timetable).select("status").lean();
    if (!timetable || !["PUBLISHED", "LOCKED"].includes(timetable.status)) return res.status(403).json({ message: "This timetable is not published for public viewing." });
    res.json({ url: getPublicShareUrl(link.token, req) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.use((req, res, next) => {
  if (req.path === "/api/health" || req.path === "/api/ready") return next();
  return requireAuth(req, res, next);
});

app.use("/api/students", studentRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/student-promotions", studentPromotionRoutes);
app.use("/api/student-profiles", studentProfileRoutes);

app.use("/api/notifications", notificationRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/timetable/optimization", allowRoles("ADMIN", "SCHEDULER"), optimizationRoutes);

// Phase 25: create and manage secure public read-only links.
app.get("/api/shareable-timetables", allowRoles("ADMIN", "SCHEDULER"), async (_req, res) => {
  try {
    const rows = await Timetable.find({ status: { $in: ["PUBLISHED", "LOCKED"] } })
      .sort({ createdAt: -1 }).limit(50)
      .populate("academicSession", "name")
      .lean();
    res.json(rows.map(t => ({ _id:t._id, version:t.version, versionLabel:t.versionLabel, status:t.status, createdAt:t.createdAt, academicSession:t.academicSession })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/share-links", allowRoles("ADMIN", "SCHEDULER"), async (_req, res) => {
  try {
    const rows = await ShareLink.find().sort({ createdAt: -1 })
      .populate("timetable", "version versionLabel status academicSession")
      .populate("section", "name program semester")
      .populate("faculty", "name code")
      .populate("academicSession", "name")
      .lean();
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/share-links", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const { timetableId, scope = "FULL", sectionId = null, facultyId = null, expiresIn = "7d" } = req.body || {};
    if (!timetableId) return res.status(400).json({ message: "Timetable is required." });
    if (!["FULL", "SECTION", "FACULTY"].includes(scope)) return res.status(400).json({ message: "Invalid sharing scope." });
    if (scope === "SECTION" && !sectionId) return res.status(400).json({ message: "Select a section for a section share." });
    if (scope === "FACULTY" && !facultyId) return res.status(400).json({ message: "Select a faculty member for a faculty share." });
    const timetable = await Timetable.findById(timetableId);
    if (!timetable) return res.status(404).json({ message: "Timetable not found." });
    if (!["PUBLISHED", "LOCKED"].includes(timetable.status)) return res.status(400).json({ message: "Only a PUBLISHED or LOCKED timetable can be shared publicly." });

    const expiryMap = { "1h": 3600000, "1d": 86400000, "7d": 604800000, "30d": 2592000000, "never": null };
    if (!(expiresIn in expiryMap)) return res.status(400).json({ message: "Invalid expiry option." });
    const expiresAt = expiryMap[expiresIn] ? new Date(Date.now() + expiryMap[expiresIn]) : null;
    const token = crypto.randomBytes(24).toString("base64url");
    const link = await ShareLink.create({ token, timetable: timetable._id, academicSession: timetable.academicSession || null, scope, section: scope === "SECTION" ? sectionId : null, faculty: scope === "FACULTY" ? facultyId : null, expiresAt, createdBy: req.user.id, createdByName: req.user.name || req.user.username || "" });
    await AuditLog.create({ action: "CREATE_SHARE_LINK", category: "SHARING", description: `Created ${scope.toLowerCase()} public timetable share link.`, user: req.user.id, username: req.user.username || "", role: req.user.role, targetType: "Timetable", targetId: timetable._id.toString(), metadata: { shareLinkId: link._id.toString(), scope, expiresAt } });
    res.status(201).json(link);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch("/api/share-links/:id/toggle", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const link = await ShareLink.findById(req.params.id);
    if (!link) return res.status(404).json({ message: "Share link not found." });
    link.active = !link.active;
    await link.save();
    await AuditLog.create({ action: link.active ? "ENABLE_SHARE_LINK" : "DISABLE_SHARE_LINK", category: "SHARING", description: `${link.active ? "Enabled" : "Disabled"} public timetable share link.`, user: req.user.id, username: req.user.username || "", role: req.user.role, targetType: "ShareLink", targetId: link._id.toString() });
    res.json(link);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete("/api/share-links/:id", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const link = await ShareLink.findByIdAndDelete(req.params.id);
    if (!link) return res.status(404).json({ message: "Share link not found." });
    await AuditLog.create({ action: "DELETE_SHARE_LINK", category: "SHARING", description: "Deleted public timetable share link.", user: req.user.id, username: req.user.username || "", role: req.user.role, targetType: "ShareLink", targetId: link._id.toString() });
    res.json({ message: "Share link deleted." });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Phase 29: personal timetable dashboard. Faculty users are scoped to their
// mapped faculty record; Viewer users are scoped to their mapped section. Admin/Scheduler
// can select either scope from the UI for operational review.
app.get("/api/personal-timetable", allowRoles("ADMIN", "SCHEDULER", "FACULTY", "VIEWER"), async (req, res) => {
  try {
    const requestedType = String(req.query.type || "AUTO").toUpperCase();
    let type = requestedType;
    if (req.user.role === "FACULTY") type = "FACULTY";
    else if (req.user.role === "VIEWER") type = "SECTION";
    if (!["FACULTY", "SECTION"].includes(type)) return res.status(400).json({ message: "Select Faculty or Section scope." });

    let targetId = String(req.query.id || "");
    if (req.user.role === "FACULTY") targetId = String(req.user.faculty || "");
    if (req.user.role === "VIEWER") targetId = String(req.user.section || "");
    if (!targetId) return res.status(400).json({ message: type === "FACULTY" ? "Your user account is not mapped to a faculty member." : "Your user account is not mapped to a section." });

    const [timetable, slots, activeSession] = await Promise.all([
      Timetable.findOne({ isCurrent: true }).sort({ createdAt: -1 }).populate("entries.section entries.subject entries.faculty entries.room").lean(),
      TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }).lean(),
      AcademicSession.findOne({ active: true }).sort({ startDate: -1 }).lean()
    ]);
    if (!timetable) return res.json({ type, target: null, session: activeSession, timetable: null, today: null, upcoming: null, rows: [], weekly: [], summary: { classes: 0, periods: 0, workingDays: 0 } });

    let target = null;
    if (type === "FACULTY") target = await Faculty.findById(targetId).lean();
    else target = await Section.findById(targetId).lean();
    if (!target) return res.status(404).json({ message: `${type === "FACULTY" ? "Faculty" : "Section"} record not found.` });

    const entries = (timetable.entries || []).filter(e => String(e[type === "FACULTY" ? "faculty" : "section"]?._id || e[type === "FACULTY" ? "faculty" : "section"]) === targetId);
    const rows = entries.map(e => ({
      id: e._id,
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      order: Number(e.order || 0),
      duration: Number(e.duration || 1),
      subject: e.subject?.name || "Subject",
      subjectCode: e.subject?.code || "",
      faculty: e.faculty?.name || "Faculty",
      section: e.section ? `${e.section.program || ""} · ${e.section.semester || ""} · ${e.section.name || "Section"}`.replace(/^ · | · $/g, "") : "Section",
      room: e.room?.name || "Room"
    })).sort((a,b) => days.indexOf(a.day)-days.indexOf(b.day) || a.order-b.order);
    const weekly = days.map(day => ({ day, rows: rows.filter(r => r.day === day), classes: rows.filter(r => r.day === day).length, periods: rows.filter(r => r.day === day).reduce((n,r)=>n+r.duration,0) }));
    const nowDay = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }).format(new Date());
    const todayRows = rows.filter(r => r.day === nowDay).sort((a,b)=>a.order-b.order);
    const timeParts = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }).formatToParts(new Date());
    const nowHour = Number(timeParts.find(x=>x.type === "hour")?.value || 0);
    const nowMinute = Number(timeParts.find(x=>x.type === "minute")?.value || 0);
    const nowMinutes = nowHour*60 + nowMinute;
    const toMinutes = t => { const m=String(t||"").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i); if(!m)return 9999; let h=Number(m[1]), min=Number(m[2]); const ap=(m[3]||"").toUpperCase(); if(ap==="PM"&&h<12)h+=12; if(ap==="AM"&&h===12)h=0; return h*60+min; };
    const upcoming = todayRows.find(r => toMinutes(r.endTime) >= nowMinutes) || null;
    res.json({
      type,
      target: type === "FACULTY" ? { id: target._id, name: target.name, code: target.code } : { id: target._id, name: target.name, program: target.program, semester: target.semester },
      session: activeSession ? { id: activeSession._id, name: activeSession.name } : null,
      timetable: { id: timetable._id, version: timetable.version, versionLabel: timetable.versionLabel, status: timetable.status, generatedAt: timetable.generatedAt },
      today: { day: nowDay, rows: todayRows },
      upcoming,
      rows,
      weekly,
      summary: { classes: entries.length, periods: rows.reduce((n,r)=>n+r.duration,0), workingDays: weekly.filter(d=>d.classes).length }
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// Phase 14: faculty-specific portal. A faculty account can only see its own
// timetable, workload, availability and scoped notifications.
app.get("/api/faculty-portal", allowRoles("ADMIN", "FACULTY"), async (req, res) => {
  try {
    let facultyId = req.user.faculty || req.query.facultyId;
    if (req.user.role === "FACULTY" && !req.user.faculty) {
      return res.status(400).json({ message: "Your user account is not mapped to a faculty member. Ask an administrator to map it." });
    }
    if (!facultyId) return res.status(400).json({ message: "Faculty mapping is required." });

    const faculty = await Faculty.findById(facultyId).lean();
    if (!faculty) return res.status(404).json({ message: "Faculty record not found." });

    const [timetable, slots, activeSession] = await Promise.all([
      Timetable.findOne({ isCurrent: true }).sort({ createdAt: -1 })
        .populate("entries.section entries.subject entries.faculty entries.room").lean(),
      TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }).lean(),
      AcademicSession.findOne({ active: true }).sort({ startDate: -1 }).lean()
    ]);

    const allEntries = timetable?.entries || [];
    const entries = allEntries.filter(e => String(e.faculty?._id || e.faculty) === String(faculty._id));
    const slotCountByDay = {};
    for (const day of ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]) {
      slotCountByDay[day] = slots.filter(s => String(s.day) === day).length;
    }

    const expanded = [];
    for (const e of entries) {
      const daySlots = slots.filter(s => String(s.day) === String(e.day)).sort((a,b) => Number(a.order)-Number(b.order));
      const startIndex = daySlots.findIndex(s => Number(s.order) === Number(e.order));
      const duration = Math.max(1, Number(e.duration || 1));
      const block = startIndex >= 0 ? daySlots.slice(startIndex, startIndex + duration) : [];
      (block.length ? block : [{ day:e.day, startTime:e.startTime, endTime:e.endTime, order:e.order }]).forEach(sl => expanded.push({ entry:e, slot:sl }));
    }

    const byDay = {};
    for (const day of ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]) byDay[day] = [];
    for (const x of expanded) (byDay[x.entry.day] ||= []).push(x);

    const weeklyPeriods = expanded.length;
    const scheduledClasses = entries.length;
    const workingDays = Object.values(byDay).filter(x => x.length).length;
    const configuredAvailableDays = Array.isArray(faculty.availableDays) && faculty.availableDays.length
      ? faculty.availableDays
      : Object.keys(slotCountByDay);
    const weeklyCapacity = configuredAvailableDays.reduce((n,d) => n + Number(slotCountByDay[d] || 0), 0);
    const utilization = weeklyCapacity ? Math.round((weeklyPeriods / weeklyCapacity) * 100) : 0;

    const daily = Object.entries(byDay).map(([day, items]) => ({
      day,
      classes: [...new Set(items.map(x => String(x.entry._id)))].length,
      periods: items.length,
      max: Number(faculty.maxClassesPerDay || 0)
    }));

    const unavailable = (faculty.unavailableSlots || []).map(x => `${String(x.day).toLowerCase()}|${x.startTime}-${x.endTime}`);
    const conflicts = [];
    for (let i=0; i<expanded.length; i++) for (let j=i+1; j<expanded.length; j++) {
      const a=expanded[i], b=expanded[j];
      if (String(a.entry.day).toLowerCase()===String(b.entry.day).toLowerCase() &&
          String(a.slot.startTime)===String(b.slot.startTime) && String(a.slot.endTime)===String(b.slot.endTime)) {
        conflicts.push({ type:"Faculty conflict", message:`${faculty.name} has overlapping classes at ${a.entry.day} ${a.slot.startTime}.`, entryId:a.entry._id });
      }
    }

    const notifications = [];
    if (!req.user.faculty && req.user.role === "ADMIN") notifications.push({type:"info",message:`Viewing ${faculty.name}'s faculty portal.`});
    if (!timetable) notifications.push({type:"warning",message:"No current timetable has been generated yet."});
    else if (!entries.length) notifications.push({type:"warning",message:"No classes are currently assigned to you in the current timetable."});
    if (faculty.maxClassesPerDay && daily.some(d => d.classes > faculty.maxClassesPerDay)) notifications.push({type:"warning",message:"Your assigned timetable exceeds the configured daily class limit on one or more days."});
    if (faculty.maxWorkingDays && workingDays > faculty.maxWorkingDays) notifications.push({type:"warning",message:"Your assigned timetable exceeds the configured maximum working days."});
    const unavailableHits = expanded.filter(x => unavailable.includes(`${String(x.entry.day).toLowerCase()}|${x.slot.startTime}-${x.slot.endTime}`));
    if (unavailableHits.length) notifications.push({type:"error",message:`${unavailableHits.length} scheduled period(s) fall in your configured unavailable slots.`});
    if (conflicts.length) notifications.push({type:"error",message:`${conflicts.length} faculty timetable conflict(s) were detected.`});
    if (timetable?.status === "SUBMITTED") notifications.push({type:"info",message:"The timetable has been submitted for review."});
    if (timetable?.status === "APPROVED") notifications.push({type:"success",message:"The timetable is approved and ready for publication."});
    if (timetable?.status === "PUBLISHED") notifications.push({type:"success",message:"The timetable is published."});
    if (timetable?.status === "LOCKED") notifications.push({type:"info",message:"The timetable is locked and cannot be edited."});

    const timetableRows = entries.sort((a,b) => {
      const da = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(a.day);
      const db = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(b.day);
      return da-db || Number(a.order||0)-Number(b.order||0);
    }).map(e => ({
      id:e._id, day:e.day, startTime:e.startTime, endTime:e.endTime, order:e.order, duration:e.duration || 1,
      subject:e.subject?.name || "Subject", subjectCode:e.subject?.code || "", section:e.section?.name || "Section",
      program:e.section?.program || "", semester:e.section?.semester || "", room:e.room?.name || "Room"
    }));

    res.json({
      faculty:{id:faculty._id,name:faculty.name,code:faculty.code,maxWorkingDays:faculty.maxWorkingDays,maxClassesPerDay:faculty.maxClassesPerDay,availableDays:configuredAvailableDays,unavailableSlots:faculty.unavailableSlots||[]},
      session:activeSession ? {id:activeSession._id,name:activeSession.name} : null,
      timetable:{id:timetable?._id || null,status:timetable?.status || "DRAFT",generatedAt:timetable?.generatedAt || null,version:timetable?.version || null,versionLabel:timetable?.versionLabel || ""},
      summary:{scheduledClasses,weeklyPeriods,workingDays,weeklyCapacity,utilization},
      daily,
      timetableRows,
      availability:{availableDays:configuredAvailableDays,unavailableSlots:faculty.unavailableSlots||[]},
      conflicts,
      notifications
    });
  } catch (e) {
    console.error("GET /api/faculty-portal failed:", e);
    res.status(500).json({ message: e.message });
  }
});


// Phase 15: section/student portal. Any authenticated non-administrative user can
// view a selected section timetable, while management actions remain role-protected.
app.get("/api/section-portal/sections", async (_req, res) => {
  try {
    const sections = await Section.find().sort({ program: 1, semester: 1, name: 1 }).lean();
    res.json(sections.map(s => ({ id: s._id, name: s.name, program: s.program, semester: s.semester, maxClassesPerDay: s.maxClassesPerDay })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get("/api/section-portal", async (req, res) => {
  try {
    const sectionId = req.query.sectionId;
    if (!sectionId) return res.status(400).json({ message: "Select a section to view its timetable." });
    const section = await Section.findById(sectionId).lean();
    if (!section) return res.status(404).json({ message: "Section not found." });
    const [timetable, slots, activeSession] = await Promise.all([
      Timetable.findOne({ isCurrent: true }).sort({ createdAt: -1 }).populate("entries.section entries.subject entries.faculty entries.room").lean(),
      TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }).lean(),
      AcademicSession.findOne({ active: true }).sort({ startDate: -1 }).lean()
    ]);
    const allEntries = timetable?.entries || [];
    const entries = allEntries.filter(e => String(e.section?._id || e.section) === String(section._id));
    const rows = entries.sort((a,b) => {
      const da = days.indexOf(a.day), db = days.indexOf(b.day);
      return da-db || Number(a.order||0)-Number(b.order||0);
    }).map(e => ({
      id:e._id, day:e.day, startTime:e.startTime, endTime:e.endTime, order:e.order, duration:e.duration||1,
      subject:e.subject?.name||"Subject", subjectCode:e.subject?.code||"", faculty:e.faculty?.name||"Faculty", room:e.room?.name||"Room"
    }));
    const byDay = Object.fromEntries(days.map(d => [d, []]));
    rows.forEach(r => { (byDay[r.day] ||= []).push(r); });
    const scheduledClasses = rows.length;
    const weeklyPeriods = rows.reduce((n,r) => n + Math.max(1, Number(r.duration||1)), 0);
    const workingDays = days.filter(d => byDay[d].length).length;
    const daily = days.map(day => ({ day, classes: byDay[day].length, periods: byDay[day].reduce((n,r)=>n+Math.max(1,Number(r.duration||1)),0), max:Number(section.maxClassesPerDay||0) }));
    const conflicts = [];
    for (const day of days) {
      const dayRows = rows.filter(r => r.day === day);
      for (let i=0;i<dayRows.length;i++) for (let j=i+1;j<dayRows.length;j++) {
        const a=dayRows[i], b=dayRows[j];
        const aEnd = Number(a.order||0)+Math.max(1,Number(a.duration||1));
        const bEnd = Number(b.order||0)+Math.max(1,Number(b.duration||1));
        if (Number(a.order||0) < bEnd && Number(b.order||0) < aEnd) conflicts.push({type:"Section conflict",message:`${section.name} has overlapping classes on ${day}.`,entryId:a.id});
      }
    }
    const notifications=[];
    if (!timetable) notifications.push({type:"warning",message:"No current timetable has been generated yet."});
    else if (!rows.length) notifications.push({type:"warning",message:`No classes are currently scheduled for ${section.name}.`});
    if (section.maxClassesPerDay && daily.some(d=>d.classes>section.maxClassesPerDay)) notifications.push({type:"warning",message:"The section exceeds its configured daily class limit on one or more days."});
    if (conflicts.length) notifications.push({type:"error",message:`${conflicts.length} section timetable conflict(s) were detected.`});
    if (timetable?.status === "SUBMITTED") notifications.push({type:"info",message:"The timetable has been submitted for review."});
    if (timetable?.status === "APPROVED") notifications.push({type:"success",message:"The timetable is approved and ready for publication."});
    if (timetable?.status === "PUBLISHED") notifications.push({type:"success",message:"The timetable is published."});
    if (timetable?.status === "LOCKED") notifications.push({type:"info",message:"The timetable is locked."});
    res.json({
      section:{id:section._id,name:section.name,program:section.program,semester:section.semester,maxClassesPerDay:section.maxClassesPerDay},
      session:activeSession?{id:activeSession._id,name:activeSession.name}:null,
      timetable:{id:timetable?._id||null,status:timetable?.status||"DRAFT",generatedAt:timetable?.generatedAt||null,version:timetable?.version||null,versionLabel:timetable?.versionLabel||""},
      summary:{scheduledClasses,weeklyPeriods,workingDays}, daily, timetableRows:rows, conflicts, notifications
    });
  } catch (e) {
    console.error("GET /api/section-portal failed:", e);
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/settings", async (_req, res) => {
  const defaults = {
    key: "default",
    maxConsecutiveFaculty: 2,
    maxConsecutiveSection: 3,
    avoidSameSubjectSameDay: true,
    distributeSubjectAcrossDays: true,
    avoidFirstLastPeriod: false,
    generationRuns: 8,
    generationTimeLimitMs: 30000
  };
  try {
    const settings = await SchedulerSetting.findOne({ key: "default" }).lean();
    return res.json(settings || defaults);
  } catch (e) {
    console.error("GET /api/settings failed:", e.message);
    return res.json({ ...defaults, warning: "Scheduler settings could not be loaded; defaults are being used." });
  }
});

app.put("/api/settings", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const body = {
      maxConsecutiveFaculty: Number(req.body.maxConsecutiveFaculty || 2),
      maxConsecutiveSection: Number(req.body.maxConsecutiveSection || 3),
      avoidSameSubjectSameDay: Boolean(req.body.avoidSameSubjectSameDay),
      distributeSubjectAcrossDays: Boolean(req.body.distributeSubjectAcrossDays),
      avoidFirstLastPeriod: Boolean(req.body.avoidFirstLastPeriod),
      generationRuns: Math.max(1, Math.min(20, Number(req.body.generationRuns || 8))),
      generationTimeLimitMs: Math.max(5000, Math.min(60000, Number(req.body.generationTimeLimitMs || 30000)))
    };

    const settings = await SchedulerSetting.findOneAndUpdate(
      { key: "default" },
      { ...body, key: "default" },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json(settings);
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});


const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
app.get("/api/health", (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(database === "connected" ? 200 : 503).json({
    ok: database === "connected",
    service: "timetable-generator-api",
    environment: process.env.NODE_ENV || "development",
    database,
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get("/api/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ready });
});

async function writeAudit(req,{action,category="SYSTEM",description,targetType="",targetId="",metadata={}}){
  try{await AuditLog.create({action,category,description,user:req.user?.id||null,username:req.user?.username||"",role:req.user?.role||"",targetType,targetId:String(targetId||""),metadata,ipAddress:req.ip||""});}
  catch(e){console.error("Audit log failed:",e.message);}
}

async function createTimetableChangeNotifications({title,message,priority="IMPORTANT",facultyIds=[],sectionIds=[],metadata={}}){
  try {
    const jobs=[];
    for(const facultyId of [...new Set(facultyIds.filter(Boolean).map(String))]){
      jobs.push(Notification.create({title,message,priority,audience:"FACULTY",faculty:facultyId,published:true,startAt:new Date(),createdBy:null,sourceType:"TIMETABLE",sourceId:String(metadata.timetableId||""),eventKey:String(metadata.event||"")}));
    }
    for(const sectionId of [...new Set(sectionIds.filter(Boolean).map(String))]){
      jobs.push(Notification.create({title,message,priority,audience:"SECTION",section:sectionId,published:true,startAt:new Date(),createdBy:null,sourceType:"TIMETABLE",sourceId:String(metadata.timetableId||""),eventKey:String(metadata.event||"")}));
    }
    if(jobs.length) await Promise.all(jobs);
  } catch(e) {
    console.error("Timetable notification failed:", e.message);
  }
}

async function notifyEntries(timetable,{title,message,priority="IMPORTANT",metadata={}}={}){
  const facultyIds=(timetable?.entries||[]).map(e=>e.faculty);
  const sectionIds=(timetable?.entries||[]).map(e=>e.section);
  await createTimetableChangeNotifications({title,message,priority,facultyIds,sectionIds,metadata});
}

function crud(path, Model) {
  app.get(`/api/${path}`, async (_req,res) => res.json(await Model.find().sort({ createdAt: -1 })));
  app.post(`/api/${path}`, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try { const created=await Model.create(req.body); await writeAudit(req,{action:"CREATE",category:path.toUpperCase(),description:`Created ${path} record`,targetType:path,targetId:created._id,metadata:{name:created.name||created.code||""}}); res.status(201).json(created); }
    catch(e) { res.status(400).json({message:e.message}); }
  });
  app.put(`/api/${path}/:id`, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
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
      await writeAudit(req,{action:"UPDATE",category:path.toUpperCase(),description:`Updated ${path} record`,targetType:path,targetId:updated._id,metadata:{changes:Object.keys(body)}});
      res.json(updated);
    } catch(e) {
      res.status(400).json({message:e.message});
    }
  });
  app.delete(`/api/${path}/:id`, allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
    try { const deleted=await Model.findByIdAndDelete(req.params.id); if(!deleted) return res.status(404).json({message:"Record not found"}); await writeAudit(req,{action:"DELETE",category:path.toUpperCase(),description:`Deleted ${path} record`,targetType:path,targetId:req.params.id,metadata:{name:deleted.name||deleted.code||""}}); res.json({ok:true}); }
    catch(e) { res.status(400).json({message:e.message}); }
  });
}
crud("faculty", Faculty);
crud("subjects", Subject);
crud("sections", Section);
crud("rooms", Room);
crud("timeslots", TimeSlot);
crud("sessions", AcademicSession);
crud("programs", Program);



function excelText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value.text) return String(value.text).trim();
  return String(value).trim();
}

function excelBool(value) {
  const v = excelText(value).toLowerCase();
  return ["yes", "y", "true", "1", "available", "✓"].includes(v);
}

function normDayServer(v) {
  const x=String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  return ({mon:"monday",monday:"monday",tue:"tuesday",tues:"tuesday",tuesday:"tuesday",wed:"wednesday",wednesday:"wednesday",thu:"thursday",thur:"thursday",thurs:"thursday",thursday:"thursday",fri:"friday",friday:"friday"}[x]||x);
}
function normRoomTypeServer(v) {
  const x=String(v??"").trim().toLowerCase().replace(/\s+/g," ");
  if(x==="any"||x==="all") return "any";
  if(["lab","laboratory","computer lab"].includes(x)) return "lab";
  if(["classroom","class room","class"].includes(x)) return "classroom";
  return x;
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

app.get("/api/import/template", async (_req, res) => {
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
        ["","Monday","09:00","10:00",1,"No"],
        ["","Monday","10:00","11:00",2,"No"]
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

app.post("/api/import/excel", allowRoles("ADMIN", "SCHEDULER"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please select an Excel file." });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);

    const required = ["Programs","Faculty","Sections","Rooms","TimeSlots","Subjects"];
    const missing = required.filter(name => !wb.getWorksheet(name));
    if (missing.length) {
      return res.status(400).json({ message: `Missing sheets: ${missing.join(", ")}` });
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
        { upsert: true, new: true, setDefaultsOnInsert: true }
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
        { upsert: true, new: true, setDefaultsOnInsert: true }
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
        { program: r.Program, semester: r.Semester, name: r.Section },
        {
          program: programName,
          semester: r.Semester,
          name: r.Section,
          maxClassesPerDay: Number(r.MaxClassesPerDay || 5)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      sectionMap.set(`${r.Program}|${r.Semester}|${r.Section}`.toLowerCase(), doc);
    }

    for (const r of roomRows) {
      if (!r.Name) continue;
      await Room.findOneAndUpdate(
        { name: r.Name },
        { name: r.Name, type: (normRoomTypeServer(r.Type || "Classroom") === "lab" ? "Lab" : "Classroom"), capacity: Number(r.Capacity || 60) },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    for (const r of slotRows) {
      if (!r.Day || !r.StartTime || !r.EndTime) continue;
      const programText = firstValue(r, ["Program","Programme","Program Code","Program Name"]);
      const programDoc = programText ? programMap.get(norm(programText)) : null;
      if (programText && !programDoc) {
        console.warn(`TimeSlot program not found: ${programText}. The slot will be imported as global.`);
      }
      await TimeSlot.findOneAndUpdate(
        {
          program: programDoc?._id || null,
          day: r.Day,
          startTime: r.StartTime,
          endTime: r.EndTime
        },
        {
          program: programDoc?._id || null,
          day: r.Day,
          startTime: r.StartTime,
          endTime: r.EndTime,
          order: Number(r.Order || 1),
          isBreak: excelBool(r.IsBreak)
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    let subjectsImported = 0;
    const skippedSubjects = [];

    // Build additional lookup maps so imports work with either names or codes.
    const facultyLookup = new Map();
    for (const [k,v] of facultyMap) facultyLookup.set(norm(k),v);
    for (const f of await Faculty.find()) {
      if (f.name) facultyLookup.set(norm(f.name),f);
      if (f.code) facultyLookup.set(norm(f.code),f);
    }

    const sectionLookup = new Map();
    for (const [k,v] of sectionMap) sectionLookup.set(norm(k),v);
    for (const s of await Section.find()) {
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
        { name, section: sectionDoc._id },
        {
          name,
          code,
          faculty: facultyDoc._id,
          section: sectionDoc._id,
          classesPerWeek: Number(classesPerWeek || 1),
          duration: Math.min(3,Math.max(1,Number(duration || 1))),
          roomType: normRoomTypeServer(roomType)==="lab" ? "Lab" : (normRoomTypeServer(roomType)==="any" ? "Any" : "Classroom")
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
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
      });
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
    res.status(500).json({ message: `Excel import failed: ${e.message}` });
  }
});

app.post("/api/seed", allowRoles("ADMIN"), async (_req,res) => {
  try {
    await Promise.all([
      Program.deleteMany({}),
      Faculty.deleteMany({}),
      Subject.deleteMany({}),
      Section.deleteMany({}),
      Room.deleteMany({}),
      TimeSlot.deleteMany({}),
      Timetable.deleteMany({}),
      Student.deleteMany({}),
      AttendanceSession.deleteMany({}),
      FeeInvoice.deleteMany({}),
      FeePayment.deleteMany({}),
      FeeHead.deleteMany({})
    ]);

    await SchedulerSetting.findOneAndUpdate(
      { key: "default" },
      {
        key: "default",
        maxConsecutiveFaculty: 2,
        maxConsecutiveSection: 3,
        avoidSameSubjectSameDay: true,
        distributeSubjectAcrossDays: true,
        avoidFirstLastPeriod: false
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
    const slots = [
      ["10:30","11:30",1],["11:45","12:45",2],["13:30","14:30",3],["14:45","15:45",4]
    ];
    const ts = await TimeSlot.insertMany(days.flatMap(day => slots.map(([startTime,endTime,order]) => ({day,startTime,endTime,order,isBreak:false}))));
    const rooms = await Room.insertMany([
      {name:"Room 101",type:"Classroom",capacity:60},
      {name:"Room 102",type:"Classroom",capacity:60},
      {name:"Lab 1",type:"Lab",capacity:40}
    ]);
    const faculty = await Faculty.insertMany([
      {name:"Dr. Amit Sharma",code:"F001",maxWorkingDays:3,maxClassesPerDay:3,availableDays:["Monday","Tuesday","Wednesday","Saturday"]},
      {name:"Ms. Priya Verma",code:"F002",maxWorkingDays:4,maxClassesPerDay:3,availableDays:["Monday","Tuesday","Thursday","Friday"]},
      {name:"Mr. Rahul Singh",code:"F003",maxWorkingDays:5,maxClassesPerDay:4,availableDays:days}
    ]);
    const [bbaProgram] = await Program.insertMany([
      {name:"Bachelor of Business Administration",code:"BBA",department:"Management",durationYears:4,active:true}
    ]);
    // Demo periods are explicitly mapped to BBA. Additional programs can have
    // their own periods in Master Data > Time Slots.
    await TimeSlot.updateMany({}, { $set: { program: bbaProgram._id } });

    const sections = await Section.insertMany([
      {program:"BBA",semester:"III",name:"CB (Gr A)",maxClassesPerDay:5},
      {program:"BBA",semester:"III",name:"CB (Gr B)",maxClassesPerDay:5}
    ]);
    const subjects = await Subject.insertMany([
      {name:"Marketing Management",code:"MKT",faculty:faculty[0]._id,section:sections[0]._id,classesPerWeek:3,duration:1,roomType:"Classroom"},
      {name:"Financial Management",code:"FIN",faculty:faculty[1]._id,section:sections[0]._id,classesPerWeek:3,duration:1,roomType:"Classroom"},
      {name:"Human Resource Management",code:"HRM",faculty:faculty[2]._id,section:sections[0]._id,classesPerWeek:2,duration:1,roomType:"Classroom"},
      {name:"Business Analytics",code:"BA",faculty:faculty[2]._id,section:sections[1]._id,classesPerWeek:3,duration:1,roomType:"Lab"},
      {name:"Economics",code:"ECO",faculty:faculty[1]._id,section:sections[1]._id,classesPerWeek:3,duration:1,roomType:"Classroom"}
    ]);
    const students = [];
    for (let i=1;i<=20;i++) students.push({ admissionNo:`BBA26${String(i).padStart(3,"0")}`, rollNo:String(i).padStart(2,"0"), name:`Demo Student ${i}`, section:i<=10?sections[0]._id:sections[1]._id, active:true });
    await Student.insertMany(students);
    await FeeHead.insertMany([
      {name:"Tuition Fee",code:"TUITION",program:"BBA",semester:"III",amount:45000,frequency:"SEMESTER",description:"Semester tuition fee"},
      {name:"Examination Fee",code:"EXAM",program:"BBA",semester:"III",amount:2500,frequency:"SEMESTER",description:"Semester examination fee"},
      {name:"Library Fee",code:"LIB",program:"BBA",semester:"III",amount:1000,frequency:"SEMESTER",description:"Library and digital resources"}
    ]);
    res.json({ok:true, counts:{programs:1,faculty:faculty.length,subjects:subjects.length,sections:sections.length,rooms:rooms.length,timeslots:ts.length,students:students.length,feeHeads:3}});
  } catch(e) { res.status(500).json({message:e.message}); }
});

app.get("/api/timetable/diagnostics", async (_req, res) => {
  try {
    const [faculty, subjects, sections, rooms, slots] = await Promise.all([
      Faculty.find().lean(),
      Subject.find().lean(),
      Section.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({ day: 1, order: 1 }).lean()
    ]);

    const usableSlots = slots.filter(s => !s.isBreak);
    const facultyMap = new Map(faculty.map(f => [String(f._id), f]));
    const sectionMap = new Map(sections.map(s => [String(s._id), s]));

    const days = [...new Set(usableSlots.map(s => s.day))];
    const normalizeDays = f => {
      const configured = Array.isArray(f?.availableDays) ? f.availableDays.filter(Boolean) : [];
      return configured.length ? configured : days;
    };

    const diagnostics = subjects.map(s => {
      const f = facultyMap.get(String(s.faculty));
      const sec = sectionMap.get(String(s.section));
      const matchingRooms = rooms.filter(r => normRoomTypeServer(s.roomType || "Classroom") === "any" || normRoomTypeServer(r.type || "Classroom") === normRoomTypeServer(s.roomType || "Classroom"));
      const allowedDays = normalizeDays(f);
      const duration = Math.max(1, Number(s.duration || 1));

      let blocks = 0;
      for (const day of days) {
        const ds = usableSlots.filter(x => x.day === day).sort((a,b) => Number(a.order)-Number(b.order));
        for (let i = 0; i <= ds.length - duration; i++) {
          const block = ds.slice(i, i + duration);
          if (block.length !== duration) continue;
          let ok = true;
          for (let j=1;j<block.length;j++) if (Number(block[j].order) !== Number(block[j-1].order)+1) ok=false;
          if (ok && allowedDays.map(String).map(x=>x.toLowerCase()).includes(String(day).toLowerCase())) blocks++;
        }
      }

      return {
        subject: s.name,
        classesPerWeek: Number(s.classesPerWeek || 0),
        duration,
        faculty: f?.name || "MISSING",
        facultyAvailableDays: allowedDays,
        facultyMaxWorkingDays: f?.maxWorkingDays ?? null,
        facultyMaxClassesPerDay: f?.maxClassesPerDay ?? null,
        section: sec?.name || "MISSING",
        sectionMaxClassesPerDay: sec?.maxClassesPerDay ?? null,
        roomType: s.roomType,
        matchingRooms: matchingRooms.map(r => `${r.name} (${r.type})`),
        consecutiveBlocks: blocks,
        roughWeeklyRoomCapacity: blocks * matchingRooms.length
      };
    });

    res.json({
      counts: {
        faculty: faculty.length,
        sections: sections.length,
        subjects: subjects.length,
        rooms: rooms.length,
        usableSlots: usableSlots.length,
        days: days.length,
        requestedSessions: subjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0)
      },
      rooms: rooms.map(r => ({ name:r.name, type:r.type })),
      faculty: faculty.map(f => ({ name:f.name, maxWorkingDays:f.maxWorkingDays, maxClassesPerDay:f.maxClassesPerDay, availableDays:f.availableDays, unavailableSlots:f.unavailableSlots?.length || 0 })),
      sections: sections.map(s => ({ name:s.name, maxClassesPerDay:s.maxClassesPerDay })),
      subjects: diagnostics,
      impossible: diagnostics.filter(x => !x.faculty || x.faculty === "MISSING" || x.section === "MISSING" || !x.matchingRooms.length || !x.consecutiveBlocks)
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/timetable/validation", async (_req,res) => {
  try {
    const [timetable, faculty, subjects, sections, rooms, slots] = await Promise.all([
      Timetable.findOne({isCurrent:true}).sort({createdAt:-1}).lean(),
      Faculty.find().lean(), Subject.find().lean(), Section.find().lean(), Room.find().lean(),
      TimeSlot.find({isBreak:{$ne:true}}).sort({day:1,order:1}).lean()
    ]);
    if (!timetable) return res.json({hasTimetable:false, summary:{errors:0,warnings:0,info:0}, issues:[]});
    const entries=timetable.entries||[];
    const issues=[];
    const add=(severity,category,message,entryId=null)=>issues.push({severity,category,message,entryId});
    const fMap=new Map(faculty.map(x=>[String(x._id),x]));
    const sMap=new Map(sections.map(x=>[String(x._id),x]));
    const subjMap=new Map(subjects.map(x=>[String(x._id),x]));
    const rMap=new Map(rooms.map(x=>[String(x._id),x]));
    const slotMap=new Map(slots.map(x=>[`${String(x.day).toLowerCase()}|${x.startTime}-${x.endTime}`,x]));
    const keyParts=e=>{
      const ds=slots.filter(x=>String(x.day).toLowerCase()===String(e.day).toLowerCase()).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
      const idx=ds.findIndex(x=>Number(x.order)===Number(e.order));
      return idx<0?[]:ds.slice(idx,idx+Math.max(1,Number(e.duration||1)));
    };
    const expanded=[];
    for(const e of entries){
      const f=fMap.get(String(e.faculty)), sec=sMap.get(String(e.section)), sub=subjMap.get(String(e.subject)), room=rMap.get(String(e.room));
      if(!f) add("error","Reference",`Faculty reference is missing or invalid for ${sub?.name||"this class"}.`,e._id);
      if(!sec) add("error","Reference",`Section reference is missing or invalid for ${sub?.name||"this class"}.`,e._id);
      if(!sub) add("error","Reference","Subject reference is missing or invalid.",e._id);
      if(!room) add("error","Reference","Room reference is missing or invalid.",e._id);
      const block=keyParts(e);
      if(block.length<Math.max(1,Number(e.duration||1))) add("error","Time Slot",`${sub?.name||"Class"} does not have enough configured consecutive periods at ${e.day} ${e.startTime}.`,e._id);
      for(const sl of block) expanded.push({e,sl,f,sec,sub,room});
      if(f){
        const allowed=(f.availableDays||[]).map(x=>String(x).toLowerCase());
        if(allowed.length && !allowed.includes(String(e.day).toLowerCase())) add("error","Faculty Availability",`${f.name||"Faculty"} is not available on ${e.day}.`,e._id);
        const unavailable=(f.unavailableSlots||[]).map(x=>`${String(x.day).toLowerCase()}|${x.startTime}-${x.endTime}`);
        if(block.some(sl=>unavailable.includes(`${String(sl.day).toLowerCase()}|${sl.startTime}-${sl.endTime}`))) add("error","Faculty Availability",`${f.name||"Faculty"} is unavailable during ${e.day} ${e.startTime}.`,e._id);
      }
      if(sub && room && sub.roomType && sub.roomType!=="Any" && String(sub.roomType).toLowerCase()!==String(room.type).toLowerCase()) add("error","Room Type",`${sub.name} requires ${sub.roomType}, but ${room.name} is ${room.type}.`,e._id);
    }
    // Detect simultaneous faculty/section/room overlaps.
    for(let i=0;i<expanded.length;i++) for(let j=i+1;j<expanded.length;j++){
      const a=expanded[i],b=expanded[j]; if(a.sl.day!==b.sl.day||a.sl.startTime!==b.sl.startTime||a.sl.endTime!==b.sl.endTime) continue;
      if(a.f&&b.f&&String(a.f._id)===String(b.f._id)) add("error","Faculty Conflict",`${a.f.name} is double-booked at ${a.sl.day} ${a.sl.startTime}.`,a.e._id);
      if(a.sec&&b.sec&&String(a.sec._id)===String(b.sec._id)) add("error","Section Conflict",`${a.sec.name} is double-booked at ${a.sl.day} ${a.sl.startTime}.`,a.e._id);
      if(a.room&&b.room&&String(a.room._id)===String(b.room._id)) add("error","Room Conflict",`${a.room.name} is double-booked at ${a.sl.day} ${a.sl.startTime}.`,a.e._id);
    }
    // Daily limits.
    for(const f of faculty){
      for(const day of ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]){
        const n=entries.filter(e=>String(e.faculty)===String(f._id)&&String(e.day).toLowerCase()===day.toLowerCase()).length;
        if(n>Number(f.maxClassesPerDay||999)) add("warning","Faculty Limit",`${f.name} has ${n} classes on ${day}; limit is ${f.maxClassesPerDay}.`);
      }
      const d=new Set(entries.filter(e=>String(e.faculty)===String(f._id)).map(e=>String(e.day).toLowerCase()));
      if(d.size>Number(f.maxWorkingDays||999)) add("warning","Faculty Limit",`${f.name} works ${d.size} days; limit is ${f.maxWorkingDays}.`);
    }
    for(const sec of sections){
      for(const day of ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]){
        const n=entries.filter(e=>String(e.section)===String(sec._id)&&String(e.day).toLowerCase()===day.toLowerCase()).length;
        if(n>Number(sec.maxClassesPerDay||999)) add("warning","Section Limit",`${sec.name} has ${n} classes on ${day}; limit is ${sec.maxClassesPerDay}.`);
      }
    }
    // Required-session coverage.
    const scheduledBySubject=new Map(); entries.forEach(e=>scheduledBySubject.set(String(e.subject),(scheduledBySubject.get(String(e.subject))||0)+1));
    for(const sub of subjects){const required=Number(sub.classesPerWeek||0),actual=scheduledBySubject.get(String(sub._id))||0;if(actual<required)add("warning","Coverage",`${sub.name}: ${actual}/${required} weekly classes scheduled.`);}
    const errors=issues.filter(x=>x.severity==='error').length, warnings=issues.filter(x=>x.severity==='warning').length;
    res.json({hasTimetable:true,status:timetable.status,generatedAt:timetable.generatedAt,summary:{errors,warnings,info:0,total:issues.length,entries:entries.length},issues:issues.slice(0,300)});
  } catch(e){ console.error("GET /api/timetable/validation failed:",e); res.status(500).json({message:e.message}); }
});

app.get("/api/analytics", async (_req,res) => {
  try {
    const [timetable, subjects, faculty, sections, rooms, slots] = await Promise.all([
      Timetable.findOne({isCurrent:true}).sort({createdAt:-1}).lean(),
      Subject.find().lean(), Faculty.find().lean(), Section.find().lean(), Room.find().lean(), TimeSlot.find({isBreak:{$ne:true}}).lean()
    ]);
    if (!timetable) return res.json({hasTimetable:false});
    const entries=timetable.entries||[];
    const requiredSessions=subjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0);
    const scheduledSessions=entries.length;
    const periods=entries.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    const sectionMap=new Map(sections.map(x=>[String(x._id),x]));
    const facultyMap=new Map(faculty.map(x=>[String(x._id),x]));
    const roomMap=new Map(rooms.map(x=>[String(x._id),x]));
    const facultyRows=faculty.map(f=>{const id=String(f._id);const es=entries.filter(e=>String(e.faculty)===id);const p=es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);const days=new Set(es.map(e=>e.day));const cap=Math.max(1,Number(f.maxWorkingDays||5)*Number(f.maxClassesPerDay||1));return {id,name:f.name||f.code||id,classes:es.length,periods:p,days:days.size,utilization:Math.round(Math.min(100,p/cap*100))}}).sort((a,b)=>b.periods-a.periods);
    const totalSlots=Math.max(1,slots.length);
    const roomRows=rooms.map(r=>{const id=String(r._id);const es=entries.filter(e=>String(e.room)===id);const p=es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);return {id,name:r.name,type:r.type,classes:es.length,periods:p,utilization:Math.round(Math.min(100,p/totalSlots*100))}}).sort((a,b)=>b.utilization-a.utilization);
    const sectionRows=sections.map(sec=>{const id=String(sec._id);const es=entries.filter(e=>String(e.section)===id);const p=es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);const required=subjects.filter(s=>String(s.section)===id).reduce((n,s)=>n+Number(s.classesPerWeek||0),0);return {id,label:`${sec.program||""} ${sec.semester||""} - ${sec.name||""}`.trim(),classes:es.length,periods:p,coverage:Math.round(required?Math.min(100,es.length/required*100):0)}}).sort((a,b)=>b.periods-a.periods);
    const daily=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(day=>({day,periods:entries.filter(e=>String(e.day).toLowerCase()===day.toLowerCase()).reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0)}));
    const dailyMax=Math.max(1,...daily.map(x=>x.periods));
    const coverage=requiredSessions?Math.round(Math.min(100,scheduledSessions/requiredSessions*100)):100;
    res.json({hasTimetable:true,status:timetable.status,generatedAt:timetable.generatedAt,summary:{requiredSessions,scheduledSessions,coverage,unscheduledSessions:Math.max(0,requiredSessions-scheduledSessions),periods},faculty:facultyRows,rooms:roomRows,sections:sectionRows,daily,dailyMax,warnings:timetable.warnings||[]});
  } catch(e){ console.error("GET /api/analytics failed:",e); res.status(500).json({message:e.message}); }
});


// Phase 17: Advanced reporting and export center.
async function buildReportData() {
  const [timetable, subjects, faculty, sections, rooms, slots, activeSession] = await Promise.all([
    Timetable.findOne({ isCurrent: true }).sort({ createdAt: -1 }).lean(),
    Subject.find().lean(), Faculty.find().lean(), Section.find().lean(), Room.find().lean(),
    TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }).lean(),
    AcademicSession.findOne({ active: true }).sort({ startDate: -1 }).lean()
  ]);
  const entries = timetable?.entries || [];
  const required = subjects.reduce((n, s) => n + Number(s.classesPerWeek || 0), 0);
  const scheduled = entries.length;
  const periods = entries.reduce((n, e) => n + Math.max(1, Number(e.duration || 1)), 0);
  const daysList = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const fMap = new Map(faculty.map(x => [String(x._id), x]));
  const secMap = new Map(sections.map(x => [String(x._id), x]));
  const subMap = new Map(subjects.map(x => [String(x._id), x]));
  const roomMap = new Map(rooms.map(x => [String(x._id), x]));
  const slotMap = new Map(slots.map(x => [`${String(x.day).toLowerCase()}|${x.startTime}-${x.endTime}`, x]));

  const facultyRows = faculty.map(f => {
    const es = entries.filter(e => String(e.faculty) === String(f._id));
    const p = es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    const workingDays = new Set(es.map(e=>e.day)).size;
    const capacity = Math.max(1, Number(f.maxWorkingDays || 5) * Number(f.maxClassesPerDay || 1));
    return { id:String(f._id), name:f.name || f.code || "Faculty", code:f.code || "", classes:es.length, periods:p, workingDays, maxWorkingDays:Number(f.maxWorkingDays||5), maxClassesPerDay:Number(f.maxClassesPerDay||1), utilization:Math.round(Math.min(100,p/capacity*100)) };
  }).sort((a,b)=>b.periods-a.periods);

  const roomCapacity = Math.max(1, slots.length);
  const roomRows = rooms.map(r => {
    const es = entries.filter(e=>String(e.room)===String(r._id));
    const p = es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0);
    return {id:String(r._id),name:r.name,type:r.type,capacity:r.capacity,classes:es.length,periods:p,utilization:Math.round(Math.min(100,p/roomCapacity*100))};
  }).sort((a,b)=>b.utilization-a.utilization);

  const sectionRows = sections.map(sec => {
    const es=entries.filter(e=>String(e.section)===String(sec._id));
    const requiredSection=subjects.filter(s=>String(s.section)===String(sec._id)).reduce((n,s)=>n+Number(s.classesPerWeek||0),0);
    return {id:String(sec._id),label:`${sec.program||""} ${sec.semester||""} - ${sec.name||""}`.trim(),program:sec.program||"",semester:sec.semester||"",name:sec.name||"",classes:es.length,periods:es.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0),required:requiredSection,coverage:requiredSection?Math.round(Math.min(100,es.length/requiredSection*100)):100};
  }).sort((a,b)=>b.periods-a.periods);

  const subjectRows=subjects.map(sub=>{
    const es=entries.filter(e=>String(e.subject)===String(sub._id));
    return {id:String(sub._id),name:sub.name,code:sub.code||"",faculty:fMap.get(String(sub.faculty))?.name||"",section:secMap.get(String(sub.section))?.name||"",required:Number(sub.classesPerWeek||0),scheduled:es.length,unscheduled:Math.max(0,Number(sub.classesPerWeek||0)-es.length),roomType:sub.roomType||""};
  });

  const reportEntries=entries.map(e=>({
    day:e.day,startTime:e.startTime,endTime:e.endTime,duration:Number(e.duration||1),
    subject:subMap.get(String(e.subject))?.name||"",subjectCode:subMap.get(String(e.subject))?.code||"",
    faculty:fMap.get(String(e.faculty))?.name||"",section:secMap.get(String(e.section))?.name||"",
    program:secMap.get(String(e.section))?.program||"",semester:secMap.get(String(e.section))?.semester||"",
    room:roomMap.get(String(e.room))?.name||""
  })).sort((a,b)=>daysList.indexOf(a.day)-daysList.indexOf(b.day)||String(a.startTime).localeCompare(String(b.startTime)));

  const daily=daysList.map(day=>({day,classes:entries.filter(e=>e.day===day).length,periods:entries.filter(e=>e.day===day).reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0)}));
  const validation = (() => {
    const issues=[]; const add=(severity,category,message)=>issues.push({severity,category,message});
    const expanded=[];
    for(const e of entries){
      const block=slots.filter(x=>String(x.day).toLowerCase()===String(e.day).toLowerCase()).sort((a,b)=>Number(a.order)-Number(b.order));
      const idx=block.findIndex(x=>Number(x.order)===Number(e.order));
      const duration=Math.max(1,Number(e.duration||1));
      (idx>=0?block.slice(idx,idx+duration):[]).forEach(sl=>expanded.push({e,sl}));
      const f=fMap.get(String(e.faculty)), sec=secMap.get(String(e.section)), room=roomMap.get(String(e.room)), sub=subMap.get(String(e.subject));
      if(f){const allowed=(f.availableDays||[]).map(x=>String(x).toLowerCase());if(allowed.length&&!allowed.includes(String(e.day).toLowerCase()))add("error","Faculty Availability",`${f.name} is not available on ${e.day}.`);}
      if(sub&&room&&sub.roomType&&sub.roomType!=="Any"&&String(sub.roomType).toLowerCase()!==String(room.type).toLowerCase())add("error","Room Type",`${sub.name} requires ${sub.roomType}, but ${room.name} is ${room.type}.`);
      if(sec&&f){} // reference maps intentionally retained for report context
    }
    for(let i=0;i<expanded.length;i++)for(let j=i+1;j<expanded.length;j++){
      const a=expanded[i],b=expanded[j];if(a.sl.day!==b.sl.day||a.sl.startTime!==b.sl.startTime||a.sl.endTime!==b.sl.endTime)continue;
      if(String(a.e.faculty)===String(b.e.faculty))add("error","Faculty Conflict",`${fMap.get(String(a.e.faculty))?.name||"Faculty"} is double-booked on ${a.sl.day} ${a.sl.startTime}.`);
      if(String(a.e.section)===String(b.e.section))add("error","Section Conflict",`${secMap.get(String(a.e.section))?.name||"Section"} is double-booked on ${a.sl.day} ${a.sl.startTime}.`);
      if(String(a.e.room)===String(b.e.room))add("error","Room Conflict",`${roomMap.get(String(a.e.room))?.name||"Room"} is double-booked on ${a.sl.day} ${a.sl.startTime}.`);
    }
    for(const s of subjectRows)if(s.unscheduled>0)add("warning","Coverage",`${s.name}: ${s.scheduled}/${s.required} weekly classes scheduled.`);
    for(const f of facultyRows){if(f.workingDays>f.maxWorkingDays)add("warning","Faculty Limit",`${f.name} works ${f.workingDays} days; limit is ${f.maxWorkingDays}.`);for(const d of daysList){const n=entries.filter(e=>String(e.faculty)===f.id&&e.day===d).length;if(n>f.maxClassesPerDay)add("warning","Faculty Limit",`${f.name} has ${n} classes on ${d}; limit is ${f.maxClassesPerDay}.`);}}
    for(const s of sectionRows)for(const d of daysList){const n=entries.filter(e=>String(e.section)===s.id&&e.day===d).length;const sec=secMap.get(s.id);if(sec&&n>Number(sec.maxClassesPerDay||999))add("warning","Section Limit",`${s.name} has ${n} classes on ${d}; limit is ${sec.maxClassesPerDay}.`);}
    return {errors:issues.filter(x=>x.severity==="error").length,warnings:issues.filter(x=>x.severity==="warning").length,issues};
  })();

  return {session:activeSession?{id:activeSession._id,name:activeSession.name}:null,timetable:timetable?{id:timetable._id,status:timetable.status,version:timetable.version,versionLabel:timetable.versionLabel,generatedAt:timetable.generatedAt||timetable.createdAt}:null,summary:{requiredSessions:required,scheduledSessions:scheduled,unscheduledSessions:Math.max(0,required-scheduled),coverage:required?Math.round(Math.min(100,scheduled/required*100)):100,periods},faculty:facultyRows,rooms:roomRows,sections:sectionRows,subjects:subjectRows,entries:reportEntries,daily,validation,warnings:timetable?.warnings||[]};
}

app.get("/api/reports/summary", async (_req,res)=>{
  try{res.json(await buildReportData());}catch(e){console.error("GET /api/reports/summary failed:",e);res.status(500).json({message:e.message});}
});

app.get("/api/reports/export/excel", async (_req,res)=>{
  try{
    const d=await buildReportData(); const wb=new ExcelJS.Workbook(); wb.creator="Time Table";
    const addSheet=(name,headers,rows)=>{const ws=wb.addWorksheet(name);ws.addRow(headers);ws.getRow(1).font={bold:true};rows.forEach(r=>ws.addRow(r));ws.columns.forEach(c=>c.width=Math.min(40,Math.max(12,(c.header||"").length+4)));return ws;};
    addSheet("Summary",["Metric","Value"],[
      ["Academic Session",d.session?.name||""],["Timetable Status",d.timetable?.status||""],["Version",d.timetable?.versionLabel||""],["Required Sessions",d.summary.requiredSessions],["Scheduled Sessions",d.summary.scheduledSessions],["Unscheduled Sessions",d.summary.unscheduledSessions],["Coverage %",d.summary.coverage],["Total Periods",d.summary.periods],["Validation Errors",d.validation.errors],["Validation Warnings",d.validation.warnings]
    ]);
    addSheet("Timetable",["Day","Start","End","Duration","Subject","Code","Faculty","Section","Program","Semester","Room"],d.entries.map(x=>[x.day,x.startTime,x.endTime,x.duration,x.subject,x.subjectCode,x.faculty,x.section,x.program,x.semester,x.room]));
    addSheet("Faculty Workload",["Faculty","Code","Classes","Periods","Working Days","Max Working Days","Max Classes/Day","Utilization %"],d.faculty.map(x=>[x.name,x.code,x.classes,x.periods,x.workingDays,x.maxWorkingDays,x.maxClassesPerDay,x.utilization]));
    addSheet("Room Utilization",["Room","Type","Capacity","Classes","Periods","Utilization %"],d.rooms.map(x=>[x.name,x.type,x.capacity,x.classes,x.periods,x.utilization]));
    addSheet("Section Workload",["Section","Program","Semester","Classes","Periods","Required","Coverage %"],d.sections.map(x=>[x.name,x.program,x.semester,x.classes,x.periods,x.required,x.coverage]));
    addSheet("Subject Coverage",["Subject","Code","Faculty","Section","Required","Scheduled","Unscheduled","Room Type"],d.subjects.map(x=>[x.name,x.code,x.faculty,x.section,x.required,x.scheduled,x.unscheduled,x.roomType]));
    addSheet("Daily Distribution",["Day","Classes","Periods"],d.daily.map(x=>[x.day,x.classes,x.periods]));
    addSheet("Conflicts",["Severity","Category","Issue"],d.validation.issues.map(x=>[x.severity,x.category,x.message]));
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");res.setHeader("Content-Disposition",'attachment; filename="timetable-report.xlsx"');await wb.xlsx.write(res);res.end();
  }catch(e){res.status(500).json({message:e.message});}
});

app.get("/api/reports/export/pdf", async (_req,res)=>{
  try{
    const d=await buildReportData();
    const PDFDocument=(await import("pdfkit")).default; const doc=new PDFDocument({margin:40,size:"A4"});
    res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",'attachment; filename="timetable-report.pdf"');doc.pipe(res);
    const line=(label,value)=>{doc.fontSize(10).text(`${label}: ${value}`);};
    doc.fontSize(20).text("Time Table - Advanced Report");doc.moveDown(0.4);line("Academic Session",d.session?.name||"Not set");line("Timetable",`${d.timetable?.versionLabel||"Current"} / ${d.timetable?.status||"DRAFT"}`);line("Generated",d.timetable?.generatedAt?new Date(d.timetable.generatedAt).toLocaleString():"-");doc.moveDown();
    doc.fontSize(14).text("Executive Summary");doc.fontSize(10).text(`Required sessions: ${d.summary.requiredSessions} | Scheduled: ${d.summary.scheduledSessions} | Unscheduled: ${d.summary.unscheduledSessions} | Coverage: ${d.summary.coverage}% | Periods: ${d.summary.periods}`);doc.moveDown();
    doc.fontSize(14).text("Faculty Workload");d.faculty.slice(0,20).forEach(x=>doc.fontSize(9).text(`${x.name} - ${x.classes} classes / ${x.periods} periods / ${x.workingDays} days / ${x.utilization}% utilization`));doc.moveDown();
    doc.fontSize(14).text("Room Utilization");d.rooms.slice(0,20).forEach(x=>doc.fontSize(9).text(`${x.name} (${x.type}) - ${x.classes} classes / ${x.periods} periods / ${x.utilization}% utilization`));doc.moveDown();
    doc.fontSize(14).text("Section Workload");d.sections.slice(0,20).forEach(x=>doc.fontSize(9).text(`${x.label} - ${x.classes} classes / ${x.periods} periods / ${x.coverage}% coverage`));doc.moveDown();
    doc.fontSize(14).text("Unscheduled Classes");const uns=d.subjects.filter(x=>x.unscheduled>0);if(!uns.length)doc.fontSize(9).text("None");else uns.forEach(x=>doc.fontSize(9).text(`${x.name} (${x.code}) - ${x.unscheduled} unscheduled`));doc.moveDown();
    doc.fontSize(14).text("Conflict / Validation Report");if(!d.validation.issues.length)doc.fontSize(9).text("No validation issues detected.");else d.validation.issues.slice(0,80).forEach(x=>doc.fontSize(8).text(`[${x.severity.toUpperCase()}] ${x.category}: ${x.message}`));doc.end();
  }catch(e){res.status(500).json({message:e.message});}
});


app.get("/api/sessions/active",async(_req,res)=>{
  try{res.json(await AcademicSession.findOne({active:true}).sort({startDate:-1})||null)}
  catch(e){res.status(500).json({message:e.message})}
});

app.post("/api/sessions/:id/activate",allowRoles("ADMIN", "SCHEDULER"),async(req,res)=>{
  try{
    const session=await AcademicSession.findById(req.params.id);
    if(!session)return res.status(404).json({message:"Academic session not found."});
    await AcademicSession.updateMany({},{$set:{active:false}});
    session.active=true; await session.save(); await writeAudit(req,{action:"ACTIVATE_SESSION",category:"ACADEMIC_SESSION",description:`Activated academic session ${session.name}`,targetType:"AcademicSession",targetId:session._id,metadata:{name:session.name}}); res.json(session);
  }catch(e){res.status(400).json({message:e.message})}
});

app.get("/api/timetable/versions",async(req,res)=>{
  try{
    const filter=req.query.sessionId?{academicSession:req.query.sessionId}:{};
    res.json(await Timetable.find(filter)
      .populate("academicSession")
      .select("_id academicSession version versionLabel status isCurrent notes createdAt updatedAt")
      .sort({createdAt:-1}));
  }catch(e){res.status(500).json({message:e.message})}
});


// Phase 27: compare any two timetable versions and return user-friendly changes.
app.get("/api/timetable/change-history", async (req, res) => {
  try {
    const { fromId, toId, sessionId } = req.query || {};
    if (!fromId || !toId) return res.status(400).json({ message: "fromId and toId are required." });
    if (String(fromId) === String(toId)) return res.status(400).json({ message: "Select two different timetable versions." });

    const [from, to] = await Promise.all([
      Timetable.findById(fromId).populate("entries.section entries.subject entries.faculty entries.room").populate("academicSession").lean(),
      Timetable.findById(toId).populate("entries.section entries.subject entries.faculty entries.room").populate("academicSession").lean()
    ]);
    if (!from || !to) return res.status(404).json({ message: "One or both timetable versions were not found." });
    if (sessionId && (String(from.academicSession?._id || from.academicSession) !== String(sessionId) || String(to.academicSession?._id || to.academicSession) !== String(sessionId))) {
      return res.status(400).json({ message: "Both versions must belong to the selected academic session." });
    }

    const nameOf = (v, fallback="—") => v?.name || v?.code || (v ? String(v) : fallback);
    const keyBase = e => `${String(e.section?._id || e.section || "")}|${String(e.subject?._id || e.subject || "")}|${String(e.faculty?._id || e.faculty || "")}`;
    const buildMap = entries => {
      const counters = new Map(), map = new Map();
      for (const e of (entries || [])) {
        const base = keyBase(e);
        const occurrence = (counters.get(base) || 0) + 1;
        counters.set(base, occurrence);
        map.set(`${base}|${occurrence}`, e);
      }
      return map;
    };

    const fromMap = buildMap(from.entries), toMap = buildMap(to.entries);
    const changes = [];
    const fields = [
      ["day", "Day"], ["startTime", "Start Time"], ["endTime", "End Time"], ["room", "Room"]
    ];
    const formatEntry = e => ({
      section: nameOf(e.section), program: e.section?.program || "", semester: e.section?.semester || "",
      subject: nameOf(e.subject), subjectCode: e.subject?.code || "", faculty: nameOf(e.faculty),
      room: nameOf(e.room), day: e.day || "", startTime: e.startTime || "", endTime: e.endTime || "", duration: e.duration || 1
    });

    const allKeys = new Set([...fromMap.keys(), ...toMap.keys()]);
    for (const key of allKeys) {
      const a = fromMap.get(key), b = toMap.get(key);
      if (!a && b) changes.push({ type: "ADDED", label: "Class added", before: null, after: formatEntry(b) });
      else if (a && !b) changes.push({ type: "REMOVED", label: "Class removed", before: formatEntry(a), after: null });
      else if (a && b) {
        const before = formatEntry(a), after = formatEntry(b);
        const changed = fields.filter(([f]) => {
          if (f === "room") return String(a.room?._id || a.room || "") !== String(b.room?._id || b.room || "");
          return String(a[f] || "") !== String(b[f] || "");
        });
        if (changed.length) {
          changes.push({
            type: changed.some(([f]) => ["day", "startTime", "endTime"].includes(f)) ? "MOVED" : "UPDATED",
            label: changed.map(([,label]) => label).join(" + ") + " changed",
            fields: changed.map(([f,label]) => ({ field:f, label, before: f === "room" ? nameOf(a.room) : (a[f] || "—"), after: f === "room" ? nameOf(b.room) : (b[f] || "—") })),
            before, after
          });
        }
      }
    }

    changes.sort((a,b) => String(a.after?.day || a.before?.day || "").localeCompare(String(b.after?.day || b.before?.day || "")) || String(a.after?.startTime || a.before?.startTime || "").localeCompare(String(b.after?.startTime || b.before?.startTime || "")));
    res.json({
      from: { id: from._id, version: from.version, versionLabel: from.versionLabel, status: from.status, createdAt: from.createdAt, academicSession: from.academicSession?.name || "" },
      to: { id: to._id, version: to.version, versionLabel: to.versionLabel, status: to.status, createdAt: to.createdAt, academicSession: to.academicSession?.name || "" },
      summary: { total: changes.length, added: changes.filter(x=>x.type === "ADDED").length, removed: changes.filter(x=>x.type === "REMOVED").length, moved: changes.filter(x=>x.type === "MOVED").length, updated: changes.filter(x=>x.type === "UPDATED").length },
      changes
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post("/api/timetable/clone",allowRoles("ADMIN", "SCHEDULER"),async(req,res)=>{
  try{
    const { sourceTimetableId, targetSessionId, versionLabel="", notes="" } = req.body || {};
    if(!sourceTimetableId || !targetSessionId) return res.status(400).json({message:"Source timetable and target academic session are required."});
    const source=await Timetable.findById(sourceTimetableId).lean();
    if(!source) return res.status(404).json({message:"Source timetable version not found."});
    const target=await AcademicSession.findById(targetSessionId).lean();
    if(!target) return res.status(404).json({message:"Target academic session not found."});
    if(source.academicSession && String(source.academicSession)===String(target._id)) return res.status(400).json({message:"Source and target academic sessions must be different."});
    if(!source.entries?.length) return res.status(400).json({message:"The source timetable has no scheduled classes to clone."});

    await Timetable.updateMany({academicSession:target._id},{$set:{isCurrent:false}});
    const count=await Timetable.countDocuments({academicSession:target._id});
    const version=count+1;
    const label=String(versionLabel||`Cloned Version ${version}`).trim() || `Cloned Version ${version}`;
    const cloned=await Timetable.create({
      generatedAt:new Date(),
      entries:source.entries.map(e=>({day:e.day,startTime:e.startTime,endTime:e.endTime,order:e.order,duration:e.duration||1,section:e.section,subject:e.subject,faculty:e.faculty,room:e.room})),
      score:source.score||0,
      optimizationScore:source.optimizationScore ?? null,
      optimizationMetrics:source.optimizationMetrics || null,
      optimizationRuns:source.optimizationRuns || 0,
      optimizationComparison:source.optimizationComparison || [],
      warnings:source.warnings||[],
      academicSession:target._id,
      version,
      versionLabel:label,
      isCurrent:true,
      createdBy:req.user?.username||"",
      notes:String(notes||`Cloned from ${source.versionLabel||`Version ${source.version||1}`}.`),
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:"Cloned as a new draft timetable.",
      approvalHistory:[]
    });

    await writeAudit(req,{action:"CLONE_TIMETABLE",category:"TIMETABLE",description:`Cloned ${source.versionLabel||`Version ${source.version||1}`} into academic session ${target.name} as ${label}`,targetType:"Timetable",targetId:cloned._id,metadata:{sourceTimetableId:String(source._id),sourceSessionId:String(source.academicSession||""),targetSessionId:String(target._id),targetSessionName:target.name,version,entries:cloned.entries.length}});
    await createTimetableChangeNotifications({title:"Timetable template cloned",message:`A timetable template was cloned into academic session ${target.name}. The new timetable is currently in Draft status.`,priority:"IMPORTANT",facultyIds:cloned.entries.map(e=>e.faculty),sectionIds:cloned.entries.map(e=>e.section),metadata:{timetableId:cloned._id,event:"TIMETABLE_CLONED"}});

    const populated=await Timetable.findById(cloned._id).populate("entries.section entries.subject entries.faculty entries.room").populate("academicSession");
    res.status(201).json(populated);
  }catch(e){res.status(400).json({message:e.message})}
});

app.post("/api/timetable/:id/restore",allowRoles("ADMIN", "SCHEDULER"),async(req,res)=>{
  try{
    const source=await Timetable.findById(req.params.id);
    if(!source)return res.status(404).json({message:"Timetable version not found."});
    if(source.academicSession)await Timetable.updateMany({academicSession:source.academicSession},{$set:{isCurrent:false}});
    const count=await Timetable.countDocuments({academicSession:source.academicSession||null});
    const restored=await Timetable.create({
      entries:source.entries,warnings:source.warnings||[],score:source.score||0,
      academicSession:source.academicSession||null,version:count+1,
      versionLabel:`Restored from ${source.versionLabel||`Version ${source.version||1}`}`,
      isCurrent:true,status:"DRAFT",statusChangedAt:new Date(),
      statusNote:"Restored as a new draft version.",
      approvalHistory:[]
    });
    await writeAudit(req,{action:"RESTORE_VERSION",category:"TIMETABLE",description:`Restored ${source.versionLabel||`Version ${source.version||1}`} as a new draft`,targetType:"Timetable",targetId:restored._id,metadata:{sourceId:String(source._id),sourceVersion:source.version,restoredVersion:restored.version}});
    res.json(await Timetable.findById(restored._id)
      .populate("entries.section entries.subject entries.faculty entries.room")
      .populate("academicSession"));
  }catch(e){res.status(400).json({message:e.message})}
});

app.post("/api/timetable/generate", allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
  try {
    const activeSession=req.body?.academicSessionId
      ? await AcademicSession.findById(req.body.academicSessionId)
      : await AcademicSession.findOne({active:true}).sort({startDate:-1});
    if(!activeSession)return res.status(400).json({message:"Create and activate an Academic Session before generating a timetable."});
    // IMPORTANT: load Subjects as raw documents. Do not depend on populate().
    // A valid MongoDB ObjectId reference is enough for the generator.
    const [faculty, programs, subjects, sections, rooms, slots] = await Promise.all([
      Faculty.find().lean(),
      Program.find({ active: { $ne: false } }).lean(),
      Subject.find().lean(),
      Section.find().lean(),
      Room.find().lean(),
      TimeSlot.find().sort({day:1,order:1}).lean()
    ]);

    let settings = null;
    try {
      settings = await SchedulerSetting.findOne({ key: "default" }).lean();
    } catch (settingsError) {
      console.error("Scheduler settings unavailable:", settingsError.message);
    }

    if (!subjects.length) return res.status(400).json({message:"No subjects found. Import or add Subjects first."});
    const usableSlots = slots.filter(s => !s.isBreak);
    if (!usableSlots.length) return res.status(400).json({message:"No usable time slots found. Add Time Slots first."});
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

    const requestedRuns=Math.max(1,Math.min(20,Number(req.body?.generationRuns||settings?.generationRuns||8)));
    const requestedLimit=Math.max(5000,Math.min(60000,Number(req.body?.generationTimeLimitMs||settings?.generationTimeLimitMs||30000)));
    const result = generateBestTimetable({
      faculty,
      programs,
      subjects: validSubjects,
      sections,
      rooms,
      slots: usableSlots,
      settings: settings || {},
      runs: requestedRuns,
      totalMaxMillis: requestedLimit,
      perRunMillis: Math.max(1000,Math.floor(requestedLimit/requestedRuns)),
      attemptsPerRun: 150
    });

    console.log("Timetable generation:", {
      requestedSessions: validSubjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0),
      generatedSessions: result.entries?.length || 0,
      warnings: result.warnings || [],
      diagnostics: result.diagnostics || null,
      optimization: result.optimization || null
    });

    if (!(result.entries?.length)) {
      return res.status(422).json({
        message: "No timetable entries could be generated.",
        warnings: result.warnings || [],
        diagnostics: invalidSubjects.slice(0,50)
      });
    }

    await Timetable.updateMany({academicSession:activeSession._id},{$set:{isCurrent:false}});
    const version=await Timetable.countDocuments({academicSession:activeSession._id})+1;
    const saved = await Timetable.create({
      ...result,
      optimizationScore: result.optimization?.metrics?.optimizationScore ?? null,
      optimizationMetrics: result.optimization?.metrics || null,
      optimizationRuns: result.optimization?.runsCompleted || 0,
      optimizationComparison: result.optimization?.candidates || [],
      academicSession:activeSession._id,
      version,
      versionLabel:`Version ${version}`,
      isCurrent:true,
      status:"DRAFT",
      statusChangedAt:new Date(),
      statusNote:"",
      approvalHistory:[]
    });
    await writeAudit(req,{action:"GENERATE_TIMETABLE",category:"TIMETABLE",description:`Generated timetable Version ${version} for ${activeSession.name}`,targetType:"Timetable",targetId:saved._id,metadata:{sessionId:String(activeSession._id),version,entries:saved.entries?.length||0,warnings:saved.warnings?.length||0}});

    const populated = await Timetable.findById(saved._id)
      .populate("entries.section entries.subject entries.faculty entries.room");

    res.json(populated);
  } catch(e) {
    console.error("TIMETABLE GENERATION ERROR", e);
    res.status(500).json({message:e.message, stack:process.env.NODE_ENV === "development" ? e.stack : undefined});
  }
});

app.patch("/api/timetable/move", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const { entryId, day, startTime } = req.body || {};
    if (!entryId || !day || !startTime) {
      return res.status(400).json({ message: "entryId, day and startTime are required." });
    }

    const [timetable, allSlots, settings] = await Promise.all([
      Timetable.findOne({isCurrent:true}).sort({ createdAt: -1 }),
      TimeSlot.find({ isBreak: { $ne: true } }).sort({ day: 1, order: 1 }),
      SchedulerSetting.findOne({ key: "default" }).lean()
    ]);

    if (!timetable) return res.status(404).json({ message: "No generated timetable found." });
    if ((timetable.status || "DRAFT") !== "DRAFT") {
      return res.status(409).json({ message: `Timetable is ${timetable.status || "DRAFT"}. Return it to DRAFT before making changes.` });
    }

    const entry = timetable.entries.id(entryId);
    if (!entry) return res.status(404).json({ message: "Timetable class not found." });

    const oldPosition = { day: entry.day, startTime: entry.startTime, endTime: entry.endTime, order: entry.order, room: String(entry.room || "") };
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

    entry.day=day;
    entry.startTime=targetBlock[0].startTime;
    entry.endTime=targetBlock.at(-1).endTime;
    entry.order=Number(targetBlock[0].order);
    entry.duration=duration;
    await timetable.save();
    await writeAudit(req,{action:"MOVE_CLASS",category:"TIMETABLE",description:`Moved timetable class to ${day} ${targetBlock[0].startTime}`,targetType:"Timetable",targetId:timetable._id,metadata:{entryId:String(entry._id),from:oldPosition,to:{day,startTime:targetBlock[0].startTime,endTime:targetBlock.at(-1).endTime,order:Number(targetBlock[0].order)},duration}});
    await createTimetableChangeNotifications({
      title:"Timetable class rescheduled",
      message:`A timetable class has been moved from ${oldPosition.day} ${oldPosition.startTime} to ${day} ${targetBlock[0].startTime}. Please check your timetable.`,
      priority:"IMPORTANT",
      facultyIds:[entry.faculty],
      sectionIds:[entry.section],
      metadata:{event:"CLASS_MOVED",timetableId:String(timetable._id),entryId:String(entry._id),subjectId:String(entry.subject),facultyId:String(entry.faculty),sectionId:String(entry.section),roomId:String(entry.room),subjectName:subject.name,facultyName:faculty.name,sectionName:section.name,roomName:room.name,from:oldPosition,to:{day,startTime:targetBlock[0].startTime,endTime:targetBlock.at(-1).endTime}}
    });

    const populated=await Timetable.findById(timetable._id)
      .populate("entries.section entries.subject entries.faculty entries.room");
    res.json({message:"Class moved successfully.",timetable:populated});
  } catch(e) {
    console.error("PATCH /api/timetable/move failed:",e);
    res.status(500).json({message:e.message});
  }
});

app.patch("/api/timetable/entry/:entryId/room", allowRoles("ADMIN", "SCHEDULER"), async (req,res) => {
  try {
    const { roomId } = req.body || {};
    if(!roomId) return res.status(400).json({message:"roomId is required."});
    const [timetable, room] = await Promise.all([
      Timetable.findOne({isCurrent:true}).sort({createdAt:-1}),
      Room.findById(roomId)
    ]);
    if(!timetable) return res.status(404).json({message:"No generated timetable found."});
    if((timetable.status||"DRAFT") !== "DRAFT") return res.status(409).json({message:`Timetable is ${timetable.status||"DRAFT"}. Return it to DRAFT before changing a room.`});
    if(!room) return res.status(404).json({message:"Room not found."});
    const entry=timetable.entries.id(req.params.entryId);
    if(!entry) return res.status(404).json({message:"Timetable class not found."});
    if(String(entry.room)===String(room._id)) return res.json({message:"Class is already assigned to this room."});

    const subject=await Subject.findById(entry.subject);
    if(!subject) return res.status(400).json({message:"Subject master data is missing."});
    const desiredType=String(subject.roomType||"Classroom").toLowerCase();
    const roomType=String(room.type||"Classroom").toLowerCase();
    if(desiredType!=="any" && desiredType!==roomType) return res.status(409).json({message:`Room type conflict: ${subject.roomType} is required.`});

    const duration=Math.max(1,Number(entry.duration||1));
    const allSlots=await TimeSlot.find({isBreak:{$ne:true}}).sort({day:1,order:1});
    const dslots=allSlots.filter(s=>s.day===entry.day).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
    const idx=dslots.findIndex(s=>Number(s.order)===Number(entry.order));
    const block=idx>=0?dslots.slice(idx,idx+duration):[];
    const keys=new Set(block.map(s=>`${s.day}|${s.startTime}-${s.endTime}`));
    for(const other of timetable.entries){
      if(String(other._id)===String(entry._id) || String(other.room)!==String(room._id)) continue;
      const od=dslots.length && other.day===entry.day ? allSlots.filter(s=>s.day===other.day).sort((a,b)=>Number(a.order||0)-Number(b.order||0)) : allSlots.filter(s=>s.day===other.day).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
      const oi=od.findIndex(s=>Number(s.order)===Number(other.order));
      const odur=Math.max(1,Number(other.duration||1));
      const okeys=(oi>=0?od.slice(oi,oi+odur):[]).map(s=>`${s.day}|${s.startTime}-${s.endTime}`);
      if(okeys.some(k=>keys.has(k))) return res.status(409).json({message:`Room conflict: ${room.name} is already occupied in one or more selected periods.`});
    }

    const oldRoom=await Room.findById(entry.room);
    entry.room=room._id;
    await timetable.save();
    await writeAudit(req,{action:"CHANGE_ROOM",category:"TIMETABLE",description:`Changed timetable class room from ${oldRoom?.name||"Unknown"} to ${room.name}`,targetType:"Timetable",targetId:timetable._id,metadata:{entryId:String(entry._id),fromRoomId:String(oldRoom?._id||""),fromRoom:oldRoom?.name||"",toRoomId:String(room._id),toRoom:room.name}});
    await createTimetableChangeNotifications({
      title:"Timetable room changed",
      message:`A class room has changed from ${oldRoom?.name||"previous room"} to ${room.name} on ${entry.day} at ${entry.startTime}. Please check your timetable.`,
      priority:"IMPORTANT",
      facultyIds:[entry.faculty],
      sectionIds:[entry.section],
      metadata:{event:"ROOM_CHANGED",timetableId:String(timetable._id),entryId:String(entry._id),subjectId:String(entry.subject),facultyId:String(entry.faculty),sectionId:String(entry.section),subjectName:subject.name,facultyName:(await Faculty.findById(entry.faculty).select("name").lean())?.name||"",sectionName:(await Section.findById(entry.section).select("name").lean())?.name||"",day:entry.day,startTime:entry.startTime,endTime:entry.endTime,fromRoom:oldRoom?.name||"",toRoom:room.name}
    });
    const populated=await Timetable.findById(timetable._id).populate("entries.section entries.subject entries.faculty entries.room");
    res.json({message:"Room changed successfully.",timetable:populated});
  } catch(e) {
    console.error("PATCH /api/timetable/entry/:entryId/room failed:",e);
    res.status(500).json({message:e.message});
  }
});

app.patch("/api/timetable/status", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const { status, note = "" } = req.body || {};
    const allowed = ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED", "LOCKED"];
    if (!allowed.includes(status)) return res.status(400).json({ message: `Invalid status. Allowed: ${allowed.join(", ")}` });

    const timetable = await Timetable.findOne({isCurrent:true}).sort({ createdAt: -1 });
    if (!timetable) return res.status(404).json({ message: "No generated timetable found." });

    const current = timetable.status || "DRAFT";
    const transitions = {
      DRAFT: ["SUBMITTED"],
      SUBMITTED: ["DRAFT", "APPROVED"],
      APPROVED: ["SUBMITTED", "PUBLISHED"],
      PUBLISHED: ["LOCKED", "SUBMITTED"],
      LOCKED: ["PUBLISHED"]
    };
    if (status !== current && !transitions[current]?.includes(status)) {
      return res.status(409).json({ message: `Cannot change status from ${current} to ${status}.` });
    }

    const cleanNote = String(note || "").trim();
    const noteRequired = (current === "SUBMITTED" && status === "DRAFT") ||
      (current === "SUBMITTED" && status === "APPROVED") ||
      (current === "APPROVED" && status === "SUBMITTED") ||
      (current === "LOCKED" && status === "PUBLISHED");
    if (noteRequired && cleanNote.length < 3) {
      return res.status(400).json({ message: "Approval workflow remarks are required for this action (minimum 3 characters)." });
    }

    timetable.status = status;
    timetable.statusChangedAt = new Date();
    timetable.statusNote = cleanNote;
    timetable.approvalHistory.push({
      from: current, to: status, note: cleanNote, user: req.user?.id || null,
      username: req.user?.username || "", role: req.user?.role || "", changedAt: new Date()
    });
    await timetable.save();
    await writeAudit(req,{action:`STATUS_${status}`,category:"TIMETABLE",description:`Changed timetable status from ${current} to ${status}`,targetType:"Timetable",targetId:timetable._id,metadata:{from:current,to:status,note:cleanNote}});

    const baseMeta={timetableId:String(timetable._id),version:timetable.version||null,note:cleanNote};
    if(status === "APPROVED") {
      await notifyEntries(timetable,{title:"Timetable approved",message:`The timetable has been approved${timetable.versionLabel ? ` (${timetable.versionLabel})` : ""}. It is ready for publication.`,priority:"IMPORTANT",metadata:{...baseMeta,event:"TIMETABLE_APPROVED"}});
    } else if(status === "PUBLISHED") {
      await notifyEntries(timetable,{title:"Timetable published",message:`The timetable has been published${timetable.versionLabel ? ` (${timetable.versionLabel})` : ""}. Please review your classes and rooms.`,priority:"URGENT",metadata:{...baseMeta,event:"TIMETABLE_PUBLISHED"}});
    } else if(status === "LOCKED") {
      await notifyEntries(timetable,{title:"Timetable locked",message:`The current timetable has been locked. Further schedule changes require an administrator/scheduler action.`,priority:"NORMAL",metadata:{...baseMeta,event:"TIMETABLE_LOCKED"}});
    } else if(status === "SUBMITTED") {
      const event=current === "APPROVED" || current === "PUBLISHED" ? "TIMETABLE_CHANGES_REQUESTED" : "TIMETABLE_SUBMITTED";
      await notifyEntries(timetable,{title:event === "TIMETABLE_CHANGES_REQUESTED" ? "Timetable changes requested" : "Timetable submitted for review",message:event === "TIMETABLE_CHANGES_REQUESTED" ? `Changes have been requested for the timetable. Remarks: ${cleanNote}` : `The current timetable has been submitted for review.`,priority:"IMPORTANT",metadata:{...baseMeta,event}});
    } else if(status === "DRAFT" && current === "SUBMITTED") {
      await notifyEntries(timetable,{title:"Timetable returned for revision",message:`The timetable was returned to Draft. Remarks: ${cleanNote}`,priority:"IMPORTANT",metadata:{...baseMeta,event:"TIMETABLE_RETURNED"}});
    }

    const populated = await Timetable.findById(timetable._id)
      .populate("entries.section entries.subject entries.faculty entries.room")
      .populate("approvalHistory.user", "name username");
    res.json({ message: `Timetable status changed to ${status}.`, timetable: populated });
  } catch (e) {
    console.error("PATCH /api/timetable/status failed:",e);
    res.status(500).json({ message: e.message });
  }
});

app.get("/api/timetable/status", async (_req, res) => {
  const timetable = await Timetable.findOne({isCurrent:true}).sort({ createdAt: -1 });
  res.json({ status: timetable?.status || "DRAFT", statusChangedAt: timetable?.statusChangedAt || null, statusNote: timetable?.statusNote || "", approvalHistory: timetable?.approvalHistory || [] });
});


app.get("/api/timetable/export/excel", async (_req, res) => {
  try {
    const XLSX = (await import("xlsx")).default;
    const t = await Timetable.findOne({isCurrent:true}).sort({createdAt:-1})
      .populate("entries.section entries.subject entries.faculty entries.room");
    if (!t) return res.status(404).json({message:"No generated timetable found."});

    const rows = t.entries.map(e => ({
      Day: e.day,
      Start: e.startTime,
      End: e.endTime,
      Program: e.section?.program || "",
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
    res.setHeader("Content-Disposition", 'attachment; filename="generated-timetable.xlsx"');
    res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").send(buffer);
  } catch(e) { res.status(500).json({message:e.message}); }
});

app.get("/api/timetable/export/pdf", async (_req, res) => {
  try {
    const PDFDocument = (await import("pdfkit")).default;
    const t = await Timetable.findOne({isCurrent:true}).sort({createdAt:-1})
      .populate("entries.section entries.subject entries.faculty entries.room");
    if (!t) return res.status(404).json({message:"No generated timetable found."});

    res.setHeader("Content-Disposition", 'attachment; filename="generated-timetable.pdf"');
    res.setHeader("Content-Type", "application/pdf");

    const doc = new PDFDocument({margin:36, size:"A4", layout:"landscape"});
    doc.pipe(res);
    doc.fontSize(18).text("Generated Timetable", {align:"center"});
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

    for (const e of t.entries) {
      if (y > 540) { doc.addPage(); y=36; drawHeader(); }
      const values = [
        e.day,
        `${e.startTime}-${e.endTime}`,
        e.section?.program || "",
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
  } catch(e) { res.status(500).json({message:e.message}); }
});

app.get("/api/timetable/latest", async (_req,res) => {
  const t = await Timetable.findOne({isCurrent:true}).sort({createdAt:-1}).populate("entries.section entries.subject entries.faculty entries.room").populate("approvalHistory.user", "name username");
  res.json(t || {entries:[],warnings:[],status:"DRAFT"});
});

app.use((_req, res) => res.status(404).json({ message: "API route not found." }));

app.use((err, _req, res, _next) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    message: isProduction ? "An unexpected server error occurred." : (err.message || "Internal server error.")
  });
});

const PORT = process.env.PORT || 5000;

async function ensureAdmin() {
  const bcrypt = await import("bcryptjs");
  const exists = await User.findOne({ username: "admin" });
  if (exists) return;

  const configuredPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (isProduction && !configuredPassword) {
    throw new Error("DEFAULT_ADMIN_PASSWORD must be set before first production startup when no admin user exists.");
  }
  const password = configuredPassword || "admin123";
  if (password.length < 10) throw new Error("DEFAULT_ADMIN_PASSWORD must contain at least 10 characters.");
  const passwordHash = await bcrypt.default.hash(password, 12);
  await User.create({ name: "System Administrator", username: "admin", passwordHash, role: "ADMIN" });
  console.log("Initial admin account created. Change the password immediately after first login.");
}

let server;
async function start() {
  await connectDB();
  await ensureAdmin();
  server = app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.connection.close(false);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", err => { console.error("Unhandled promise rejection:", err); });
process.on("uncaughtException", err => { console.error("Uncaught exception:", err); process.exit(1); });

start().catch(err => { console.error("Server startup failed:", err.message); process.exit(1); });
