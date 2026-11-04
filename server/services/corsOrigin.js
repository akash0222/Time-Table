export function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

// Vercel assigns each deployment a hostname such as
// time-table-<deployment-id>-akash-singhs-projects-db9ce447.vercel.app.
// Accept only hosts in this project's namespace; never trust arbitrary *.vercel.app origins.
const vercelProjectHost = /^time-table-[a-z0-9-]+-akash-singhs-projects-db9ce447\.vercel\.app$/i;

export function isVercelProjectOrigin(origin) {
  try {
    const parsed = new URL(String(origin || "").trim());
    return parsed.protocol === "https:" && vercelProjectHost.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(origin, configuredOrigins = new Set()) {
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && (configuredOrigins.has(normalized) || isVercelProjectOrigin(normalized)));
}
