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

// Header order is trust order, and only nginx is trusted: it overwrites both `X-Real-IP`
// and `CF-Connecting-IP` with `$remote_addr` on every proxied request (see
// deploy/nginx-wallet-staging.conf), so a client that sends either header cannot pick its
// own rate-limit bucket. `cf-connecting-ip` stays as a fallback for a deployment that
// fronts the app with Cloudflare and no rewriting proxy; `x-forwarded-for` is last because
// nginx appends to whatever the client sent, so its first element is client-controlled.
export function clientIp(c: Context): string {
  return c.req.header("x-real-ip") ?? c.req.header("cf-connecting-ip")
    ?? c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
