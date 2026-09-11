import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { budgets, categories, rules, transactions } from "../db/schema.js";
import { mergeLww, mergeTransaction, type LwwRow, type TxIncoming } from "./sync-merge.js";

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
  // Run the four selects inside one repeatable-read transaction so they all see the same
  // snapshot. Without this, Promise.all issues them on separate pooled connections with no
  // shared snapshot: a push that commits between two of them could appear in one table's
  // result but not another's, producing an inconsistent page for a cursor that's supposed
  // to be a single consistent point in the change stream. A transaction pins to a single
  // connection, so the four selects are awaited one at a time here rather than via
  // Promise.all — issuing overlapping queries against one pg client is deprecated (and not
  // true parallelism anyway); repeatable read is what gives them a shared snapshot, not
  // concurrency.
  const [tx, cat, bud, rul] = await db.transaction(async (t) => {
    const txRows = await t.select().from(transactions).where(and(eq(transactions.spaceId, spaceId), gt(transactions.seq, since))).orderBy(asc(transactions.seq)).limit(fetchLimit);
    const catRows = await t.select().from(categories).where(and(eq(categories.spaceId, spaceId), gt(categories.seq, since))).orderBy(asc(categories.seq)).limit(fetchLimit);
    const budRows = await t.select().from(budgets).where(and(eq(budgets.spaceId, spaceId), gt(budgets.seq, since))).orderBy(asc(budgets.seq)).limit(fetchLimit);
    const rulRows = await t.select().from(rules).where(and(eq(rules.spaceId, spaceId), gt(rules.seq, since))).orderBy(asc(rules.seq)).limit(fetchLimit);
    return [txRows, catRows, budRows, rulRows] as const;
  }, { isolationLevel: "repeatable read" });
  type Tagged =
    | { seq: number; kind: "t"; row: typeof transactions.$inferSelect }
    | { seq: number; kind: "c"; row: typeof categories.$inferSelect }
    | { seq: number; kind: "b"; row: typeof budgets.$inferSelect }
    | { seq: number; kind: "r"; row: typeof rules.$inferSelect };
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

// zod 4: chaining `.nullable().transform(...).default(null)` on the same schema
// rejects the composed type (the `.default` is on the transformed-output side, which
// zod won't accept). Put `.default(null)` on the *input* (pre-transform) schema instead,
// then transform, per the brief's documented adaptation.
const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));
const nullableIso = z.string().datetime({ offset: true }).nullable().default(null).transform((s) => (s ? new Date(s) : null));
const uuid = z.string().uuid();

export const txWireIn = z.object({
  id: uuid, source: z.string().min(1), receipt_code: z.string().min(1).nullable(),
  direction: z.enum(["in", "out", "transfer"]), amount_cents: z.number().int(), cost_cents: z.number().int().nonnegative().default(0),
  balance_cents: z.number().int().nullable().default(null), counterparty: z.string(), occurred_at: isoDate,
  category_id: uuid.nullable().default(null), reason: z.string().nullable().default(null),
  client_updated_at: isoDate, deleted_at: nullableIso,
});
export const categoryWireIn = z.object({
  id: uuid, name: z.string().trim().min(1).max(40), kind: z.enum(["expense", "income", "transfer"]), emoji: z.string().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), sort_order: z.number().int().default(0), archived: z.boolean().default(false),
  client_updated_at: isoDate, deleted_at: nullableIso,
});
export const budgetWireIn = z.object({
  id: uuid, category_id: uuid, monthly_limit_cents: z.number().int().positive(), client_updated_at: isoDate, deleted_at: nullableIso,
});
export const ruleWireIn = z.object({
  id: uuid, match_counterparty: z.string().trim().min(1), category_id: uuid, client_updated_at: isoDate, deleted_at: nullableIso,
});
// Each table field tolerates `null` as well as being absent, both meaning "no rows of
// this kind in this push" (a client that always sends every key, even when empty, would
// otherwise be rejected).
const wireList = z.array(z.unknown()).nullish().transform((v) => v ?? []);
export const pushBody = z.object({
  transactions: wireList, categories: wireList, budgets: wireList, rules: wireList,
});

export type PushResult = { table: "transactions" | "categories" | "budgets" | "rules"; id: string; status: "applied" | "unchanged" | "rejected"; error?: string; message?: string; row?: unknown };
export type PushResponse = { results: PushResult[]; cursor: number };

// A batch whose shape doesn't match PushBody at all (e.g. a table field that's neither an
// array nor null/absent) is a malformed request, not a malformed row: it can't be reported
// per-row because we don't have rows to iterate. The route maps this to a 400, distinct from
// per-row `status: "rejected"` results for malformed items within an otherwise-valid batch.
export class PushValidationError extends Error {}

