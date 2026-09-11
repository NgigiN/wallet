import type { Context, MiddlewareHandler } from "hono";

type Opts = { windowMs: number; max: number; keyFn: (c: Context) => string; now?: () => number };

export function rateLimit(opts: Opts): MiddlewareHandler {
  const now = opts.now ?? Date.now;
  const buckets = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const t = now();
    const key = opts.keyFn(c);
    let b = buckets.get(key);
    if (!b || t - b.start >= opts.windowMs) { b = { start: t, count: 0 }; buckets.set(key, b); }
    b.count++;
    if (b.count > opts.max) {
      c.header("Retry-After", String(Math.ceil((b.start + opts.windowMs - t) / 1000)));
      return c.json({ error: "rate_limited" }, 429);
    }
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (t - v.start >= opts.windowMs) buckets.delete(k);
    await next();
  };
}

export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip")
    ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
