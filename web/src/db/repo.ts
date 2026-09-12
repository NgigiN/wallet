import { v7 as uuidv7 } from "uuid";
import { db, nowIso, type Direction, type LocalBudget, type LocalCategory, type LocalRule, type LocalTx } from "./schema";

const dirty = { sync_state: "dirty" as const, sync_error: null };
export const normaliseCounterparty = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function createManualTransaction(spaceId: string, input: { direction: Direction; amount_cents: number; counterparty: string; occurred_at: string; category_id: string | null; reason: string | null }) {
  const id = uuidv7();
  const row: LocalTx = {
    id, space_id: spaceId, captured_by: null, source: "manual", receipt_code: null, direction: input.direction,
    amount_cents: input.amount_cents, cost_cents: 0, balance_cents: null, counterparty: input.counterparty.trim(),
    occurred_at: input.occurred_at, category_id: input.category_id, reason: input.reason?.trim() || null,
    linked_transaction_id: null, client_updated_at: nowIso(), seq: 0, updated_at: nowIso(), deleted_at: null, ...dirty,
  };
  await db.transactions.add(row);
  return id;
}
export const tagTransaction = (id: string, categoryId: string | null, reason: string | null) =>
  db.transactions.update(id, { category_id: categoryId, reason: reason?.trim() || null, client_updated_at: nowIso(), ...dirty });
export const editManualTransaction = (id: string, patch: { amount_cents: number; counterparty: string; occurred_at: string; direction: Direction }) =>
  db.transactions.update(id, { ...patch, counterparty: patch.counterparty.trim(), client_updated_at: nowIso(), ...dirty });
export const softDeleteTransaction = (id: string) => db.transactions.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });

export async function upsertCategory(spaceId: string, input: { id?: string; name: string; kind: "expense" | "income" | "transfer"; emoji: string; color: string; sort_order?: number }) {
  const id = input.id ?? uuidv7();
  const existing = input.id ? await db.categories.get(input.id) : undefined;
  const row: LocalCategory = {
    id, space_id: spaceId, name: input.name.trim(), kind: input.kind, emoji: input.emoji, color: input.color,
    sort_order: input.sort_order ?? existing?.sort_order ?? 99, archived: existing?.archived ?? false, is_system: existing?.is_system ?? false,
    client_updated_at: nowIso(), seq: existing?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty,
  };
  await db.categories.put(row);
  return id;
}
export const archiveCategory = (id: string, archived: boolean) => db.categories.update(id, { archived, client_updated_at: nowIso(), ...dirty });
export const reorderCategories = (ids: string[]) => db.transaction("rw", db.categories, async () => {
  for (const [i, id] of ids.entries()) await db.categories.update(id, { sort_order: i, client_updated_at: nowIso(), ...dirty });
});

export async function setBudget(spaceId: string, categoryId: string, limitCents: number) {
  const live = (await db.budgets.where({ space_id: spaceId, category_id: categoryId }).toArray()).find((b) => !b.deleted_at);
  const id = live?.id ?? uuidv7();
  const row: LocalBudget = { id, space_id: spaceId, category_id: categoryId, monthly_limit_cents: limitCents, client_updated_at: nowIso(), seq: live?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty };
  await db.budgets.put(row);
  return id;
}
export const deleteBudget = (id: string) => db.budgets.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });

export async function upsertRule(spaceId: string, counterparty: string, categoryId: string) {
  const match = normaliseCounterparty(counterparty);
  const live = (await db.rules.where({ space_id: spaceId, match_counterparty: match }).toArray()).find((r) => !r.deleted_at);
  const id = live?.id ?? uuidv7();
  const row: LocalRule = { id, space_id: spaceId, match_counterparty: match, category_id: categoryId, created_by: live?.created_by ?? null, client_updated_at: nowIso(), seq: live?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty };
  await db.rules.put(row);
  return id;
}
export const deleteRule = (id: string) => db.rules.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });
