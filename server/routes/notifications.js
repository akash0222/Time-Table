import express from "express";
import Notification from "../models/Notification.js";
import Faculty from "../models/Faculty.js";
import Section from "../models/Section.js";
import User from "../models/User.js";
import AcademicSession from "../models/AcademicSession.js";
import Timetable from "../models/Timetable.js";
import { allowRoles } from "../middleware/auth.js";
import {
  resolveNotificationSectionScope,
  buildNotificationAudienceClauses,
  canViewNotification
} from "../services/notificationAccess.js";

const router = express.Router();
const manager = allowRoles("ADMIN", "SCHEDULER");
const MANAGER_ROLES = new Set(["ADMIN", "SCHEDULER"]);
const idOf = value => String(value?._id ?? value ?? "");

function cleanTarget(body = {}) {
  const audience = String(body.audience || "ALL").toUpperCase();
  return {
    audience,
    faculty: audience === "FACULTY" ? body.faculty || null : null,
    section: audience === "SECTION" ? body.section || null : null,
    user: audience === "USER" ? body.user || null : null
  };
}

async function sectionScopeFor(req, requestedSectionId = null) {
  const role = req.user?.role;
  if (MANAGER_ROLES.has(role)) {
    return resolveNotificationSectionScope({ role }, requestedSectionId);
  }

  if (role === "VIEWER") {
    return resolveNotificationSectionScope({
      role,
      section: req.user?.section
    }, requestedSectionId);
  }

  if (role === "FACULTY") {
    const facultyId = idOf(req.user?.faculty);
    let facultySectionIds = [];
    if (facultyId) {
      const activeSession = await AcademicSession.findOne({ active: true }).select("_id").lean();
      const timetableFilter = activeSession
        ? { academicSession: activeSession._id, isCurrent: true }
        : { isCurrent: true };
      const timetable = await Timetable.findOne(timetableFilter)
        .select("entries.faculty entries.section")
        .sort({ createdAt: -1 })
        .lean();
      facultySectionIds = [...new Set((timetable?.entries || [])
        .filter(entry => idOf(entry.faculty) === facultyId)
        .map(entry => idOf(entry.section))
        .filter(Boolean))];
    }
    return resolveNotificationSectionScope({
      role,
      faculty: facultyId,
      facultySectionIds
    }, requestedSectionId);
  }

  return resolveNotificationSectionScope({ role }, requestedSectionId);
}

function audienceFilter(req, scope) {
  return buildNotificationAudienceClauses({
    role: req.user?.role,
    userId: req.user?.id,
    facultyId: req.user?.faculty
  }, scope);
}

function activeNotificationFilter(now, audienceClauses, extra = {}) {
  return {
    ...extra,
    published: true,
    startAt: { $lte: now },
    $and: [
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
      { $or: audienceClauses }
    ]
  };
}

async function visibleNotification(req, notification) {
  if (MANAGER_ROLES.has(req.user?.role)) return true;
  const scope = await sectionScopeFor(req);
  if (!scope.allowed) return false;
  return canViewNotification(notification, {
    role: req.user?.role,
    userId: req.user?.id,
    facultyId: req.user?.faculty,
    sectionIds: scope.sectionIds
  });
}

async function validateTarget(target) {
  if (!["ALL", "FACULTY", "SECTION", "USER"].includes(target.audience)) {
    return "Invalid audience.";
  }
  if (target.audience === "FACULTY" && !target.faculty) return "Select a faculty member for this audience.";
  if (target.audience === "SECTION" && !target.section) return "Select a section for this audience.";
  if (target.audience === "USER" && !target.user) return "Select a user for this audience.";
  if (target.audience === "FACULTY" && !(await Faculty.exists({ _id: target.faculty }))) return "Selected faculty was not found.";
  if (target.audience === "SECTION" && !(await Section.exists({ _id: target.section }))) return "Selected section was not found.";
  if (target.audience === "USER" && !(await User.exists({ _id: target.user }))) return "Selected user was not found.";
  return "";
}

