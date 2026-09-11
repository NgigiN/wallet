import { sql } from "drizzle-orm";
import { beforeAll, beforeEach } from "vitest";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import { createDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { loadEnv } from "../src/env.js";

process.env.NODE_ENV = "test";
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://wallet:wallet@127.0.0.1:5434/wallet";

const created = createDb(TEST_DATABASE_URL);
export const testDb: Db = created.db;

export const testEnv = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: TEST_DATABASE_URL,
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  BETTER_AUTH_URL: "http://localhost:8080",
  TRUSTED_ORIGINS: "http://localhost:8080",
  MIN_CLIENT_ANDROID: "0.1.0",
  MIN_CLIENT_WEB: "0.1.0",
});

export function makeApp(envOverride: Partial<typeof testEnv> = {}) {
  const env = { ...testEnv, ...envOverride };
  const auth = createAuth(testDb, env);
  return createApp({ env, db: testDb, auth, healthDb: async () => true });
}

export async function truncateAll(db: Db) {
  await db.execute(sql`
    do $$ declare r record;
    begin
      for r in (select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations') loop
        execute 'truncate table ' || quote_ident(r.tablename) || ' cascade';
      end loop;
    end $$;`);
}

beforeAll(async () => {
  await runMigrations(testDb);
});

beforeEach(async () => {
  await truncateAll(testDb);
});
