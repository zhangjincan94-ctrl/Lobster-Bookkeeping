const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60 * 1000;

const buckets = new Map();
let lastCleanupAt = 0;

// 单进程内存计数即可满足基础限流，避免引入外部依赖。
const cleanup = (now) => {
  if (now - lastCleanupAt < DEFAULT_WINDOW_MS) return;
  lastCleanupAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

const hit = (key, { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS } = {}) => {
  const now = Date.now();
  cleanup(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(limit - 1, 0) };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterMs: Math.max(bucket.resetAt - now, 1) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(limit - bucket.count, 0) };
};

module.exports = { hit };
