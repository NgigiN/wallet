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

/**
 * A `rejected` result whose `row` shares the pushed id (`system_category`, `immutable`)
 * means the server kept its own version and wrote nothing: the pull will never re-deliver
 * that row and `collectDirty` only re-pushes `dirty` rows, so unless the server row is
 * applied here the local copy diverges permanently. The row's data is therefore replaced
 * with the server's while the row stays flagged `error`, so the UI can say why the edit
 * did not stick.
 *
 * A `duplicate_budget` / `duplicate_rule` rejection carries the CLASHING row, not a merge
 * target — the local row is a separate row that must stay (as `error`) for the user to fix
 * or discard. Every other differing-id `row` (e.g. `immutable` reached via receipt-code
 * dedupe) IS a merge target: adopt the server id and drop the local duplicate.
 */
const CLASH_ERRORS = new Set(["duplicate_budget", "duplicate_rule"]);

/**
 * Rejections the user can fix from the UI (re-pick a category, correct a field). The row
 * goes back to `dirty` so the next sync carries the fix, while `sync_error` stays set so
 * the screen can still say why the last attempt bounced. Everything else — a clash with a
 * server row, an edit the server will never accept — stays `error`: re-pushing it
 * unchanged would only be rejected again.
 */
const RETRY_ERRORS = new Set(["bad_category", "invalid"]);

async function applyResult(spaceId: string, t: Table, r: PushResult) {
  const table = localTable(t);
  const local = await table.get(r.id);
  if (r.status === "rejected") {
    const code = r.error ?? "rejected";
    const state = RETRY_ERRORS.has(code) ? "dirty" : "error";
    if (r.row && r.row.id === r.id) {
      await table.put({ ...r.row, space_id: spaceId, sync_state: state, sync_error: code } as any);
      return;
    }
    if (local) await table.update(r.id, { sync_state: state, sync_error: code } as any);
    if (r.row) {
      if (!CLASH_ERRORS.has(code) && local) await table.delete(r.id);
      await table.put({ ...r.row, space_id: spaceId, sync_state: "clean", sync_error: null } as any);
    }
    return;
  }
  if (r.row && r.row.id !== r.id) {
    if (local) await table.delete(r.id);
    await table.put({ ...r.row, space_id: spaceId, sync_state: "clean", sync_error: null } as any);
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
    // One transaction per chunk rather than two auto-transactions per result: a 1000-row
    // push is 2000 IndexedDB round trips otherwise, and a chunk's results should land
    // together or not at all.
    await db.transaction("rw", db.transactions, db.categories, db.budgets, db.rules, async () => {
      for (const r of res.results) { await applyResult(spaceId, r.table, r); if (r.status === "rejected") rejected++; else pushed++; }
    });
    pulled += await pullAll(spaceId, api);
  }
  if (batches.length === 0) pulled += await pullAll(spaceId, api);
  await setLastSyncAt(spaceId, new Date().toISOString());
  return { pushed, rejected, pulled, cursor: await getCursor(spaceId) };
}