router.get("/mine", async (req, res) => {
  try {
    const scope = await sectionScopeFor(req, req.query.sectionId || null);
    if (!scope.allowed) {
      return res.status(403).json({ message: "You can only view notifications for your assigned section or teaching assignments." });
    }
    const now = new Date();
    const rows = await Notification.find(activeNotificationFilter(now, audienceFilter(req, scope)))
      .populate("faculty", "name code")
      .populate("section", "name program semester")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.json(rows.map(notification => ({
      ...notification,
      read: (notification.readBy || []).some(item => idOf(item.user) === idOf(req.user?.id))
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/timetable-changes", async (req, res) => {
  try {
    const scope = await sectionScopeFor(req, req.query.sectionId || null);
    if (!scope.allowed) {
      return res.status(403).json({ message: "You can only view timetable changes for your assigned section or teaching assignments." });
    }
    const now = new Date();
    const rows = await Notification.find(activeNotificationFilter(now, audienceFilter(req, scope), {
      sourceType: "TIMETABLE"
    }))
      .populate("faculty", "name code")
      .populate("section", "name program semester")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(rows.map(notification => ({
      ...notification,
      read: (notification.readBy || []).some(item => idOf(item.user) === idOf(req.user?.id))
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const scope = await sectionScopeFor(req, req.query.sectionId || null);
    if (!scope.allowed) {
      return res.status(403).json({ message: "You can only count notifications for your assigned section or teaching assignments." });
    }
    const now = new Date();
    const rows = await Notification.find(activeNotificationFilter(now, audienceFilter(req, scope)))
      .select("readBy")
      .lean();
    const count = rows.filter(notification =>
      !(notification.readBy || []).some(item => idOf(item.user) === idOf(req.user?.id))
    ).length;
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    if (!await visibleNotification(req, notification)) {
      return res.status(403).json({ message: "You are not authorized to read this notification." });
    }
    if (notification.published !== true && !MANAGER_ROLES.has(req.user?.role)) {
      return res.status(404).json({ message: "Notification is not available." });
    }
    const now = new Date();
    if (!MANAGER_ROLES.has(req.user?.role) &&
      ((notification.startAt && notification.startAt > now) || (notification.endAt && notification.endAt < now))) {
      return res.status(404).json({ message: "Notification is not available." });
    }
    const alreadyRead = notification.readBy.some(item => idOf(item.user) === idOf(req.user?.id));
    if (!alreadyRead) {
      notification.readBy.push({ user: req.user.id, readAt: now });
      await notification.save();
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/read-all", async (req, res) => {
  try {
    const scope = await sectionScopeFor(req);
    if (!scope.allowed) return res.status(403).json({ message: "You are not authorized to mark these notifications as read." });
    const now = new Date();
    const rows = await Notification.find(activeNotificationFilter(now, audienceFilter(req, scope)));
    for (const notification of rows) {
      if (!notification.readBy.some(item => idOf(item.user) === idOf(req.user?.id))) {
        notification.readBy.push({ user: req.user.id, readAt: now });
      }
    }
    if (rows.length) await Promise.all(rows.map(notification => notification.save()));
    res.json({ ok: true, updated: rows.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get("/", manager, async (_req, res) => {
  try {
    const rows = await Notification.find()
      .populate("faculty", "name code")
      .populate("section", "name program semester")
      .populate("user", "name username")
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", manager, async (req, res) => {
  try {
    const { title, message, priority = "NORMAL", published = true, startAt, endAt } = req.body || {};
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Title and message are required." });
    }
    const target = cleanTarget(req.body);
    const targetError = await validateTarget(target);
    if (targetError) return res.status(400).json({ message: targetError });

    const start = startAt ? new Date(startAt) : new Date();
    const end = endAt ? new Date(endAt) : null;
    if (Number.isNaN(start.valueOf()) || (end && Number.isNaN(end.valueOf()))) {
      return res.status(400).json({ message: "Start and end must be valid dates." });
    }
    if (end && end < start) {
      return res.status(400).json({ message: "End date must be after the start date." });
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      priority,
      published: Boolean(published),
      startAt: start,
      endAt: end,
      createdBy: req.user.id,
      ...target
    });
    res.status(201).json(await Notification.findById(notification._id)
      .populate("faculty", "name code")
      .populate("section", "name program semester")
      .populate("user", "name username"));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put("/:id", manager, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found." });

    const body = {};
    for (const key of ["title", "message", "priority", "published", "startAt", "endAt"]) {
      if (req.body[key] !== undefined) body[key] = req.body[key];
    }

    // A partial edit must not silently reset a targeted announcement to ALL.
    const hasTargetChange = ["audience", "faculty", "section", "user"].some(key => req.body[key] !== undefined);
    if (hasTargetChange) {
      const target = cleanTarget({ ...notification.toObject(), ...req.body });
      const targetError = await validateTarget(target);
      if (targetError) return res.status(400).json({ message: targetError });
      Object.assign(body, target);
    }

    if (body.title !== undefined && !String(body.title).trim()) return res.status(400).json({ message: "Title is required." });
    if (body.message !== undefined && !String(body.message).trim()) return res.status(400).json({ message: "Message is required." });
    if (body.startAt !== undefined) body.startAt = new Date(body.startAt);
    if (body.endAt !== undefined) body.endAt = body.endAt ? new Date(body.endAt) : null;
    if (body.startAt && Number.isNaN(body.startAt.valueOf())) return res.status(400).json({ message: "Start date must be valid." });
    if (body.endAt && Number.isNaN(body.endAt.valueOf())) return res.status(400).json({ message: "End date must be valid." });
    const nextStart = body.startAt ?? notification.startAt;
    const nextEnd = body.endAt !== undefined ? body.endAt : notification.endAt;
    if (nextEnd && nextStart && nextEnd < nextStart) return res.status(400).json({ message: "End date must be after the start date." });

    Object.assign(notification, body);
    await notification.save();
    res.json(await Notification.findById(notification._id)
      .populate("faculty", "name code")
      .populate("section", "name program semester")
      .populate("user", "name username"));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/:id", manager, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
