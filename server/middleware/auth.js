import jwt from "jsonwebtoken";
import { hasPermission } from "../config/permissions.js";

const isProduction = process.env.NODE_ENV === "production";
const secret = process.env.JWT_SECRET || (isProduction ? "" : "local-timetable-secret-change-me");

if (isProduction && secret.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters in production.");
}

export function signUser(user) {
  return jwt.sign({ id: user._id.toString(), username: user.username, role: user.role, name: user.name, faculty: user.faculty ? (user.faculty._id || user.faculty).toString() : null }, secret, { expiresIn: "8h" });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Authentication required." });
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ message: "Session expired. Please login again." });
  }
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
