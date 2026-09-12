import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, setBudget } from "../src/db/repo";
import { getCursor, setCursor } from "../src/db/meta";
import { runSync } from "../src/sync/engine";

const S = "space-1";
const srvTx = (over: Partial<any> = {}) => ({
  id: "srv-1", captured_by: "u1", source: "mpesa", receipt_code: "TID1", direction: "out", amount_cents: 500, cost_cents: 0, balance_cents: null,
  counterparty: "Shop", occurred_at: "2026-09-10T10:00:00.000Z", category_id: null, reason: null, linked_transaction_id: null,
  client_updated_at: "2026-09-10T10:00:00.000Z", seq: 10, updated_at: "2026-09-10T10:00:00.000Z", deleted_at: null, ...over,
});
function fakeApi() {
  const pushes: any[] = [];
  const pulls: number[] = [];
  const api = {
    pushBatch: vi.fn(async (_s: string, body: any) => { pushes.push(body); return { results: body.transactions?.map((t: any) => ({ table: "transactions", id: t.id, status: "applied", row: { ...t, seq: 100, updated_at: "x", captured_by: "me", linked_transaction_id: null } })) ?? [], cursor: 100 }; }),
    pullPage: vi.fn(async (_s: string, since: number) => { pulls.push(since); return { cursor: since, more: false, transactions: [] as any[], categories: [] as any[], budgets: [] as any[], rules: [] as any[] }; }),
  };
  return { api, pushes, pulls };
}
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
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async () => { throw Object.assign(new Error("offline"), { status: 0, code: "network" }); });
    api.pullPage.mockImplementationOnce(async () => ({ cursor: 5, more: false, transactions: [srvTx({ id, reason: "theirs", client_updated_at: "2020-01-01T00:00:00.000Z" })], categories: [], budgets: [], rules: [] }));
    await expect(runSync(S, api)).rejects.toMatchObject({ code: "network" });
    expect((await db.transactions.get(id))!.reason).toBe("mine");
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
  }, 60_000);
});
