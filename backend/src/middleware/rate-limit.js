export default function rateLimit({ windowMs, limit, message }) {
  const requests = new Map();
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of requests) {
      if (now - entry.startedAt >= windowMs) requests.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanupTimer.unref();

  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip;
    const entry = requests.get(key);
    const current =
      !entry || now - entry.startedAt >= windowMs
        ? { startedAt: now, count: 0 }
        : entry;
    current.count += 1;
    requests.set(key, current);

    const remaining = Math.max(0, limit - current.count);
    const reset = Math.ceil((current.startedAt + windowMs - now) / 1000);
    response.set({
      "RateLimit": `limit=${limit}, remaining=${remaining}, reset=${reset}`,
      "RateLimit-Policy": `${limit};w=${Math.ceil(windowMs / 1000)}`,
      "RateLimit-Limit": String(limit),
      "RateLimit-Remaining": String(remaining),
      "RateLimit-Reset": String(reset),
    });

    if (current.count > limit) {
      response.status(429).json(message);
      return;
    }
    next();
  };
}
