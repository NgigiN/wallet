import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Db } from "./client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder: path.resolve(here, "../../drizzle") });
}

if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  const { createDb } = await import("./client.js");
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  await runMigrations(db);
  await pool.end();
  console.log("migrations applied");
}
