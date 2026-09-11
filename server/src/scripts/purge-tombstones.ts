import { sql } from "drizzle-orm";
import { createDb } from "../db/client.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("purge-tombstones: DATABASE_URL is not set");
  process.exit(2);
}

const { db, pool } = createDb(url);
const cutoff = sql`now() - interval '90 days'`;
const counts: Record<string, number> = {};

// One transaction: a failure on any table leaves the whole purge undone rather
// than half-applied.
await db.transaction(async (tx) => {
  for (const t of ["transactions", "budgets", "rules"] as const) {
    const r = await tx.execute(
      sql`delete from ${sql.identifier(t)} where deleted_at is not null and deleted_at < ${cutoff}`,
    );
    counts[t] = r.rowCount ?? 0;
  }
  // categories go last and only when nothing references them: transactions,
  // budgets and rules all hold a FK to categories.id with no ON DELETE action,
  // so a still-referenced category tombstone would abort the purge.
  const r = await tx.execute(sql`
    delete from categories
    where deleted_at is not null
      and deleted_at < ${cutoff}
      and not exists (select 1 from transactions t where t.category_id = categories.id)
      and not exists (select 1 from budgets b where b.category_id = categories.id)
      and not exists (select 1 from rules r where r.category_id = categories.id)
  `);
  counts.categories = r.rowCount ?? 0;
});

let total = 0;
for (const [table, n] of Object.entries(counts)) {
  total += n;
  console.log(`purged ${n} ${table} tombstones`);
}
console.log(`purged ${total} tombstones`);
await pool.end();
