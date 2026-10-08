import process from "node:process";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");

let passed = 0;
const failures = [];
let token = "";

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { ...options, headers });
  const type = response.headers.get("content-type") || "";
  let body = null;
  try { body = type.includes("application/json") ? await response.json() : await response.text(); }
  catch { body = null; }
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

console.log(`Time Table QA\nTarget: ${base}\n`);

try {
  const health = await request("/api/health");
  check("Health", health.response.status === 200 && health.body?.ok === true, `HTTP ${health.response.status}`);

  const protectedBeforeLogin = await request("/api/faculty");
  check("Protected API rejects anonymous request", protectedBeforeLogin.response.status === 401, `HTTP ${protectedBeforeLogin.response.status}`);

  const missingRoute = await request("/api/not-a-real-endpoint");
  check("Unknown API route returns JSON 404", missingRoute.response.status === 404 && missingRoute.body?.message === "API endpoint not found.", `HTTP ${missingRoute.response.status}`);

  if (!password) {
    console.log("INFO  Login checks skipped: set QA_ADMIN_PASSWORD.");
  } else {
    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    check("Admin login", login.response.status === 200 && Boolean(login.body?.token), `HTTP ${login.response.status}`);
    token = login.body?.token || "";

    if (token) {
      const me = await request("/api/auth/me");
      check("Authenticated /me", me.response.status === 200 && me.body?.user?.username === username);

      const endpoints = [
        ["/api/faculty", x => x.response.status === 200 && Array.isArray(x.body), "Faculty"],
        ["/api/sections", x => x.response.status === 200 && Array.isArray(x.body), "Sections"],
        ["/api/subjects", x => x.response.status === 200 && Array.isArray(x.body), "Subjects"],
        ["/api/rooms", x => x.response.status === 200 && Array.isArray(x.body), "Rooms"],
        ["/api/timeslots", x => x.response.status === 200 && Array.isArray(x.body), "Time Slots"],
        ["/api/sessions", x => x.response.status === 200 && Array.isArray(x.body), "Academic Sessions"],
        ["/api/settings", x => x.response.status === 200 && typeof x.body === "object", "Scheduler Settings"]
      ];
      for (const [path, predicate, label] of endpoints) {
        const result = await request(path);
        check(`Authenticated ${label} read`, predicate(result), `HTTP ${result.response.status}`);
      }

      const missingSession = await request("/api/timetable/readiness");
      check("Timetable readiness requires session", missingSession.response.status === 400, `HTTP ${missingSession.response.status}`);
    }
  }
} catch (error) {
  failures.push(error.message);
  console.error("ERROR", error.stack || error.message);
}

console.log(`\nResult: ${passed} passed, ${failures.length} failed.`);
if (failures.length) process.exitCode = 1;
