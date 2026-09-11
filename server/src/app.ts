import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import * as Sentry from "@sentry/node";
import type { Auth } from "./auth.js";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import { logger } from "./logger.js";
import { requireClientVersion } from "./middleware/client-version.js";
import { clientIp, rateLimit } from "./middleware/rate-limit.js";
import { requireSession, type SessionVars } from "./middleware/session.js";
import type { Space } from "./middleware/space.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { spaceRoutes } from "./routes/spaces.js";

export type AppDeps = { env: Env; db: Db; auth: Auth; healthDb: () => Promise<boolean> };

// The root app sees requests both before and after the session/space middleware have run,
// so `user` and `space` are optional here; the sub-apps keep their own non-optional types.
type AppVars = Partial<SessionVars> & { space?: Space; requestId: string };

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Variables: AppVars }>();

  app.use("*", async (c, next) => {
    // Set before `next()` so it is already a prepared header when a downstream handler (or
    // onError) builds the response: an error thrown by `next()` skips everything below.
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    const start = Date.now();
    await next();
    if (deps.env.NODE_ENV !== "test") {
      logger.info({ requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - start }, "req");
    }
  });

  app.route("/", healthRoutes({ version: deps.env.APP_VERSION, healthDb: deps.healthDb }));

  app.use("/api/auth/*", rateLimit({ windowMs: 60_000, max: 10, keyFn: clientIp }));
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  const v2 = new Hono<{ Variables: SessionVars }>();
  v2.use("*", requireClientVersion(deps.env));
  v2.use("*", requireSession(deps.auth));
  v2.use("*", rateLimit({ windowMs: 60_000, max: 60, keyFn: (c) => c.get("user").id }));
  v2.route("/me", meRoutes(deps.db));
  v2.route("/spaces", spaceRoutes(deps.db, deps.auth));
  app.route("/api/v2", v2);

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  const staticRoot = path.relative(process.cwd(), path.resolve(deps.env.STATIC_DIR)) || ".";
  app.use("*", serveStatic({ root: staticRoot }));
  app.get("*", async (c) => {
    try {
      const html = await readFile(path.resolve(deps.env.STATIC_DIR, "index.html"), "utf8");
      return c.html(html);
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
  });

  app.onError((err, c) => {
    const requestId = c.get("requestId");
    logger.error({ err, requestId, path: c.req.path }, "unhandled");
    // Tag only what ties the event back to a log line and a tenant — no request body, no
    // headers, no row values.
    Sentry.withScope((scope) => {
      scope.setTag("request_id", requestId);
      const user = c.get("user");
      if (user) scope.setUser({ id: user.id });
      const space = c.get("space");
      if (space) scope.setTag("space_id", space.id);
      Sentry.captureException(err);
    });
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
