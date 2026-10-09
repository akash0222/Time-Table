import process from "node:process";

const base = String(process.env.QA_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const username = String(process.env.QA_ADMIN_USERNAME || "admin").trim().toLowerCase();
const password = String(process.env.QA_ADMIN_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD || "");
const allowMutation = String(process.env.QA_ALLOW_WORKFLOW_MUTATION || "").trim().toLowerCase() === "true";
const hostname = (() => { try { return new URL(base).hostname; } catch { return ""; } })();

let token = "";
let passed = 0;
let skipped = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log("PASS  " + name + (detail ? " — " + detail : ""));
  } else {
    failures.push(name);
    console.error("FAIL  " + name + (detail ? " — " + detail : ""));
  }
}

function skip(name, detail = "") {
  skipped += 1;
  console.log("SKIP  " + name + (detail ? " — " + detail : ""));
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(base + path, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach " + base + ". Start the backend and verify MongoDB/env configuration. " + error.message);
  }
  const contentType = response.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    try { body = await response.json(); } catch {}
  } else {
    try { body = await response.text(); } catch {}
  }
  return { response, body };
}

async function getStatus(sessionId) {
  const result = await request("/api/timetable/status?sessionId=" + encodeURIComponent(sessionId));
  if (result.response.status !== 200) {
    throw new Error("Unable to read timetable status: HTTP " + result.response.status);
  }
  return String(result.body?.status || "DRAFT");
}

async function transition(sessionId, status, note = "QA workflow regression test") {
  return request("/api/timetable/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note, sessionId })
  });
}

async function returnToDraft(sessionId) {
  // Cleanup follows only legal transitions and uses remarks where required.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await getStatus(sessionId);
    if (current === "DRAFT") return true;
    let target = "";
    if (current === "SUBMITTED") target = "DRAFT";
    else if (current === "APPROVED") target = "SUBMITTED";
    else if (current === "PUBLISHED") target = "DRAFT";
    else if (current === "LOCKED") target = "PUBLISHED";
    else return false;

    const result = await transition(sessionId, target, "QA cleanup: restore original DRAFT status");
    if (result.response.status !== 200) {
      console.error("CLEANUP WARNING — " + current + " -> " + target + " returned HTTP " + result.response.status);
      return false;
    }
  }
  return (await getStatus(sessionId)) === "DRAFT";
}

console.log("Time Table workflow regression checks\nTarget: " + base + "\n");
console.log("Safety note: this test temporarily changes the current timetable status and appends approval/audit history. It restores DRAFT at the end.\n");

if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  skip("Workflow mutation test", "Only allowed against localhost. Current host: " + (hostname || "invalid URL"));
} else if (!allowMutation) {
  skip("Workflow mutation test", 'Set $env:QA_ALLOW_WORKFLOW_MUTATION="true" to explicitly allow a local status-change test.');
} else if (!password) {
  failures.push("Admin password configured");
  console.error("FAIL  Admin password configured — set QA_ADMIN_PASSWORD or DEFAULT_ADMIN_PASSWORD.");
} else {
  try {
    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    check("Admin login", login.response.status === 200 && Boolean(login.body?.token), "HTTP " + login.response.status);
    token = login.body?.token || "";

    if (token) {
      const active = await request("/api/sessions/active");
      check("Active session read", active.response.status === 200, "HTTP " + active.response.status);
      const sessionId = String(active.body?._id || "");

      if (!sessionId) {
        skip("Workflow transitions", "No active academic session.");
      } else {
        const latest = await request("/api/timetable/latest?sessionId=" + encodeURIComponent(sessionId));
        check("Current timetable read", latest.response.status === 200, "HTTP " + latest.response.status);
        const entries = Array.isArray(latest.body?.entries) ? latest.body.entries : [];

        if (!entries.length) {
          skip("Workflow transitions", "No current timetable entries exist for the active session.");
        } else {
          const initialStatus = await getStatus(sessionId);
          if (initialStatus !== "DRAFT") {
            skip("Workflow transitions", "Timetable must start in DRAFT; current status is " + initialStatus + ". No status changes were made.");
          } else {
            let reachedMutation = false;
            try {
              const illegal = await transition(sessionId, "APPROVED", "QA invalid transition check");
              check("Illegal DRAFT -> APPROVED is rejected",
                illegal.response.status === 409 && await getStatus(sessionId) === "DRAFT",
                "HTTP " + illegal.response.status);

              const submit = await transition(sessionId, "SUBMITTED", "QA workflow submit");
              check("DRAFT -> SUBMITTED",
                submit.response.status === 200 && submit.body?.timetable?.status === "SUBMITTED",
                "HTTP " + submit.response.status);
              reachedMutation = submit.response.status === 200;

              if (reachedMutation) {
                const noApprovalNote = await transition(sessionId, "APPROVED", "");
                check("Approval without remarks is rejected",
                  noApprovalNote.response.status === 400 && await getStatus(sessionId) === "SUBMITTED",
                  "HTTP " + noApprovalNote.response.status);

                const approve = await transition(sessionId, "APPROVED", "QA workflow approval");
                check("SUBMITTED -> APPROVED",
                  approve.response.status === 200 && approve.body?.timetable?.status === "APPROVED",
                  "HTTP " + approve.response.status);

                if (approve.response.status === 200) {
                  const noPublishNote = await transition(sessionId, "PUBLISHED", "");
                  check("Publication without remarks is rejected",
                    noPublishNote.response.status === 400 && await getStatus(sessionId) === "APPROVED",
                    "HTTP " + noPublishNote.response.status);

                  const publish = await transition(sessionId, "PUBLISHED", "QA workflow publish");
                  check("APPROVED -> PUBLISHED",
                    publish.response.status === 200 && publish.body?.timetable?.status === "PUBLISHED",
                    "HTTP " + publish.response.status);

                  if (publish.response.status === 200) {
                    const lock = await transition(sessionId, "LOCKED", "QA workflow lock");
                    check("PUBLISHED -> LOCKED",
                      lock.response.status === 200 && lock.body?.timetable?.status === "LOCKED",
                      "HTTP " + lock.response.status);

                    if (lock.response.status === 200) {
                      const unlock = await transition(sessionId, "PUBLISHED", "QA workflow unlock");
                      check("LOCKED -> PUBLISHED",
                        unlock.response.status === 200 && unlock.body?.timetable?.status === "PUBLISHED",
                        "HTTP " + unlock.response.status);
                    }
                  }
                }
              }
            } finally {
              const restored = await returnToDraft(sessionId).catch(() => false);
              check("Cleanup restores DRAFT status", restored, restored ? "Final status DRAFT" : "Manual status recovery may be required");
            }
          }
        }
      }
    }
  } catch (error) {
    failures.push(error.message);
    console.error("ERROR  " + error.message);
  }
}

console.log("\nResult: " + passed + " passed, " + skipped + " skipped, " + failures.length + " failed.");
if (failures.length) process.exitCode = 1;
