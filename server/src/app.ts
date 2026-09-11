import { Hono } from "hono";
import type { Auth } from "./auth.js";
import type { Db } from "./db/client.js";
import type { Env } from "./env.js";
import { requireSession } from "./middleware/session.js";
import { healthRoutes } from "./routes/health.js";
import { meRoutes } from "./routes/me.js";
import { spaceRoutes } from "./routes/spaces.js";

export type AppDeps = {
  env: Env;
  db: Db;
  auth: Auth;
  healthDb: () => Promise<boolean>;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.route("/", healthRoutes({ version: deps.env.APP_VERSION, healthDb: deps.healthDb }));

  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  const v2 = new Hono();
  v2.use("*", requireSession(deps.auth));
  v2.route("/me", meRoutes());
  v2.route("/spaces", spaceRoutes(deps.db, deps.auth));
  app.route("/api/v2", v2);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