const nextSeq = sql<number>`nextval('change_seq')`;

// An item that failed zod parsing is still reported per-row, so we need whatever id it
// claimed to carry — without asserting anything about its shape.
const claimedId = (item: unknown): string => {
  const id = (item as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" ? id : "";
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The three LWW tables (categories, budgets, rules) share one insert/update/unchanged tail:
// only the table, the incoming row and the wire mapper differ. `LwwInsert` is the shape
// applyLww needs from a table's insert type (drizzle's `deletedAt` is optional there, unlike
// the select type's `Date | null`), so every table in the schema with the sync columns fits.
type LwwInsert = { id: string; clientUpdatedAt: Date; deletedAt?: Date | null };
type LwwTable = PgTable & { id: PgColumn; $inferSelect: LwwRow; $inferInsert: LwwInsert };
type LwwSpec<T extends LwwTable, Wire> = {
  table: Exclude<PushResult["table"], "transactions">;
  drizzleTable: T;
  incoming: T["$inferInsert"];
  existing: T["$inferSelect"] | undefined;
  toWire: (row: T["$inferSelect"]) => Wire;
  now: Date;
};

async function applyLww<T extends LwwTable, Wire>(tx: Tx, spec: LwwSpec<T, Wire>): Promise<PushResult> {
  // mergeLww compares one row type against itself; `incoming` is the insert shape of the
  // same table (identical apart from the server-managed columns it omits), so it stands in
  // for the select type here rather than every caller widening its own literal.
  const m = mergeLww<T["$inferSelect"]>(spec.existing ?? null, spec.incoming as T["$inferSelect"]);
  if (m.action === "insert") {
    const [row] = await tx.insert(spec.drizzleTable).values({ ...m.row, updatedAt: spec.now }).returning();
    return { table: spec.table, id: spec.incoming.id, status: "applied", row: spec.toWire(row) };
  }
  if (m.action === "update") {
    // drizzle types `.returning()` on a generic table as a conditional that doesn't resolve
    // to an array; the runtime value is the same row list as the insert path's.
    const rows = (await tx.update(spec.drizzleTable).set({ ...m.row, seq: nextSeq, updatedAt: spec.now })
      .where(eq(spec.drizzleTable.id, m.row.id)).returning()) as unknown as T["$inferSelect"][];
    return { table: spec.table, id: spec.incoming.id, status: "applied", row: spec.toWire(rows[0]) };
  }
  if (m.action === "unchanged") return { table: spec.table, id: spec.incoming.id, status: "unchanged", row: spec.toWire(m.row) };
  // mergeLww never rejects (per-table prechecks above own that); MergeResult is shared with
  // mergeTransaction, which does.
  throw new Error(`unexpected merge action for ${spec.table}: ${m.action}`);
}

export async function pushChanges(db: Db, ctx: { spaceId: string; userId: string }, raw: unknown): Promise<PushResponse> {
  const parsedBody = pushBody.safeParse(raw);
  if (!parsedBody.success) throw new PushValidationError(parsedBody.error.issues[0]?.message ?? "invalid push body");
  const body = parsedBody.data;
  const results: PushResult[] = [];

  const cursor = await db.transaction(async (tx) => {
    // Lock the space's rows for the duration of this push so two devices cannot interleave.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.spaceId}))`);
    const now = new Date();

    const liveCategoryIds = async () => new Set(
      (await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.spaceId, ctx.spaceId), sql`${categories.deletedAt} is null`))).map((r) => r.id),
    );

    // 1. categories (processed first so budgets/rules/transactions in the same batch
    // that reference a newly-pushed category can resolve it)
    for (const item of body.categories) {
      const p = categoryWireIn.safeParse(item);
      if (!p.success) { results.push({ table: "categories", id: claimedId(item), status: "rejected", error: "invalid", message: p.error.issues[0]?.message }); continue; }
      const w = p.data;
      // Look up by id across all spaces first: the id is a client-generated uuid, and a
      // row with the same id already living in a *different* space (e.g. two devices that
      // both generated an id offline before either had synced) must never be merged into
      // or overwritten by this space's push.
      const [byId] = await tx.select().from(categories).where(eq(categories.id, w.id)).limit(1);
      if (byId && byId.spaceId !== ctx.spaceId) { results.push({ table: "categories", id: w.id, status: "rejected", error: "id_conflict" }); continue; }
      const existing = byId;
      if (existing?.isSystem && (w.kind !== existing.kind || w.deleted_at || w.archived)) { results.push({ table: "categories", id: w.id, status: "rejected", error: "system_category", row: toCategoryWire(existing) }); continue; }
      // Covers both the insert and the update path: renaming a category onto another live
      // category's name would violate `categories_space_name_uq`.
      const [dup] = await tx.select({ id: categories.id }).from(categories)
        .where(and(eq(categories.spaceId, ctx.spaceId), sql`lower(${categories.name}) = lower(${w.name})`, sql`${categories.deletedAt} is null`, sql`${categories.id} <> ${w.id}`)).limit(1);
      if (dup && !w.deleted_at) { results.push({ table: "categories", id: w.id, status: "rejected", error: "duplicate_name" }); continue; }
      const incoming = { id: w.id, spaceId: ctx.spaceId, name: w.name, kind: w.kind, emoji: w.emoji, color: w.color, sortOrder: w.sort_order, archived: w.archived, isSystem: existing?.isSystem ?? false, clientUpdatedAt: w.client_updated_at, deletedAt: w.deleted_at };
      results.push(await applyLww(tx, { table: "categories", drizzleTable: categories, incoming, existing, toWire: toCategoryWire, now }));
    }

    // 2. budgets (catIds is computed once, after categories, and reused by budgets, rules
    // and transactions below: none of those three tables can add to it, so a second read
    // would just be a wasted round trip)
    const catIds = await liveCategoryIds();
    for (const item of body.budgets) {
      const p = budgetWireIn.safeParse(item);
      if (!p.success) { results.push({ table: "budgets", id: claimedId(item), status: "rejected", error: "invalid", message: p.error.issues[0]?.message }); continue; }
      const w = p.data;
      const [byId] = await tx.select().from(budgets).where(eq(budgets.id, w.id)).limit(1);
      if (byId && byId.spaceId !== ctx.spaceId) { results.push({ table: "budgets", id: w.id, status: "rejected", error: "id_conflict" }); continue; }
      if (!catIds.has(w.category_id)) { results.push({ table: "budgets", id: w.id, status: "rejected", error: "bad_category" }); continue; }
      // Update path: re-pointing a known budget at a category that already has its own live
      // budget would violate `budgets_space_category_uq` and 500 the whole push. Reject the
      // row and hand back the budget that is in the way so the client can merge locally.
      // Deletes are exempt: the partial index only covers live rows.
      if (byId && byId.categoryId !== w.category_id && !w.deleted_at) {
        const [clash] = await tx.select().from(budgets)
          .where(and(eq(budgets.spaceId, ctx.spaceId), eq(budgets.categoryId, w.category_id), sql`${budgets.deletedAt} is null`, sql`${budgets.id} <> ${w.id}`)).limit(1);
        if (clash) { results.push({ table: "budgets", id: w.id, status: "rejected", error: "duplicate_budget", row: toBudgetWire(clash) }); continue; }
      }
      // The `budgets_space_category_uq` index means a second budget for a category that
      // already has a live one would 500 on insert. Treat it as an edit of the existing
      // budget instead (mirroring mergeTransaction's receipt-code dedupe): if there's no
      // row with this exact id, but there is a live row for the same category, that row is
      // "existing" and the push becomes an update targeting its id.
      let existing = byId;
      if (!existing) {
        [existing] = await tx.select().from(budgets)
          .where(and(eq(budgets.spaceId, ctx.spaceId), eq(budgets.categoryId, w.category_id), sql`${budgets.deletedAt} is null`)).limit(1);
      }
      const incoming = { id: w.id, spaceId: ctx.spaceId, categoryId: w.category_id, monthlyLimitCents: w.monthly_limit_cents, clientUpdatedAt: w.client_updated_at, deletedAt: w.deleted_at };
      results.push(await applyLww(tx, { table: "budgets", drizzleTable: budgets, incoming, existing, toWire: toBudgetWire, now }));
    }

    // 3. rules
    for (const item of body.rules) {
      const p = ruleWireIn.safeParse(item);
      if (!p.success) { results.push({ table: "rules", id: claimedId(item), status: "rejected", error: "invalid", message: p.error.issues[0]?.message }); continue; }
      const w = p.data;
      const [byId] = await tx.select().from(rules).where(eq(rules.id, w.id)).limit(1);
      if (byId && byId.spaceId !== ctx.spaceId) { results.push({ table: "rules", id: w.id, status: "rejected", error: "id_conflict" }); continue; }
      if (!catIds.has(w.category_id)) { results.push({ table: "rules", id: w.id, status: "rejected", error: "bad_category" }); continue; }
      const normalized = w.match_counterparty.toLowerCase().replace(/\s+/g, " ");
      // Update path, same hazard as budgets above: renaming a known rule onto another live
      // rule's counterparty would violate `rules_space_match_uq`.
      if (byId && byId.matchCounterparty !== normalized && !w.deleted_at) {
        const [clash] = await tx.select().from(rules)
          .where(and(eq(rules.spaceId, ctx.spaceId), eq(rules.matchCounterparty, normalized), sql`${rules.deletedAt} is null`, sql`${rules.id} <> ${w.id}`)).limit(1);
        if (clash) { results.push({ table: "rules", id: w.id, status: "rejected", error: "duplicate_rule", row: toRuleWire(clash) }); continue; }
      }
      // `rules_space_match_uq` means a second rule for the same (normalised) counterparty
      // would 500 on insert. Same dedupe-as-edit treatment as budgets above: fall back to
      // the live row matching this counterparty when there's no id match.
      let existing = byId;
      if (!existing) {
        [existing] = await tx.select().from(rules)
          .where(and(eq(rules.spaceId, ctx.spaceId), eq(rules.matchCounterparty, normalized), sql`${rules.deletedAt} is null`)).limit(1);
      }
      const incoming = { id: w.id, spaceId: ctx.spaceId, matchCounterparty: normalized, categoryId: w.category_id, createdBy: existing?.createdBy ?? ctx.userId, clientUpdatedAt: w.client_updated_at, deletedAt: w.deleted_at };
      results.push(await applyLww(tx, { table: "rules", drizzleTable: rules, incoming, existing, toWire: toRuleWire, now }));
    }

    // 4. transactions (catIds computed once above, after categories — see the comment on
    // that declaration). This table doesn't use applyLww: mergeTransaction has its own
    // immutable-field and validation rules on top of the LWW comparison.
    for (const item of body.transactions) {
      const p = txWireIn.safeParse(item);
      if (!p.success) { results.push({ table: "transactions", id: claimedId(item), status: "rejected", error: "invalid", message: p.error.issues[0]?.message }); continue; }
      const w = p.data;
      const incoming: TxIncoming = {
        id: w.id, source: w.source, receiptCode: w.receipt_code, direction: w.direction, amountCents: w.amount_cents, costCents: w.cost_cents,
        balanceCents: w.balance_cents, counterparty: w.counterparty, occurredAt: w.occurred_at, categoryId: w.category_id, reason: w.reason,
        clientUpdatedAt: w.client_updated_at, deletedAt: w.deleted_at,
      };
      const [byId] = await tx.select().from(transactions).where(eq(transactions.id, w.id)).limit(1);
      if (byId && byId.spaceId !== ctx.spaceId) { results.push({ table: "transactions", id: w.id, status: "rejected", error: "id_conflict" }); continue; }
      let existing = byId;
      if (!existing && w.receipt_code) {
        [existing] = await tx.select().from(transactions).where(and(
          eq(transactions.spaceId, ctx.spaceId), eq(transactions.source, w.source), eq(transactions.receiptCode, w.receipt_code), eq(transactions.direction, w.direction),
        )).limit(1);
      }
      const m = mergeTransaction(existing ?? null, incoming, { spaceId: ctx.spaceId, userId: ctx.userId, categoryExists: (id) => catIds.has(id) });
      // mergeTransaction only ever returns `existing` as the row on its rejected and
      // unchanged results, so the server row is reported from `existing` (the full drizzle
      // row) rather than the merge's TxRow view of it.
      if (m.action === "rejected") { results.push({ table: "transactions", id: w.id, status: "rejected", error: m.error, message: m.message, row: m.row && existing ? toTxWire(existing) : undefined }); continue; }
      if (m.action === "insert") {
        const [row] = await tx.insert(transactions).values({ ...m.row, updatedAt: now }).returning();
        results.push({ table: "transactions", id: w.id, status: "applied", row: toTxWire(row) });
      } else if (m.action === "update") {
        const [row] = await tx.update(transactions).set({ ...m.row, seq: nextSeq, updatedAt: now }).where(eq(transactions.id, existing!.id)).returning();
        results.push({ table: "transactions", id: w.id, status: "applied", row: toTxWire(row) });
      } else {
        results.push({ table: "transactions", id: w.id, status: "unchanged", row: toTxWire(existing!) });
      }
    }

    // Read the cursor here, still inside the transaction (and still holding the advisory
    // lock): reading it after `db.transaction` returns would run on a separate pooled
    // connection, after our commit has released the lock, letting a concurrent same-space
    // push commit in between and hand this caller a cursor that silently skips those rows.
    const seqRows = (await tx.execute(sql`select last_value as v from change_seq`)).rows as { v: string | number }[];
    return Number(seqRows[0].v);
  });

  return { results, cursor };
}
