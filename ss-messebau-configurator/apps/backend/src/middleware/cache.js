const cache = new Map();
const TTL_MS = 1000 * 60 * 5; // 5 Minuten
const MAX_ENTRIES = 200;

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
}

setInterval(evictExpired, 60_000).unref?.();

export function withCache(keyBuilder, handler) {
  return async (req, res) => {
    const key = keyBuilder(req.body);
    const cached = cache.get(key);
    const now = Date.now();

    if (cached && cached.expires > now) {
      return res.json({ ...cached.value, fromCache: true });
    }
    if (cached) cache.delete(key);

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (cache.size >= MAX_ENTRIES) evictExpired();
      if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { value: body, expires: now + TTL_MS });
      return originalJson(body);
    };

    return handler(req, res);
  };
}
