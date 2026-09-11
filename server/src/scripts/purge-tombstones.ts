import { sql } from "drizzle-orm";
import { createDb } from "../db/client.js";

const { db, pool } = createDb(process.env.DATABASE_URL!);
const cutoff = sql`now() - interval '90 days'`;
let total = 0;
for (const t of ["transactions", "budgets", "rules", "categories"]) {
  const r = await db.execute(sql`delete from ${sql.identifier(t)} where deleted_at is not null and deleted_at < ${cutoff}`);
  total += r.rowCount ?? 0;
}
console.log(`purged ${total} tombstones`);
await pool.end();
