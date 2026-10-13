import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth, signUser } from "../middleware/auth.js";
import { createLoginAttemptLimiter } from "../services/loginRateLimit.js";

const router = express.Router();

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
// The production security policy is fixed: five failed credentials trigger lockout.
 // Do not let an environment override silently weaken this agreed threshold.
const LOGIN_LIMIT = 5;
const LOGIN_MAX_KEYS = 20000;
const {
  middleware: loginLimiter,
  recordFailedLogin,
  clearFailedLogins
} = createLoginAttemptLimiter({
  limit: LOGIN_LIMIT,
  windowMs: LOGIN_WINDOW_MS,
  maxKeys: LOGIN_MAX_KEYS
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await User.findOne({ username }).populate("faculty").populate("section");
    if (!user || user.active === false || !(await bcrypt.compare(password, user.passwordHash))) {
      const attempt = recordFailedLogin(req);
      if (attempt?.locked) {
        res.set("Retry-After", String(attempt.retryAfterSeconds));
        return res.status(429).json({
          code: "LOGIN_RATE_LIMITED",
          message: "Too many failed sign-in attempts. Sign-in is locked for 5 minutes.",
          attemptsUsed: attempt.count,
          attemptsRemaining: 0,
          retryAfterSeconds: attempt.retryAfterSeconds,
          lockedUntil: new Date(Date.now() + attempt.retryAfterSeconds * 1000).toISOString()
        });
      }
      return res.status(401).json({
        message: "Invalid username or password.",
        attemptsUsed: attempt?.count ?? null,
        attemptsRemaining: attempt?.remaining ?? null,
        messageDetail: Number.isInteger(attempt?.remaining)
          ? attempt.remaining > 0
            ? `${attempt.remaining} failed sign-in attempt(s) remaining before a 5-minute lockout.`
            : "Sign-in is temporarily locked for 5 minutes."
          : undefined
      });
    }
    // A successful authentication clears the failed-attempt bucket for this
    // IP and username so old mistakes do not lock out a legitimate sign-in.
    clearFailedLogins(req);
    const token = signUser(user);
    res.json({ token, user: { id: user._id, name: user.name, username: user.username, role: user.role, faculty: user.faculty, section: user.section } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).populate("faculty").populate("section").select("-passwordHash");
  if (!user || user.active === false) return res.status(401).json({ message: "User account is inactive." });
  res.json({ user });
});

router.get("/users", requireAuth, async (req, res) => {
  if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Only administrators can view users." });
  const users = await User.find().populate("faculty", "name code").populate("section", "name program semester").select("-passwordHash").sort({ createdAt: -1 });
  res.json(users);
});

router.post("/users", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Only administrators can create users." });
    const { name, username, password, role, faculty, section } = req.body;
    if (!name || !username || !password) return res.status(400).json({ message: "Name, username and password are required." });
    if (String(password).length < 10) return res.status(400).json({ message: "Password must contain at least 10 characters." });
    const normalizedUsername = String(username).trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,50}$/.test(normalizedUsername)) return res.status(400).json({ message: "Username may contain only letters, numbers, dot, underscore and hyphen." });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, username: normalizedUsername, passwordHash, role, faculty: faculty || null, section: section || null });
    res.status(201).json({ id: user._id, name: user.name, username: user.username, role: user.role, faculty: user.faculty, section: user.section });
  } catch (e) { res.status(400).json({ message: e.code === 11000 ? "Username already exists." : e.message }); }
});

router.put("/users/:id", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") return res.status(403).json({ message: "Only administrators can update users." });
    const body = {};
    for (const k of ["name", "role", "faculty", "section", "active"]) if (req.body[k] !== undefined) body[k] = req.body[k];
    if (req.body.password) {
      if (String(req.body.password).length < 10) return res.status(400).json({ message: "Password must contain at least 10 characters." });
      body.passwordHash = await bcrypt.hash(req.body.password, 12);
    }
    const user = await User.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found." });
    res.json(user);
  } catch (e) { res.status(400).json({ message: e.message }); }
});

export default router;
