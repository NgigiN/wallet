import Dexie, { type EntityTable } from "dexie";

export type SyncState = "clean" | "dirty" | "error";
type LocalMeta = { space_id: string; sync_state: SyncState; sync_error: string | null };

export type Direction = "in" | "out" | "transfer";
export type TxWire = {
  id: string; captured_by: string | null; source: string; receipt_code: string | null; direction: Direction;
  amount_cents: number; cost_cents: number; balance_cents: number | null; counterparty: string; occurred_at: string;
  category_id: string | null; reason: string | null; linked_transaction_id: string | null; client_updated_at: string;
  seq: number; updated_at: string; deleted_at: string | null;
};
export type CategoryWire = { id: string; name: string; kind: "expense" | "income" | "transfer"; emoji: string; color: string; sort_order: number; archived: boolean; is_system: boolean; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };
export type BudgetWire = { id: string; category_id: string; monthly_limit_cents: number; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };
export type RuleWire = { id: string; match_counterparty: string; category_id: string; created_by: string | null; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };

export type LocalTx = TxWire & LocalMeta;
export type LocalCategory = CategoryWire & LocalMeta;
export type LocalBudget = BudgetWire & LocalMeta;
export type LocalRule = RuleWire & LocalMeta;
export type MetaRow = { key: string; value: string };

export const db = new Dexie("wallet") as Dexie & {
  transactions: EntityTable<LocalTx, "id">;
  categories: EntityTable<LocalCategory, "id">;
  budgets: EntityTable<LocalBudget, "id">;
  rules: EntityTable<LocalRule, "id">;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  transactions: "id, space_id, [space_id+occurred_at], [space_id+sync_state], [space_id+category_id], counterparty",
  categories: "id, space_id, [space_id+sync_state], [space_id+name]",
  budgets: "id, space_id, [space_id+sync_state], [space_id+category_id]",
  rules: "id, space_id, [space_id+sync_state], [space_id+match_counterparty]",
  meta: "key",
});

export const nowIso = () => new Date().toISOString();
