import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, nowIso } from "../src/db/schema";
import { createManualTransaction, setBudget, upsertCategory } from "../src/db/repo";
import { getCursor, setCursor } from "../src/db/meta";
import { runSync } from "../src/sync/engine";

const S = "space-1";
const ALL = ["categories", "budgets", "rules", "transactions"] as const;
const srvTx = (over: Partial<any> = {}) => ({
  id: "srv-1", captured_by: "u1", source: "mpesa", receipt_code: "TID1", direction: "out", amount_cents: 500, cost_cents: 0, balance_cents: null,
  counterparty: "Shop", occurred_at: "2026-09-10T10:00:00.000Z", category_id: null, reason: null, linked_transaction_id: null,
  client_updated_at: "2026-09-10T10:00:00.000Z", seq: 10, updated_at: "2026-09-10T10:00:00.000Z", deleted_at: null, ...over,
});
// The server echoes the pushed row back with its own seq/updated_at; only transactions
// carry captured_by / linked_transaction_id.
const echo = (table: string, row: any) =>
  table === "transactions"
    ? { ...row, seq: 100, updated_at: "x", captured_by: "me", linked_transaction_id: null }
    : { ...row, seq: 100, updated_at: "x" };
function fakeApi() {
  const pushes: any[] = [];
  const pulls: number[] = [];
  const api = {
    pushBatch: vi.fn(async (_s: string, body: any) => {
      pushes.push(body);
      const results: any[] = [];
      for (const table of ALL) for (const row of body[table] ?? []) results.push({ table, id: row.id, status: "applied", row: echo(table, row) });
      return { results, cursor: 100 };
    }),
    pullPage: vi.fn(async (_s: string, since: number) => { pulls.push(since); return { cursor: since, more: false, transactions: [] as any[], categories: [] as any[], budgets: [] as any[], rules: [] as any[] }; }),
  };
  return { api, pushes, pulls };
}
const dirtyCount = async () => {
  let n = 0;
  for (const t of ALL) n += await db[t].where({ space_id: S, sync_state: "dirty" }).count();
  return n;
};
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("runSync", () => {
  it("pushes dirty rows, marks them clean with server fields, then pulls from the STORED cursor (not the push cursor)", async () => {
    await setCursor(S, 7);
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api, pushes, pulls } = fakeApi();
    const out = await runSync(S, api);
    expect(pushes).toHaveLength(1); expect(pushes[0].transactions[0].id).toBe(id);
    expect(pushes[0].transactions[0]).not.toHaveProperty("space_id"); expect(pushes[0].transactions[0]).not.toHaveProperty("sync_state");
    expect(pulls[0]).toBe(7);
    const row = (await db.transactions.get(id))!;
    expect(row.sync_state).toBe("clean"); expect(row.seq).toBe(100); expect(row.captured_by).toBe("me");
    expect(out.pushed).toBe(1); expect(await getCursor(S)).toBe(7);
  });
  it("adopts the server id on dedupe-as-edit and deletes the local duplicate", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({ results: [{ table: "transactions", id: body.transactions[0].id, status: "applied", row: srvTx({ id: "srv-1" }) }], cursor: 50 }));
    await runSync(S, api);
    expect(await db.transactions.get(id)).toBeUndefined();
    expect((await db.transactions.get("srv-1"))!.sync_state).toBe("clean");
  });
  it("marks rejected rows as error with the code and keeps them", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: "nope", reason: null });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({ results: [{ table: "transactions", id: body.transactions[0].id, status: "rejected", error: "bad_category" }], cursor: 50 }));
    const out = await runSync(S, api);
    expect((await db.transactions.get(id))!).toMatchObject({ sync_state: "error", sync_error: "bad_category" });
    expect(out.rejected).toBe(1);
  });
  it("applies the server row on a same-id rejection and keeps the row in error", async () => {
    const id = await upsertCategory(S, { name: "Food", kind: "expense", emoji: "F", color: "#ff0000" });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({
      results: [{
        table: "categories", id: body.categories[0].id, status: "rejected", error: "system_category",
        row: { id: body.categories[0].id, name: "Uncategorised", kind: "income", emoji: "U", color: "#111111", sort_order: 0, archived: true, is_system: true, client_updated_at: "2026-09-11T00:00:00.000Z", seq: 9, updated_at: "2026-09-11T00:00:00.000Z", deleted_at: null },
      }],
      cursor: 50,
    }));
    const out = await runSync(S, api);
    expect((await db.categories.get(id))!).toMatchObject({ kind: "income", archived: true, is_system: true, space_id: S, sync_state: "error", sync_error: "system_category" });
    expect(out.rejected).toBe(1);
  });
  it("keeps the local row and upserts the clash row on duplicate_budget", async () => {
    const id = await setBudget(S, "c1", 100);
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({
      results: [{
        table: "budgets", id: body.budgets[0].id, status: "rejected", error: "duplicate_budget",
        row: { id: "srv-b", category_id: "c1", monthly_limit_cents: 900, client_updated_at: "2026-09-11T00:00:00.000Z", seq: 9, updated_at: "2026-09-11T00:00:00.000Z", deleted_at: null },
      }],
      cursor: 50,
    }));
    await runSync(S, api);
    expect((await db.budgets.get(id))!).toMatchObject({ sync_state: "error", sync_error: "duplicate_budget", monthly_limit_cents: 100 });
    expect((await db.budgets.get("srv-b"))!).toMatchObject({ sync_state: "clean", space_id: S, monthly_limit_cents: 900 });
  });
  it("pulls pages until more=false, applies tombstones, stores the pull cursor", async () => {
    await db.transactions.add({ ...srvTx({ id: "old" }), space_id: S, sync_state: "clean", sync_error: null } as any);
    const { api } = fakeApi();
    api.pullPage.mockImplementationOnce(async () => ({ cursor: 20, more: true, transactions: [srvTx({ id: "srv-2", seq: 20 })], categories: [], budgets: [], rules: [] }))
      .mockImplementationOnce(async () => ({ cursor: 30, more: false, transactions: [srvTx({ id: "old", seq: 30, deleted_at: "2026-09-12T00:00:00.000Z" })], categories: [], budgets: [], rules: [] }));
    const out = await runSync(S, api);
    expect(await db.transactions.get("old")).toBeUndefined();
    expect(await db.transactions.get("srv-2")).toBeDefined();
    expect(await getCursor(S)).toBe(30); expect(out.pulled).toBe(2);
  });
  it("does not overwrite a dirty local row with an older pulled version", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: "mine" });
    await db.transactions.update(id, { client_updated_at: nowIso() } as any);
    const { api } = fakeApi();
    // Server acknowledges nothing for this row, so it is still dirty when the pull lands.
    api.pushBatch.mockImplementationOnce(async () => ({ results: [], cursor: 100 }));
    api.pullPage.mockImplementationOnce(async () => ({ cursor: 5, more: false, transactions: [srvTx({ id, reason: "theirs", client_updated_at: "2020-01-01T00:00:00.000Z" })], categories: [], budgets: [], rules: [] }));
    await runSync(S, api);
    const row = (await db.transactions.get(id))!;
    expect(row.reason).toBe("mine"); expect(row.sync_state).toBe("dirty");
  });
  it("rejects when the push fails and leaves the dirty row untouched", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: "mine" });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async () => { throw Object.assign(new Error("offline"), { status: 0, code: "network" }); });
    await expect(runSync(S, api)).rejects.toMatchObject({ code: "network" });
    const row = (await db.transactions.get(id))!;
    expect(row.reason).toBe("mine"); expect(row.sync_state).toBe("dirty");
  });
  it("chunks pushes at 1000 rows, categories before transactions", async () => {
    await setBudget(S, "c1", 100);
    for (let i = 0; i < 1005; i++) await createManualTransaction(S, { direction: "out", amount_cents: 1, counterparty: `x${i}`, occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api, pushes } = fakeApi();
    await runSync(S, api);
    expect(pushes.length).toBe(2);
    const total = (b: any) => (b.transactions?.length ?? 0) + (b.categories?.length ?? 0) + (b.budgets?.length ?? 0) + (b.rules?.length ?? 0);
    expect(total(pushes[0])).toBe(1000); expect(total(pushes[1])).toBe(6);
    expect(pushes[0].budgets.length).toBe(1);
    expect(await dirtyCount()).toBe(0);
  }, 20_000);
});
