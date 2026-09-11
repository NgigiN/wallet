import { Hono } from "hono";

const startedAt = Date.now();

export function healthRoutes(opts: { version: string; healthDb: () => Promise<boolean> }) {
  const r = new Hono();
  r.get("/health", async (c) => {
    const dbOk = await opts.healthDb().catch(() => false);
    const body = {
      status: dbOk ? "healthy" : "degraded",
      db: dbOk ? "ok" : "fail",
      version: opts.version,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
    return c.json(body, dbOk ? 200 : 503);
  });
  return r;
}
