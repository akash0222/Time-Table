import express from "express";
import AttendanceSession from "../models/AttendanceSession.js";
import Student from "../models/Student.js";
import Timetable from "../models/Timetable.js";
import AcademicSession from "../models/AcademicSession.js";

const router = express.Router();
const MARK_ROLES = ["ADMIN", "SCHEDULER", "FACULTY"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "You are not authorized for this action." });
}
function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")); }
function entryIdOf(e) { return String(e?._id || ""); }
function scopedEntryAllowed(req, entry) {
  if (req.user?.role !== "FACULTY") return true;
  return String(entry?.faculty?._id || entry?.faculty || "") === String(req.user?.faculty || "");
}
async function scopedStudentAllowed(req, student) {
  if (!student) return false;
  if (["ADMIN", "SCHEDULER"].includes(req.user?.role)) return true;
  if (req.user?.role === "VIEWER") return String(student.section?._id || student.section) === String(req.user?.section || "");
  if (req.user?.role === "FACULTY") {
    if (!req.user?.faculty) return false;
    const timetable = await currentTimetable();
    return Boolean((timetable?.entries || []).some(e => String(e.faculty?._id || e.faculty) === String(req.user.faculty) && String(e.section?._id || e.section) === String(student.section?._id || student.section)));
  }
  return false;
}

async function currentTimetable() {
  return Timetable.findOne({ isCurrent: true }).sort({ createdAt: -1 }).populate("entries.section entries.subject entries.faculty entries.room").lean();
}

function publicClass(entry, attendance) {
  const records = attendance?.records || [];
  const counts = records.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  return {
    timetableEntryId: entryIdOf(entry),
    day: entry.day,
    startTime: entry.startTime,
    endTime: entry.endTime,
    order: Number(entry.order || 0),
    duration: Number(entry.duration || 1),
    section: entry.section || null,
    subject: entry.subject || null,
    faculty: entry.faculty || null,
    room: entry.room || null,
    attendance: attendance ? {
      id: attendance._id,
      status: attendance.status,
      records: attendance.records || [],
      counts,
      notes: attendance.notes || "",
      markedAt: attendance.markedAt,
      markedByName: attendance.markedByName || ""
    } : null
  };
}

