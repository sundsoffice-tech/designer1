const cache = new Map();
const TTL_MS = 1000 * 60 * 5; // 5 Minuten

export function withCache(keyBuilder, handler) {
  return async (req, res) => {
    const key = keyBuilder(req.body);
    const cached = cache.get(key);
    const now = Date.now();

    if (cached && cached.expires > now) {
      return res.json({ ...cached.value, fromCache: true });
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      cache.set(key, { value: body, expires: now + TTL_MS });
      return originalJson(body);
    };

    return handler(req, res);
  };
}
