import process from "node:process";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin");
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD);
const strictLogin = String(process.env.QA_REQUIRE_LOGIN || "true").toLowerCase() !== "false";

const failures = [];
let passed = 0;
let token = "";

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  let body = null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    try { body = await response.json(); } catch { body = null; }
  } else {
    try { body = await response.text(); } catch { body = null; }
  }
  return { response, body };
}

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log(`TimeTable Pro QA smoke test\nTarget: ${base}\n`);

try {
  const health = await request("/api/health");
  check("Health endpoint", health.response.status === 200 && health.body?.ok === true, `HTTP ${health.response.status}`);
  check("Health database state", ["connected", "disconnected"].includes(health.body?.database), String(health.body?.database));

  const readiness = await request("/api/readiness");
  check("Readiness endpoint responds", [200, 503].includes(readiness.response.status), `HTTP ${readiness.response.status}`);
  check("Readiness payload", typeof readiness.body?.ok === "boolean" && ["connected", "disconnected"].includes(readiness.body?.database), JSON.stringify(readiness.body));

  const publicApi = await request("/api/not-a-real-endpoint");
  check("Unknown API returns JSON 404", publicApi.response.status === 404 && publicApi.body?.message === "API endpoint not found.", `HTTP ${publicApi.response.status}`);

  const protectedBeforeLogin = await request("/api/faculty");
  check("Protected Master Data rejects anonymous request", protectedBeforeLogin.response.status === 401, `HTTP ${protectedBeforeLogin.response.status}`);

  const publicShare = await request("/api/public/share/not-a-real-token");
  check("Public share route remains reachable", [404, 400].includes(publicShare.response.status), `HTTP ${publicShare.response.status}`);

  if (strictLogin) {
    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    check("Admin login", login.response.status === 200 && Boolean(login.body?.token), `HTTP ${login.response.status}`);
    if (login.body?.token) token = login.body.token;

    if (token) {
      const me = await request("/api/auth/me");
      check("Authenticated /me", me.response.status === 200 && me.body?.user?.username === username.toLowerCase(), `HTTP ${me.response.status}`);

      const faculty = await request("/api/faculty");
      check("Authenticated Master Data read", faculty.response.status === 200 && Array.isArray(faculty.body), `HTTP ${faculty.response.status}`);

      const structure = await request("/api/academic-structure");
      check("Academic Structure endpoint", structure.response.status === 200 && Array.isArray(structure.body?.programs), `HTTP ${structure.response.status}`);

      const sessions = await request("/api/sessions");
      check("Academic Sessions endpoint", sessions.response.status === 200 && Array.isArray(sessions.body), `HTTP ${sessions.response.status}`);

      const settings = await request("/api/settings");
      check("Scheduler settings endpoint", settings.response.status === 200 && typeof settings.body === "object", `HTTP ${settings.response.status}`);

      const readinessWithoutSession = await request("/api/timetable/readiness");
      check("Timetable readiness validates missing session", readinessWithoutSession.response.status === 400, `HTTP ${readinessWithoutSession.response.status}`);

      const analytics = await request("/api/analytics");
      check("Analytics endpoint", analytics.response.status === 200, `HTTP ${analytics.response.status}`);

      const shareLinks = await request("/api/share-links");
      check("Share links endpoint", shareLinks.response.status === 200 && Array.isArray(shareLinks.body), `HTTP ${shareLinks.response.status}`);

      const exportExcel = await request("/api/timetable/export/excel");
      check("Excel export route", [200, 404].includes(exportExcel.response.status), `HTTP ${exportExcel.response.status}`);
    }
  } else {
    console.log("INFO  Login tests skipped because QA_REQUIRE_LOGIN=false");
  }
} catch (error) {
  failures.push(`QA runtime error: ${error.message}`);
  console.error(`ERROR ${error.stack || error.message}`);
}

console.log(`\nQA result: ${passed} passed, ${failures.length} failed.`);
if (failures.length) {
  console.error("Failed checks:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("All automated smoke checks passed.");
}
