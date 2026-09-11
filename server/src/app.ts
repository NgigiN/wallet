import { Hono } from "hono";
import type { Env } from "./env.js";
import { healthRoutes } from "./routes/health.js";

export type AppDeps = {
  env: Env;
  healthDb: () => Promise<boolean>;
};

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.route("/", healthRoutes({ version: deps.env.APP_VERSION, healthDb: deps.healthDb }));
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "internal" }, 500);
  });
  return app;
}
