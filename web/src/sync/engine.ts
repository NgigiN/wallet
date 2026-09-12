import { db } from "../db/schema";
import { getCursor, setCursor, setLastSyncAt } from "../db/meta";
import { pullPage, pushBatch, type PushResult, type SyncApi } from "../api/sync";

export const MAX_PUSH_ROWS = 1000;
export type SyncSummary = { pushed: number; rejected: number; pulled: number; cursor: number };
type Table = "transactions" | "categories" | "budgets" | "rules";
const TABLES: Table[] = ["categories", "budgets", "rules", "transactions"];
const SERVER_ONLY = new Set(["space_id", "sync_state", "sync_error", "seq", "updated_at", "captured_by", "linked_transaction_id", "created_by"]);

function toWireIn(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SERVER_ONLY.has(k)) out[k] = v;
  return out;
}
const localTable = (t: Table) => db[t] as unknown as typeof db.transactions;

async function applyResult(t: Table, r: PushResult) {
  const table = localTable(t);
  const local = await table.get(r.id);
  if (r.status === "rejected") {
    if (local) await table.update(r.id, { sync_state: "error", sync_error: r.error ?? "rejected" } as any);
    if (r.row && r.row.id !== r.id) { if (local) await table.delete(r.id); await table.put({ ...r.row, space_id: local?.space_id, sync_state: "clean", sync_error: null } as any); }
    return;
  }
  if (r.row && r.row.id !== r.id) {
    if (local) await table.delete(r.id);
    await table.put({ ...r.row, space_id: local?.space_id, sync_state: "clean", sync_error: null } as any);
    return;
  }
  if (!local) return;
  const serverFields = r.row ? { seq: r.row.seq, updated_at: r.row.updated_at, captured_by: r.row.captured_by ?? local.captured_by, linked_transaction_id: r.row.linked_transaction_id ?? null } : {};
  await table.update(r.id, { ...serverFields, sync_state: "clean", sync_error: null } as any);
}

async function collectDirty(spaceId: string) {
  const out: Record<Table, any[]> = { categories: [], budgets: [], rules: [], transactions: [] };
  for (const t of TABLES) out[t] = await localTable(t).where({ space_id: spaceId, sync_state: "dirty" }).toArray();
  return out;
}

/** Splits dirty rows into batches of ≤ MAX_PUSH_ROWS, preserving table order so categories land first. */
function chunk(dirty: Record<Table, any[]>): Record<Table, any[]>[] {
  const batches: Record<Table, any[]>[] = [];
  let cur: Record<Table, any[]> = { categories: [], budgets: [], rules: [], transactions: [] }; let n = 0;
  for (const t of TABLES) for (const row of dirty[t]) {
    if (n === MAX_PUSH_ROWS) { batches.push(cur); cur = { categories: [], budgets: [], rules: [], transactions: [] }; n = 0; }
    cur[t].push(row); n++;
  }
  if (n > 0) batches.push(cur);
  return batches;
}

async function applyPulled(spaceId: string, t: Table, rows: any[]) {
  const table = localTable(t);
  await db.transaction("rw", table, async () => {
    for (const row of rows) {
      if (row.deleted_at) { await table.delete(row.id); continue; }
      const local = await table.get(row.id);
      if (local && local.sync_state === "dirty" && Date.parse(local.client_updated_at) > Date.parse(row.client_updated_at)) continue;
      await table.put({ ...row, space_id: spaceId, sync_state: "clean", sync_error: null } as any);
    }
  });
}

async function pullAll(spaceId: string, api: SyncApi): Promise<number> {
  let pulled = 0;
  for (;;) {
    const since = await getCursor(spaceId);
    const page = await api.pullPage(spaceId, since);
    for (const t of TABLES) { await applyPulled(spaceId, t, page[t]); pulled += page[t].length; }
    if (page.cursor > since) await setCursor(spaceId, page.cursor);
    if (!page.more) break;
  }
  return pulled;
}

export async function runSync(spaceId: string, api: SyncApi = { pullPage, pushBatch }): Promise<SyncSummary> {
  let pushed = 0, rejected = 0, pulled = 0;
  const batches = chunk(await collectDirty(spaceId));
  for (const b of batches) {
    const body: Record<string, unknown[]> = {};
    for (const t of TABLES) if (b[t].length) body[t] = b[t].map(toWireIn);
    const res = await api.pushBatch(spaceId, body);
    for (const r of res.results) { await applyResult(r.table, r); if (r.status === "rejected") rejected++; else pushed++; }
    pulled += await pullAll(spaceId, api);
  }
  if (batches.length === 0) pulled += await pullAll(spaceId, api);
  await setLastSyncAt(spaceId, new Date().toISOString());
  return { pushed, rejected, pulled, cursor: await getCursor(spaceId) };
}
