const truthy = new Set(["1", "true", "yes", "on"]);

function isTruthy(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return truthy.has(String(value).trim().toLowerCase());
}

function required(name, { productionOnly = false, minLength = 0 } = {}) {
  const value = String(process.env[name] || "").trim();
  const configuredEnvironment = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  if (productionOnly && configuredEnvironment !== "production" && !value) return "";
  if (!value) throw new Error(`${name} must be configured.`);
  if (minLength && value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters.`);
  }
  return value;
}

const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();

const configuredMongoUri = String(process.env.MONGO_URI || "").trim();
const mongoUri = configuredMongoUri || (nodeEnv === "production" ? required("MONGO_URI", { productionOnly: true }) : "mongodb://127.0.0.1:27017/timetable_generator");

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(process.env.PORT || 5000),
  mongoUri,
  jwtSecret: required("JWT_SECRET", { productionOnly: true, minLength: 32 }) || "local-development-only-change-me",
  clientUrl: String(process.env.CLIENT_URL || "").trim(),
  corsOrigins: String(process.env.CORS_ORIGINS || process.env.CLIENT_URL || "").split(",").map(x => x.trim()).filter(Boolean),
  publicAppUrl: String(process.env.PUBLIC_APP_URL || process.env.CLIENT_URL || "").trim(),
  trustProxy: isTruthy(process.env.TRUST_PROXY, false),
  jsonBodyLimit: String(process.env.JSON_BODY_LIMIT || "2mb"),
  schedulerGenerationRuns: Math.max(1, Number(process.env.SCHEDULER_GENERATION_RUNS || 8)),
  schedulerGenerationTimeLimitMs: Math.max(500, Number(process.env.SCHEDULER_GENERATION_TIME_LIMIT_MS || 30000)),
  schedulerGenerationAttempts: Math.max(50, Number(process.env.SCHEDULER_GENERATION_ATTEMPTS || 500))
});
