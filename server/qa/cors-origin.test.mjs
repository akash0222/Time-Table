import assert from "node:assert/strict";
import { isAllowedCorsOrigin, isVercelProjectOrigin, normalizeOrigin } from "../services/corsOrigin.js";

const configured = new Set([
  "https://time-table-beige-three.vercel.app",
  "https://time-table-t8t9.onrender.com"
]);

assert.equal(normalizeOrigin("https://time-table-beige-three.vercel.app/"), "https://time-table-beige-three.vercel.app");
assert.equal(normalizeOrigin("http://localhost:5173"), "http://localhost:5173");
assert.equal(normalizeOrigin("http://example.com"), "");
assert.equal(normalizeOrigin("not a url"), "");

assert.equal(isAllowedCorsOrigin("https://time-table-beige-three.vercel.app", configured), true);
assert.equal(isAllowedCorsOrigin("https://time-table-240wlss1t-akash-singhs-projects-db9ce447.vercel.app", configured), true);
assert.equal(isAllowedCorsOrigin("https://time-table-git-main-akash-singhs-projects-db9ce447.vercel.app", configured), true);
assert.equal(isVercelProjectOrigin("https://time-table-240wlss1t-akash-singhs-projects-db9ce447.vercel.app"), true);
assert.equal(isVercelProjectOrigin("https://someone-else-abc123.vercel.app"), false);
assert.equal(isAllowedCorsOrigin("https://malicious.vercel.app", configured), false);
assert.equal(isAllowedCorsOrigin("http://time-table-240wlss1t-akash-singhs-projects-db9ce447.vercel.app", configured), false);
assert.equal(isAllowedCorsOrigin("https://my-other-project-240wlss1t-akash-singhs-projects-db9ce447.vercel.app", configured), false);
assert.equal(isAllowedCorsOrigin("http://localhost:5173", new Set()), false);

console.log("CORS origin allowlist regression tests passed.");
