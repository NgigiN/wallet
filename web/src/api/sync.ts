import { apiFetch } from "./client";
import type { BudgetWire, CategoryWire, RuleWire, TxWire } from "../db/schema";

export type PullPage = { cursor: number; more: boolean; transactions: TxWire[]; categories: CategoryWire[]; budgets: BudgetWire[]; rules: RuleWire[] };
export type PushResult = { table: "transactions" | "categories" | "budgets" | "rules"; id: string; status: "applied" | "unchanged" | "rejected"; error?: string; message?: string; row?: any };
export type PushResponse = { results: PushResult[]; cursor: number };
export type PushBody = { transactions?: unknown[]; categories?: unknown[]; budgets?: unknown[]; rules?: unknown[] };

export const pullPage = (spaceId: string, since: number, limit = 500) =>
  apiFetch<PullPage>(`/api/v2/spaces/${spaceId}/sync?since=${since}&limit=${limit}`);
export const pushBatch = (spaceId: string, body: PushBody) =>
  apiFetch<PushResponse>(`/api/v2/spaces/${spaceId}/sync`, { method: "POST", body: JSON.stringify(body) });
export type SyncApi = { pullPage: typeof pullPage; pushBatch: typeof pushBatch };
