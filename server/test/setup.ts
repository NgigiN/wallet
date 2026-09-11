import { sql } from "drizzle-orm";
import { beforeAll, beforeEach } from "vitest";
import { createDb, type Db } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";

process.env.NODE_ENV = "test";
export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://wallet:wallet@127.0.0.1:5434/wallet";

const created = createDb(TEST_DATABASE_URL);
export const testDb: Db = created.db;

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
