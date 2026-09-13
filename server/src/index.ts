import { serve } from "@hono/node-server";
import * as Sentry from "@sentry/node";
import { sql } from "drizzle-orm";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";

const env = loadEnv();

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, release: env.APP_VERSION, environment: env.NODE_ENV });
}

const { db, pool } = createDb(env.DATABASE_URL);
await runMigrations(db);
logger.info("migrations applied");

const auth = createAuth(db, env);

const app = createApp({
  env,
  db,
  auth,
  healthDb: async () => {
    const r = await db.execute(sql`select 1 as ok`);
    return (r.rows[0] as any)?.ok === 1;
  },
});

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, version: env.APP_VERSION }, "wallet server listening");
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "shutting down");
    server.close(async () => { await pool.end(); process.exit(0); });
  });
}
