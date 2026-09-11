import { and, asc, eq, gt } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { budgets, categories, rules, transactions } from "../db/schema.js";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toTxWire(r: typeof transactions.$inferSelect) {
  return {
    id: r.id, captured_by: r.capturedBy, source: r.source, receipt_code: r.receiptCode, direction: r.direction,
    amount_cents: r.amountCents, cost_cents: r.costCents, balance_cents: r.balanceCents, counterparty: r.counterparty,
    occurred_at: r.occurredAt.toISOString(), category_id: r.categoryId, reason: r.reason,
    linked_transaction_id: r.linkedTransactionId, client_updated_at: r.clientUpdatedAt.toISOString(),
    seq: r.seq, updated_at: r.updatedAt.toISOString(), deleted_at: iso(r.deletedAt),
  };
}
export function toCategoryWire(r: typeof categories.$inferSelect) {
  return {
    id: r.id, name: r.name, kind: r.kind, emoji: r.emoji, color: r.color, sort_order: r.sortOrder, archived: r.archived,
    is_system: r.isSystem, client_updated_at: r.clientUpdatedAt.toISOString(), seq: r.seq,
    updated_at: r.updatedAt.toISOString(), deleted_at: iso(r.deletedAt),
  };
}
export function toBudgetWire(r: typeof budgets.$inferSelect) {
  return {
    id: r.id, category_id: r.categoryId, monthly_limit_cents: r.monthlyLimitCents,
    client_updated_at: r.clientUpdatedAt.toISOString(), seq: r.seq, updated_at: r.updatedAt.toISOString(), deleted_at: iso(r.deletedAt),
  };
}
export function toRuleWire(r: typeof rules.$inferSelect) {
  return {
    id: r.id, match_counterparty: r.matchCounterparty, category_id: r.categoryId, created_by: r.createdBy,
    client_updated_at: r.clientUpdatedAt.toISOString(), seq: r.seq, updated_at: r.updatedAt.toISOString(), deleted_at: iso(r.deletedAt),
  };
}

export type PullResponse = {
  cursor: number; more: boolean;
  transactions: ReturnType<typeof toTxWire>[]; categories: ReturnType<typeof toCategoryWire>[];
  budgets: ReturnType<typeof toBudgetWire>[]; rules: ReturnType<typeof toRuleWire>[];
};

export async function pullChanges(db: Db, spaceId: string, since: number, limit: number): Promise<PullResponse> {
  // Fetch one extra row per table (not just `limit`): a single table can hold every
  // remaining change, and capping each table's fetch at exactly `limit` makes `more`
  // undetectable in that case (its own limit-sized page looks indistinguishable from
  // "that's everything"). Over-fetching by 1 per table doesn't change which rows end
  // up in the merged page (still the smallest `limit` seqs overall) but does make
  // `all.length > limit` an accurate signal that further rows exist past the cursor.
  const fetchLimit = limit + 1;
  const [tx, cat, bud, rul] = await Promise.all([
    db.select().from(transactions).where(and(eq(transactions.spaceId, spaceId), gt(transactions.seq, since))).orderBy(asc(transactions.seq)).limit(fetchLimit),
    db.select().from(categories).where(and(eq(categories.spaceId, spaceId), gt(categories.seq, since))).orderBy(asc(categories.seq)).limit(fetchLimit),
    db.select().from(budgets).where(and(eq(budgets.spaceId, spaceId), gt(budgets.seq, since))).orderBy(asc(budgets.seq)).limit(fetchLimit),
    db.select().from(rules).where(and(eq(rules.spaceId, spaceId), gt(rules.seq, since))).orderBy(asc(rules.seq)).limit(fetchLimit),
  ]);
  type Tagged = { seq: number; kind: "t" | "c" | "b" | "r"; row: any };
  const all: Tagged[] = [
    ...tx.map((row) => ({ seq: row.seq, kind: "t" as const, row })),
    ...cat.map((row) => ({ seq: row.seq, kind: "c" as const, row })),
    ...bud.map((row) => ({ seq: row.seq, kind: "b" as const, row })),
    ...rul.map((row) => ({ seq: row.seq, kind: "r" as const, row })),
  ].sort((a, b) => a.seq - b.seq);
  const page = all.slice(0, limit);
  const more = all.length > limit;
  const cursor = page.length ? page[page.length - 1].seq : since;
  return {
    cursor, more,
    transactions: page.filter((x) => x.kind === "t").map((x) => toTxWire(x.row)),
    categories: page.filter((x) => x.kind === "c").map((x) => toCategoryWire(x.row)),
    budgets: page.filter((x) => x.kind === "b").map((x) => toBudgetWire(x.row)),
    rules: page.filter((x) => x.kind === "r").map((x) => toRuleWire(x.row)),
  };
}