router.get("/today", async (req, res) => {
  try {
    const date = validDate(req.query.date) ? String(req.query.date) : localDate();
    const day = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const timetable = await currentTimetable();
    if (!timetable) return res.json({ date, day, timetable: null, classes: [] });
    let entries = (timetable.entries || []).filter(e => e.day === day);
    if (req.user.role === "FACULTY") entries = entries.filter(e => scopedEntryAllowed(req, e));
    if (req.user.role === "VIEWER") entries = entries.filter(e => String(e.section?._id || e.section) === String(req.user.section || ""));
    if (req.query.sectionId) {
      if (req.user.role === "VIEWER" && String(req.query.sectionId) !== String(req.user.section || "")) return res.status(403).json({ message: "You can only view attendance for your mapped section." });
      entries = entries.filter(e => String(e.section?._id || e.section) === String(req.query.sectionId));
    }
    if (req.query.facultyId) entries = entries.filter(e => String(e.faculty?._id || e.faculty) === String(req.query.facultyId));
    entries.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const ids = entries.map(entryIdOf);
    const sessions = await AttendanceSession.find({ date, timetable: timetable._id, timetableEntryId: { $in: ids } }).lean();
    const map = new Map(sessions.map(x => [String(x.timetableEntryId), x]));
    res.json({ date, day, timetable: { id: timetable._id, version: timetable.version, versionLabel: timetable.versionLabel, status: timetable.status }, classes: entries.map(e => publicClass(e, map.get(entryIdOf(e)))) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/class/:timetableEntryId", async (req, res) => {
  try {
    const date = validDate(req.query.date) ? String(req.query.date) : localDate();
    const timetable = await currentTimetable();
    if (!timetable) return res.status(404).json({ message: "No current timetable found." });
    const entry = (timetable.entries || []).find(e => entryIdOf(e) === String(req.params.timetableEntryId));
    if (!entry) return res.status(404).json({ message: "Timetable class not found." });
    if (!scopedEntryAllowed(req, entry)) return res.status(403).json({ message: "This class is not assigned to your faculty account." });
    const [attendance, students] = await Promise.all([
      AttendanceSession.findOne({ date, timetable: timetable._id, timetableEntryId: entryIdOf(entry) }).lean(),
      Student.find({ section: entry.section?._id || entry.section, active: true }).sort({ rollNo: 1, name: 1 }).lean()
    ]);
    const existing = new Map((attendance?.records || []).map(r => [String(r.student), r]));
    res.json({ date, day: entry.day, class: publicClass(entry, attendance), students: students.map(s => ({ ...s, attendance: existing.get(String(s._id)) || { student: s._id, status: "UNMARKED", remarks: "" } })) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

async function saveAttendance(req, res, existingId = null) {
  const { date = localDate(), timetableEntryId, records = [], notes = "" } = req.body || {};
  if (!validDate(date)) return res.status(400).json({ message: "Date must be in YYYY-MM-DD format." });
  if (!timetableEntryId) return res.status(400).json({ message: "Timetable class is required." });
  const timetable = await currentTimetable();
  if (!timetable) return res.status(400).json({ message: "Generate a current timetable first." });
  const entry = (timetable.entries || []).find(e => entryIdOf(e) === String(timetableEntryId));
  if (!entry) return res.status(404).json({ message: "Timetable class not found." });
  if (!scopedEntryAllowed(req, entry)) return res.status(403).json({ message: "This class is not assigned to your faculty account." });
  const day = DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
  if (entry.day !== day) return res.status(400).json({ message: `This class is scheduled on ${entry.day}, but ${date} is ${day}.` });

  const students = await Student.find({ section: entry.section?._id || entry.section, active: true }).select("_id").lean();
  const studentIds = new Set(students.map(s => String(s._id)));
  const cleanRecords = (Array.isArray(records) ? records : []).filter(r => studentIds.has(String(r.student))).map(r => ({
    student: r.student,
    status: ["PRESENT", "ABSENT", "LATE", "LEAVE", "UNMARKED"].includes(String(r.status).toUpperCase()) ? String(r.status).toUpperCase() : "UNMARKED",
    remarks: String(r.remarks || "").trim()
  }));
  const covered = new Set(cleanRecords.map(r => String(r.student)));
  for (const s of students) if (!covered.has(String(s._id))) cleanRecords.push({ student: s._id, status: "UNMARKED", remarks: "" });

  const academicSession = await AcademicSession.findOne({ active: true }).select("_id").lean();
  const filter = existingId ? { _id: existingId } : { date, timetable: timetable._id, timetableEntryId: String(timetableEntryId) };
  const update = {
    date,
    academicSession: academicSession?._id || timetable.academicSession || null,
    timetable: timetable._id,
    timetableEntryId: String(timetableEntryId),
    section: entry.section?._id || entry.section,
    subject: entry.subject?._id || entry.subject,
    faculty: entry.faculty?._id || entry.faculty,
    startTime: entry.startTime || "",
    endTime: entry.endTime || "",
    status: "SUBMITTED",
    records: cleanRecords,
    notes,
    markedBy: req.user.id,
    markedByName: req.user.name || req.user.username || "",
    markedAt: new Date()
  };
  const saved = await AttendanceSession.findOneAndUpdate(filter, update, { new: true, upsert: !existingId, runValidators: true, setDefaultsOnInsert: true });
  res.json({ message: "Attendance saved successfully.", attendance: saved });
}

router.post("/session", allowRoles(...MARK_ROLES), async (req, res) => {
  try { return await saveAttendance(req, res); } catch (e) { res.status(400).json({ message: e.code === 11000 ? "Attendance for this class and date already exists. Refresh and update the existing record." : e.message }); }
});

router.put("/session/:id", allowRoles(...MARK_ROLES), async (req, res) => {
  try { return await saveAttendance(req, res, req.params.id); } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get("/student/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).lean();
    if (!student) return res.status(404).json({ message: "Student not found." });
    if (!await scopedStudentAllowed(req, student)) return res.status(403).json({ message: "You are not authorized to view this student's attendance." });
    const filter = { "records.student": req.params.id };
    if (validDate(req.query.from)) filter.date = { ...(filter.date || {}), $gte: String(req.query.from) };
    if (validDate(req.query.to)) filter.date = { ...(filter.date || {}), $lte: String(req.query.to) };
    const rows = await AttendanceSession.find(filter)
      .populate("subject", "name code").populate("section", "name program semester").populate("faculty", "name code")
      .sort({ date: -1, startTime: -1 }).lean();
    const detail = rows.map(a => ({ ...a, record: (a.records || []).find(r => String(r.student) === String(req.params.id)) }));
    const counts = detail.reduce((x, r) => { const s = r.record?.status || "UNMARKED"; x[s] = (x[s] || 0) + 1; return x; }, {});
    const total = detail.length;
    const attended = (counts.PRESENT || 0) + (counts.LATE || 0);
    res.json({ rows: detail, counts, total, attended, percentage: total ? Number(((attended / total) * 100).toFixed(2)) : 0 });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/section/:id", async (req, res) => {
  try {
    if (req.user.role === "VIEWER" && String(req.params.id) !== String(req.user.section || "")) return res.status(403).json({ message: "You can only view attendance for your mapped section." });
    const students = await Student.find({ section: req.params.id, active: true }).sort({ rollNo: 1, name: 1 }).lean();
    const filter = { section: req.params.id };
    if (req.user.role === "FACULTY") filter.faculty = req.user.faculty || null;
    if (validDate(req.query.from)) filter.date = { ...(filter.date || {}), $gte: String(req.query.from) };
    if (validDate(req.query.to)) filter.date = { ...(filter.date || {}), $lte: String(req.query.to) };
    const sessions = await AttendanceSession.find(filter).populate("subject", "name code").sort({ date: 1, startTime: 1 }).lean();
    const byStudent = new Map(students.map(s => [String(s._id), { student: s, total: 0, present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 }]));
    for (const a of sessions) for (const r of a.records || []) {
      const row = byStudent.get(String(r.student)); if (!row) continue;
      row.total++;
      if (r.status === "PRESENT") row.present++; else if (r.status === "ABSENT") row.absent++; else if (r.status === "LATE") row.late++; else if (r.status === "LEAVE") row.leave++; else row.unmarked++;
    }
    const rows = [...byStudent.values()].map(r => ({ ...r, percentage: r.total ? Number((((r.present + r.late) / r.total) * 100).toFixed(2)) : 0 }));
    res.json({ sessions, students: rows, summary: { classes: sessions.length, students: rows.length, totalMarked: rows.reduce((n, r) => n + r.total, 0) } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/report", async (req, res) => {
  try {
    const from = validDate(req.query.from) ? String(req.query.from) : "";
    const to = validDate(req.query.to) ? String(req.query.to) : "";
    const filter = {};
    if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    if (req.query.sectionId) filter.section = req.query.sectionId;
    if (req.user.role === "VIEWER") filter.section = req.user.section || null;
    if (req.query.subjectId) filter.subject = req.query.subjectId;
    if (req.user.role === "FACULTY") filter.faculty = req.user.faculty || null;
    const sessions = await AttendanceSession.find(filter)
      .populate("section", "name program semester").populate("subject", "name code").populate("faculty", "name code")
      .sort({ date: -1, startTime: 1 }).lean();
    const totals = sessions.reduce((a, s) => {
      for (const r of s.records || []) a[r.status] = (a[r.status] || 0) + 1;
      return a;
    }, {});
    const marked = (totals.PRESENT || 0) + (totals.ABSENT || 0) + (totals.LATE || 0) + (totals.LEAVE || 0);
    const attended = (totals.PRESENT || 0) + (totals.LATE || 0);
    res.json({ sessions, totals, summary: { classes: sessions.length, records: marked, attended, percentage: marked ? Number(((attended / marked) * 100).toFixed(2)) : 0 } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;
