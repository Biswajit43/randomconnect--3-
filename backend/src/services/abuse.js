const buckets = new Map();

export function allowAction(key, { limit, windowMs }) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  existing.count += 1;
  return existing.count <= limit;
}

export function retryAfterMs(key) {
  return Math.max(0, (buckets.get(key)?.resetAt || Date.now()) - Date.now());
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 5 * 60 * 1000).unref();
