import assert from "node:assert/strict";
import { createLoginAttemptLimiter } from "../services/loginRateLimit.js";

const WINDOW = 15 * 60 * 1000;
let now = 1_800_000_000_000;
let passed = 0;

function setup(options = {}) {
  const limiter = createLoginAttemptLimiter({
    limit: options.limit ?? 2,
    windowMs: options.windowMs ?? WINDOW,
    maxKeys: options.maxKeys ?? 100,
    now: () => now
  });
  return limiter;
}

function request(limiter, {ip = "203.0.113.10", username = "admin"} = {}) {
  const req = {ip, body: {username}};
  const headers = {};
  let status = 200;
  let body = null;
  let nextCalled = false;
  const res = {
    set(name, value) { headers[name] = value; return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; }
  };
  limiter.middleware(req, res, () => { nextCalled = true; });
  return {req, headers, status, body, nextCalled};
}

function check(name, fn) {
  fn();
  passed += 1;
  console.log("PASS  " + name);
}

check("requests pass without consuming attempts until credentials fail", () => {
  const limiter = setup({limit: 2});
  const first = request(limiter);
  const second = request(limiter);
  const third = request(limiter);
  assert.equal(first.nextCalled, true);
  assert.equal(second.nextCalled, true);
  assert.equal(third.nextCalled, true);
  limiter.recordFailedLogin(first.req);
  limiter.recordFailedLogin(second.req);
  const blocked = request(limiter);
  assert.equal(blocked.status, 429);
});

check("lockout starts only after configured failed credential count", () => {
  const limiter = setup({limit: 5});
  for (let i = 0; i < 5; i++) {
    const attempt = request(limiter);
    assert.equal(attempt.nextCalled, true);
    limiter.recordFailedLogin(attempt.req);
  }
  const blocked = request(limiter);
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, "LOGIN_RATE_LIMITED");
  assert.equal(blocked.headers["Retry-After"], "900");
  assert.equal(blocked.body.retryAfterSeconds, 900);
  assert.equal(Date.parse(blocked.body.lockedUntil), now + WINDOW);
});

check("wait duration decreases as the failure window ages", () => {
  const limiter = setup({limit: 1});
  const attempt = request(limiter);
  limiter.recordFailedLogin(attempt.req);
  now += 60_500;
  const blocked = request(limiter);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.retryAfterSeconds, 840);
  assert.equal(blocked.headers["Retry-After"], "840");
});

check("successful authentication clears the failed-attempt count", () => {
  const limiter = setup({limit: 2});
  const first = request(limiter);
  limiter.recordFailedLogin(first.req);
  const second = request(limiter);
  limiter.recordFailedLogin(second.req);
  limiter.clearFailedLogins(second.req);
  assert.equal(request(limiter).nextCalled, true);
});

check("attempt buckets are isolated by IP and normalized username", () => {
  const limiter = setup({limit: 1});
  const first = request(limiter, {ip:"198.51.100.1",username:"Admin"});
  limiter.recordFailedLogin(first.req);
  assert.equal(request(limiter, {ip:"198.51.100.1",username:"admin"}).status, 429);
  assert.equal(request(limiter, {ip:"198.51.100.2",username:"admin"}).nextCalled, true);
  assert.equal(request(limiter, {ip:"198.51.100.1",username:"student"}).nextCalled, true);
});

check("attempt bucket expires after its time window", () => {
  const limiter = setup({limit: 1});
  const first = request(limiter);
  limiter.recordFailedLogin(first.req);
  assert.equal(request(limiter).status, 429);
  now += WINDOW + 1;
  assert.equal(request(limiter).nextCalled, true);
});

check("capacity protection rejects new keys without growing the map", () => {
  const limiter = setup({limit: 2, maxKeys: 1});
  const first = request(limiter, {username:"admin"});
  limiter.recordFailedLogin(first.req);
  const other = request(limiter, {username:"student"});
  assert.equal(other.status, 429);
  assert.equal(other.body.code, "LOGIN_RATE_LIMITED");
});

console.log(`\nResult: ${passed} login rate-limit regression checks passed.`);
