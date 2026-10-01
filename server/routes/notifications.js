import express from "express";
import Notification from "../models/Notification.js";
import Faculty from "../models/Faculty.js";
import Section from "../models/Section.js";
import User from "../models/User.js";
import { allowRoles } from "../middleware/auth.js";

const router = express.Router();
const manager = allowRoles("ADMIN", "SCHEDULER");

function cleanTarget(body) {
  const audience = String(body.audience || "ALL").toUpperCase();
  return {
    audience,
    faculty: audience === "FACULTY" ? body.faculty || null : null,
    section: audience === "SECTION" ? body.section || null : null,
    user: audience === "USER" ? body.user || null : null
  };
}

router.get("/mine", async (req, res) => {
  try {
    const now = new Date();
    const sectionId = req.query.sectionId || null;
    const role = req.user.role;
    const userId = req.user.id;
    const facultyId = req.user.faculty || null;
    const or = [
      { audience: "ALL" },
      { audience: "USER", user: userId }
    ];
    if (["ADMIN", "SCHEDULER"].includes(role)) {
      or.push({ audience: "FACULTY" }, { audience: "SECTION" });
    }
    if (role === "FACULTY" && facultyId) or.push({ audience: "FACULTY", faculty: facultyId });
    if (sectionId) or.push({ audience: "SECTION", section: sectionId });

    const rows = await Notification.find({
      published: true,
      startAt: { $lte: now },
      $or: [
        { endAt: null },
        { endAt: { $gte: now } }
      ],
      $and: [{ $or: or }]
    }).populate("faculty", "name code")
      .populate("section", "name program semester")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json(rows.map(n => ({
      ...n,
      read: (n.readBy || []).some(x => String(x.user) === String(userId))
    })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});


router.get("/timetable-changes", async (req, res) => {
  try {
    const now = new Date();
    const role = req.user.role;
    const userId = req.user.id;
    const facultyId = req.user.faculty || null;
    const sectionId = req.query.sectionId || null;
    const or = [{ audience: "USER", user: userId }];
    if (role === "FACULTY" && facultyId) or.push({ audience: "FACULTY", faculty: facultyId });
    if (sectionId) or.push({ audience: "SECTION", section: sectionId });
    if (["ADMIN", "SCHEDULER"].includes(role)) {
      or.push({ audience: "ALL" });
    }
    const rows = await Notification.find({
      published: true,
      sourceType: "TIMETABLE",
      startAt: { $lte: now },
      $and: [
        { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
        { $or: or }
      ]
    }).populate("faculty", "name code")
      .populate("section", "name program semester")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(rows.map(n => ({
      ...n,
      read: (n.readBy || []).some(x => String(x.user) === String(userId))
    })));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/unread-count", async (req, res) => {
  try {
    const now = new Date();
    const sectionId = req.query.sectionId || null;
    const or = [{ audience: "ALL" }, { audience: "USER", user: req.user.id }];
    if (req.user.role === "FACULTY" && req.user.faculty) or.push({ audience: "FACULTY", faculty: req.user.faculty });
    if (sectionId) or.push({ audience: "SECTION", section: sectionId });
    const rows = await Notification.find({ published: true, startAt: { $lte: now }, $or: [{ endAt: null }, { endAt: { $gte: now } }], $and: [{ $or: or }] }).select("readBy").lean();
    const count = rows.filter(n => !(n.readBy || []).some(x => String(x.user) === String(req.user.id))).length;
    res.json({ count });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/:id/read", async (req, res) => {
  try {
    const n = await Notification.findById(req.params.id);
    if (!n) return res.status(404).json({ message: "Notification not found." });
    const exists = n.readBy.some(x => String(x.user) === String(req.user.id));
    if (!exists) { n.readBy.push({ user: req.user.id, readAt: new Date() }); await n.save(); }
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.post("/read-all", async (req, res) => {
  try {
    const now = new Date();
    const rows = await Notification.find({ published: true, startAt: { $lte: now }, $or: [{ endAt: null }, { endAt: { $gte: now } }] });
    for (const n of rows) {
      if (!n.readBy.some(x => String(x.user) === String(req.user.id))) n.readBy.push({ user: req.user.id });
    }
    if (rows.length) await Promise.all(rows.map(n => n.save()));
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.get("/", manager, async (_req, res) => {
  try {
    const rows = await Notification.find().populate("faculty", "name code").populate("section", "name program semester").populate("user", "name username").sort({ createdAt: -1 }).lean();
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", manager, async (req, res) => {
  try {
    const { title, message, priority = "NORMAL", published = true, startAt, endAt } = req.body;
    if (!title?.trim() || !message?.trim()) return res.status(400).json({ message: "Title and message are required." });
    const target = cleanTarget(req.body);
    if (!["ALL", "FACULTY", "SECTION", "USER"].includes(target.audience)) return res.status(400).json({ message: "Invalid audience." });
    if (target.audience === "FACULTY" && !(await Faculty.exists({ _id: target.faculty }))) return res.status(400).json({ message: "Selected faculty was not found." });
    if (target.audience === "SECTION" && !(await Section.exists({ _id: target.section }))) return res.status(400).json({ message: "Selected section was not found." });
    if (target.audience === "USER" && !(await User.exists({ _id: target.user }))) return res.status(400).json({ message: "Selected user was not found." });
    const n = await Notification.create({ title: title.trim(), message: message.trim(), priority, published: Boolean(published), startAt: startAt || new Date(), endAt: endAt || null, createdBy: req.user.id, ...target });
    res.status(201).json(await Notification.findById(n._id).populate("faculty", "name code").populate("section", "name program semester").populate("user", "name username"));
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.put("/:id", manager, async (req, res) => {
  try {
    const body = {};
    for (const k of ["title", "message", "priority", "published", "startAt", "endAt"]) if (req.body[k] !== undefined) body[k] = req.body[k];
    Object.assign(body, cleanTarget(req.body));
    const n = await Notification.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).populate("faculty", "name code").populate("section", "name program semester").populate("user", "name username");
    if (!n) return res.status(404).json({ message: "Notification not found." });
    res.json(n);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

router.delete("/:id", manager, async (req, res) => {
  try { const n = await Notification.findByIdAndDelete(req.params.id); if (!n) return res.status(404).json({ message: "Notification not found." }); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ message: e.message }); }
});

export default router;
