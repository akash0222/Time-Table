export function createLoginAttemptLimiter({
  limit = 10,
  windowMs = 15 * 60 * 1000,
  maxKeys = 20000,
  now = () => Date.now()
} = {}) {
  const attempts = new Map();
  let requests = 0;

  function keyFor(req) {
    const ip = String(req.ip || "unknown").slice(0, 100);
    const username = String(req.body?.username || "").trim().toLowerCase().slice(0, 100);
    return `${ip}|${username}`;
  }

  function prune(currentTime) {
    requests += 1;
    if (attempts.size < maxKeys && requests % 100 !== 0) return;
    for (const [key, entry] of attempts) {
      if (currentTime - entry.startedAt > windowMs) attempts.delete(key);
    }
  }

  function rateLimit(res, retryAfterSeconds, currentTime) {
    const waitSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
    res.set("Retry-After", String(waitSeconds));
    return res.status(429).json({
      code: "LOGIN_RATE_LIMITED",
      message: "Too many sign-in attempts. Please wait before trying again.",
      retryAfterSeconds: waitSeconds,
      lockedUntil: new Date(currentTime + waitSeconds * 1000).toISOString()
    });
  }

  function middleware(req, res, next) {
    const key = keyFor(req);
    req.loginAttemptKey = key;
    const currentTime = now();
    prune(currentTime);

    let current = attempts.get(key);
    if (current && currentTime - current.startedAt > windowMs) {
      attempts.delete(key);
      current = null;
    }
    if (!current && attempts.size >= maxKeys) {
      return rateLimit(res, 60, currentTime);
    }
    if (current && current.count >= limit) {
      const elapsed = Math.max(0, currentTime - current.startedAt);
      const remainingSeconds = Math.ceil((windowMs - elapsed) / 1000);
      return rateLimit(res, remainingSeconds, currentTime);
    }

    // This check is intentionally read-only. Count a failure only after
    // credential verification rejects the username/password.
    return next();
  }

  function recordFailedLogin(req) {
    const key = req.loginAttemptKey || keyFor(req);
    const currentTime = now();
    const current = attempts.get(key);
    if (!current || currentTime - current.startedAt > windowMs) {
      if (!current && attempts.size >= maxKeys) return;
      attempts.set(key, { startedAt: currentTime, count: 1 });
      return;
    }
    current.count += 1;
  }

  function clearFailedLogins(req) {
    const key = req.loginAttemptKey || keyFor(req);
    attempts.delete(key);
  }

  return { middleware, recordFailedLogin, clearFailedLogins };
}
