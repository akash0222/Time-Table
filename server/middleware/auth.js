import jwt from "jsonwebtoken";
import { hasPermission } from "../config/permissions.js";
import { env } from "../config/env.js";
import User from "../models/User.js";

const secret = env.jwtSecret;

export function signUser(user) {
  return jwt.sign({
    id: user._id.toString(),
    username: user.username,
    role: user.role,
    name: user.name,
    faculty: user.faculty ? (user.faculty._id || user.faculty).toString() : null
  }, secret, { expiresIn: "8h", algorithm: "HS256" });
}

function normalizedId(value) {
  return value == null ? null : String(value?._id ?? value);
}

export function currentUserClaims(user) {
  return {
    id: String(user._id),
    username: user.username,
    role: user.role,
    name: user.name,
    faculty: normalizedId(user.faculty),
    section: normalizedId(user.section)
  };
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });

  let payload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ message: "Session expired. Please login again." });
  }

  let user;
  try {
    // Account roles, status and faculty/section mappings can change while a
    // token is still valid. Resolve them from the database on every request
    // instead of trusting stale authorization claims from an earlier login.
    user = await User.findById(payload.id)
      .select("_id username role name faculty section active")
      .lean();
  } catch (error) {
    console.error("Authentication account lookup failed:", error.message);
    return res.status(503).json({ message: "Unable to verify your account right now. Please try again." });
  }

  if (!user || user.active === false) {
    return res.status(401).json({ message: "User account is inactive or no longer available. Please sign in again." });
  }

  req.user = currentUserClaims(user);
  return next();
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission for this action." });
    next();
  };
}

export function allowPermission(permission) {
  return (req, res, next) => {
    if (!req.user || !hasPermission(req.user.role, permission)) {
      return res.status(403).json({ message: "You do not have permission for this action." });
    }
    next();
  };
}
