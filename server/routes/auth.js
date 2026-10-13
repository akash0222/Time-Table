import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth, signUser } from "../middleware/auth.js";

const router = express.Router();

const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const configuredLimit = Number(process.env.LOGIN_MAX_ATTEMPTS);
const LOGIN_LIMIT = Number.isInteger(configuredLimit) && configuredLimit >= 5 && configuredLimit <= 100
  ? configuredLimit
  : process.env.NODE_ENV === "production" ? 10 : 100;
const LOGIN_MAX_KEYS = 20000;

function sendLoginRateLimit(res, retryAfterSeconds) {
  const waitSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
  res.set("Retry-After", String(waitSeconds));
  return res.status(429).json({
    code: "LOGIN_RATE_LIMITED",
    message: "Too many sign-in attempts. Please wait before trying again.",
    retryAfterSeconds: waitSeconds,
    lockedUntil: new Date(Date.now() + waitSeconds * 1000).toISOString()
  });
}
let limiterRequests = 0;

function pruneLoginAttempts(now) {
  limiterRequests += 1;
  if (loginAttempts.size < LOGIN_MAX_KEYS && limiterRequests % 100 !== 0) return;
  for (const [key, entry] of loginAttempts) {
    if (now - entry.startedAt > LOGIN_WINDOW_MS) loginAttempts.delete(key);
  }
}

function loginAttemptKeyFor(req) {
  const ip = String(req.ip || "unknown").slice(0, 100);
  const username = String(req.body?.username || "").trim().toLowerCase().slice(0, 100);
  return `${ip}|${username}`;
}

function loginLimiter(req, res, next) {
  const key = loginAttemptKeyFor(req);
  req.loginAttemptKey = key;
  const now = Date.now();
  pruneLoginAttempts(now);

  let current = loginAttempts.get(key);
  if (current && now - current.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    current = null;
  }
  if (!current && loginAttempts.size >= LOGIN_MAX_KEYS) {
    return sendLoginRateLimit(res, 60);
  }
  if (current && current.count >= LOGIN_LIMIT) {
    const elapsed = Math.max(0, now - current.startedAt);
    const remainingSeconds = Math.ceil((LOGIN_WINDOW_MS - elapsed) / 1000);
    return sendLoginRateLimit(res, remainingSeconds);
  }

  // Only rejected credentials are counted below. A backend or database error
  // must not consume a user's password-attempt allowance.
  next();
}

function recordFailedLogin(req) {
  const key = req.loginAttemptKey || loginAttemptKeyFor(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.startedAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { startedAt: now, count: 1 });
    return;
  }
  current.count += 1;
}

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await User.findOne({ username }).populate("faculty").populate("section");
    if (!user || user.active === false || !(await bcrypt.compare(password, user.passwordHash))) {
      recordFailedLogin(req);
      return res.status(401).json({ message: "Invalid username or password." });
    }
    // A successful authentication clears the failed-attempt bucket for this
    // IP and username so old mistakes do not lock out a legitimate sign-in.
    if (req.loginAttemptKey) loginAttempts.delete(req.loginAttemptKey);
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
