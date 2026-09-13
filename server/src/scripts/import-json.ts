/**
 * Phase 1C import: loads the v1 SQLite export (deploy/export-sqlite.py → JSON) into the
 * personal space of an existing user. Idempotent: rows are keyed by a deterministic UUIDv5
 * of (space, receipt code, direction), so re-runs update in place.
 *
 *   DATABASE_URL=... npm run import -- <export.json> <user email>
 */
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { v5 as uuidv5 } from "uuid";
import { createDb, type Db } from "../db/client.js";
import { categories, member, organization, transactions, user } from "../db/schema.js";
import { resolveCategoryByName, seedCategories } from "../services/categories.js";
import { spaceKind } from "../middleware/space.js";

const NS = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
export const importTxId = (spaceId: string, txnId: string, direction: string) => uuidv5(`wallet-legacy/${spaceId}/${txnId}/${direction}`, NS);
export const toCents = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

export type ExportRow = {
  transaction_id: string; amount: number; counterparty: string | null; date_time: string; balance: number | null; cost: number | null;
  category: string | null; reason: string | null; direction: string; source: string; updated_at: string | null; created_at: string | null;
};
export type ImportSummary = { read: number; inserted: number; updated: number; categoriesCreated: string[]; sumOutCents: number; sumInCents: number; spaceId: string; userId: string };

export async function importRows(db: Db, email: string, rows: ExportRow[]): Promise<ImportSummary> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!u) throw new Error(`no user with email ${email}; sign up first, then re-run`);
  const memberships = await db.select({ orgId: member.organizationId, metadata: organization.metadata }).from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId)).where(eq(member.userId, u.id));
  const personal = memberships.find((m) => spaceKind(m.metadata) === "personal") ?? memberships[0];
  if (!personal) throw new Error(`user ${email} has no space`);
  const spaceId = personal.orgId;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${spaceId}))`);
    await seedCategories(tx as unknown as Db, spaceId);
    const before = new Set((await tx.select({ id: categories.id }).from(categories).where(eq(categories.spaceId, spaceId))).map((c) => c.id));
    let inserted = 0, updated = 0, sumOut = 0, sumIn = 0;
    for (const r of rows) {
      const direction = (r.direction || "out") as "in" | "out" | "transfer";
      const source = r.source || "mpesa";
      const categoryId = await resolveCategoryByName(tx as unknown as Db, spaceId, r.category);
      const id = importTxId(spaceId, r.transaction_id, direction);
      const amountCents = toCents(r.amount)!;
      const values = {
        id, spaceId, capturedBy: u.id, source, receiptCode: r.transaction_id, direction, amountCents, costCents: toCents(r.cost) ?? 0,
        balanceCents: r.balance == null ? null : toCents(r.balance), counterparty: (r.counterparty ?? "").trim() || "Unknown",
        occurredAt: new Date(r.date_time), categoryId, reason: (r.reason ?? "").trim() || null,
        clientUpdatedAt: new Date(r.updated_at ?? r.date_time), updatedAt: new Date(),
      };
      const [existing] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, id)).limit(1);
      if (existing) {
        await tx.update(transactions).set({ ...values, seq: sql`nextval('change_seq')` }).where(eq(transactions.id, id)); updated++;
      } else {
        await tx.insert(transactions).values(values); inserted++;
      }
      if (direction === "out") sumOut += amountCents; else if (direction === "in") sumIn += amountCents;
    }
    const after = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(and(eq(categories.spaceId, spaceId)));
    const categoriesCreated = after.filter((c) => !before.has(c.id)).map((c) => c.name);
    return { read: rows.length, inserted, updated, categoriesCreated, sumOutCents: sumOut, sumInCents: sumIn, spaceId, userId: u.id };
  });
}

const isCli = process.argv[1]?.endsWith("import-json.ts") || process.argv[1]?.endsWith("import-json.js");
if (isCli) {
  const [file, email] = process.argv.slice(2);
  if (!file || !email || !process.env.DATABASE_URL) { console.error("usage: DATABASE_URL=... import-json <export.json> <email>"); process.exit(2); }
  const rows = JSON.parse(readFileSync(file, "utf8")) as ExportRow[];
  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const s = await importRows(db, email, rows);
    console.log(JSON.stringify({ ...s, sum_out: s.sumOutCents / 100, sum_in: s.sumInCents / 100 }, null, 1));
  } finally { await pool.end(); }
}
