export function createLoginAttemptLimiter({
  limit = 5,
  windowMs = 5 * 60 * 1000,
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
      const expiredLock = !entry.lockedUntil || entry.lockedUntil <= currentTime;
      const expiredWindow = currentTime - entry.startedAt >= windowMs;
      if (expiredLock && expiredWindow) attempts.delete(key);
    }
  }

  function rateLimit(res, retryAfterSeconds, currentTime) {
    const waitSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 60));
    res.set("Retry-After", String(waitSeconds));
    return res.status(429).json({
      code: "LOGIN_RATE_LIMITED",
      message: "Too many failed sign-in attempts. Sign-in is locked for 5 minutes.",
      attemptsUsed: limit,
      attemptsRemaining: 0,
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
    if (current?.lockedUntil && current.lockedUntil > currentTime) {
      return rateLimit(res, Math.ceil((current.lockedUntil - currentTime) / 1000), currentTime);
    }
    if (current && current.lockedUntil && current.lockedUntil <= currentTime) {
      attempts.delete(key);
      current = null;
    }
    if (current && currentTime - current.startedAt >= windowMs) {
      attempts.delete(key);
      current = null;
    }
    if (!current && attempts.size >= maxKeys) {
      return rateLimit(res, 60, currentTime);
    }

    return next();
  }

  function recordFailedLogin(req) {
    const key = req.loginAttemptKey || keyFor(req);
    const currentTime = now();
    let current = attempts.get(key);

    if (!current || currentTime - current.startedAt >= windowMs || (current.lockedUntil && current.lockedUntil <= currentTime)) {
      if (!current && attempts.size >= maxKeys) {
        return { count: limit, remaining: 0, locked: true, retryAfterSeconds: 60 };
      }
      current = { startedAt: currentTime, count: 0, lockedUntil: null };
      attempts.set(key, current);
    }

    current.count += 1;
    const remaining = Math.max(0, limit - current.count);
    const locked = current.count >= limit;
    if (locked) current.lockedUntil = currentTime + windowMs;

    return {
      count: current.count,
      remaining,
      locked,
      retryAfterSeconds: locked ? Math.ceil((current.lockedUntil - currentTime) / 1000) : 0
    };
  }

  function clearFailedLogins(req) {
    const key = req.loginAttemptKey || keyFor(req);
    attempts.delete(key);
  }

  return { middleware, recordFailedLogin, clearFailedLogins };
}
