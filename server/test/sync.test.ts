import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories } from "../src/db/schema.js";
import { makeApp, testDb } from "./setup.js";
import { authed, signUp } from "./helpers.js";

async function setup(email = "s@example.com") {
  const app = makeApp();
  const { token, userId } = await signUp(app, email);
  const { spaces } = await (await app.request("/api/v2/spaces", authed(token))).json();
  const spaceId = spaces[0].id as string;
  const cats = await testDb.select().from(categories).where(eq(categories.spaceId, spaceId));
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  return { app, token, userId, spaceId, cat };
}

describe("sync pull", () => {
  it("returns the seeded categories from cursor 0 with a cursor and more=false", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(7);
    expect(body.transactions).toEqual([]);
    expect(body.more).toBe(false);
    expect(body.cursor).toBe(Math.max(...body.categories.map((c: any) => c.seq)));
    expect(body.categories[0]).toMatchObject({ name: expect.any(String), kind: expect.any(String), is_system: expect.any(Boolean), deleted_at: null });
  });

  it("returns nothing past the cursor", async () => {
    const { app, token, spaceId } = await setup();
    const first = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token))).json();
    const second = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${first.cursor}`, authed(token))).json();
    expect(second.categories).toEqual([]);
    expect(second.cursor).toBe(first.cursor);
  });

  it("pages with limit and more=true", async () => {
    const { app, token, spaceId } = await setup();
    const page = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0&limit=3`, authed(token))).json();
    expect(page.categories).toHaveLength(3);
    expect(page.more).toBe(true);
    const rest = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${page.cursor}&limit=10`, authed(token))).json();
    expect(rest.categories).toHaveLength(4);
    expect(rest.more).toBe(false);
  });

  it("clamps limit=0 to 1 rather than falling back to the default", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=0&limit=0`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(1);
    expect(body.more).toBe(true);
  });

  it("treats a negative since as 0", async () => {
    const { app, token, spaceId } = await setup();
    const res = await app.request(`/api/v2/spaces/${spaceId}/sync?since=-5`, authed(token));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toHaveLength(7);
  });
});

const TX = (over: Record<string, unknown> = {}) => ({
  id: "018f0000-0000-7000-8000-000000000001", source: "mpesa", receipt_code: "TID1", direction: "out",
  amount_cents: 30000, cost_cents: 700, balance_cents: 176118, counterparty: "Margaret",
  occurred_at: "2026-09-01T10:00:00.000Z", category_id: null, reason: null,
  client_updated_at: "2026-09-01T11:00:00.000Z", deleted_at: null, ...over,
});
const push = (app: any, token: string, spaceId: string, body: unknown) =>
  app.request(`/api/v2/spaces/${spaceId}/sync`, authed(token, { method: "POST", body: JSON.stringify(body) }));

describe("sync push", () => {
  it("creates a transaction, then a pull returns it with a higher cursor", async () => {
    const { app, token, spaceId, cat } = await setup();
    const before = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token))).json();
    const res = await push(app, token, spaceId, { transactions: [TX({ category_id: cat("food") })] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ table: "transactions", status: "applied" });
    expect(body.cursor).toBeGreaterThan(before.cursor);
    const after = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${before.cursor}`, authed(token))).json();
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0]).toMatchObject({ id: TX().id, category_id: cat("food"), captured_by: expect.any(String) });
  });

  it("re-pushing the same row is unchanged and idempotent", async () => {
    const { app, token, spaceId } = await setup();
    await push(app, token, spaceId, { transactions: [TX()] });
    const body = await (await push(app, token, spaceId, { transactions: [TX()] })).json();
    expect(body.results[0].status).toBe("unchanged");
  });

  it("newer tag edit is applied; older is unchanged and returns the server row", async () => {
    const { app, token, spaceId, cat } = await setup();
    await push(app, token, spaceId, { transactions: [TX()] });
    const newer = await (await push(app, token, spaceId, { transactions: [TX({ category_id: cat("travel"), client_updated_at: "2026-09-01T12:00:00.000Z" })] })).json();
    expect(newer.results[0].status).toBe("applied");
    const older = await (await push(app, token, spaceId, { transactions: [TX({ category_id: cat("food"), client_updated_at: "2026-09-01T11:30:00.000Z" })] })).json();
    expect(older.results[0]).toMatchObject({ status: "unchanged", row: { category_id: cat("travel") } });
  });

  it("rejects immutable edits and bad categories per row without failing the batch", async () => {
    const { app, token, spaceId } = await setup();
    await push(app, token, spaceId, { transactions: [TX()] });
    const body = await (await push(app, token, spaceId, { transactions: [
      TX({ amount_cents: 1, client_updated_at: "2026-09-01T12:00:00.000Z" }),
      TX({ id: "018f0000-0000-7000-8000-000000000002", receipt_code: "TID2", category_id: "33333333-3333-7333-8333-333333333333" }),
      TX({ id: "018f0000-0000-7000-8000-000000000003", receipt_code: "TID3" }),
    ] })).json();
    expect(body.results.map((r: any) => r.status)).toEqual(["rejected", "rejected", "applied"]);
    expect(body.results[0].error).toBe("immutable");
    expect(body.results[1].error).toBe("bad_category");
  });

  it("two users in one space pushing the same receipt with opposite directions keep two rows; same direction converges to one", async () => {
    const a = await setup("a@example.com");
    // b joins a's space directly through the member table (invites are Phase 3)
    const b = await signUp(a.app, "b@example.com");
    const { member } = await import("../src/db/schema.js");
    await testDb.insert(member).values({ id: "m-b", organizationId: a.spaceId, userId: b.userId, role: "member", createdAt: new Date() } as any);

    await push(a.app, a.token, a.spaceId, { transactions: [TX({ direction: "out" })] });
    await push(a.app, b.token, a.spaceId, { transactions: [TX({ id: "018f0000-0000-7000-8000-0000000000bb", direction: "in" })] });
    const sameDir = await (await push(a.app, b.token, a.spaceId, { transactions: [TX({ id: "018f0000-0000-7000-8000-0000000000cc", direction: "out", client_updated_at: "2026-09-01T12:00:00.000Z", reason: "from b" })] })).json();
    expect(sameDir.results[0]).toMatchObject({ status: "applied", row: { id: TX().id, reason: "from b" } });

    const all = await (await a.app.request(`/api/v2/spaces/${a.spaceId}/sync?since=0`, authed(a.token))).json();
    expect(all.transactions).toHaveLength(2);
  });

  it("pushes a category then a budget referencing it; soft-deletes propagate as tombstones", async () => {
    const { app, token, spaceId } = await setup();
    const catId = "44444444-4444-7444-8444-444444444444";
    const budId = "55555555-5555-7555-8555-555555555555";
    const t = "2026-09-01T11:00:00.000Z";
    const res = await (await push(app, token, spaceId, {
      categories: [{ id: catId, name: "Rent", kind: "expense", emoji: "🏠", color: "#333333", sort_order: 9, archived: false, client_updated_at: t, deleted_at: null }],
      budgets: [{ id: budId, category_id: catId, monthly_limit_cents: 2000000, client_updated_at: t, deleted_at: null }],
    })).json();
    expect(res.results.map((r: any) => r.status)).toEqual(["applied", "applied"]);
    const del = await (await push(app, token, spaceId, {
      budgets: [{ id: budId, category_id: catId, monthly_limit_cents: 2000000, client_updated_at: "2026-09-01T12:00:00.000Z", deleted_at: "2026-09-01T12:00:00.000Z" }],
    })).json();
    expect(del.results[0].status).toBe("applied");
    const pulled = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=${res.cursor}`, authed(token))).json();
    expect(pulled.budgets[0].deleted_at).not.toBeNull();
  });

  it("rejects a category name that duplicates an existing one case-insensitively", async () => {
    const { app, token, spaceId } = await setup();
    const res = await (await push(app, token, spaceId, {
      categories: [{ id: "66666666-6666-7666-8666-666666666666", name: "FOOD", kind: "expense", emoji: "x", color: "#000000", sort_order: 1, archived: false, client_updated_at: "2026-09-01T11:00:00.000Z", deleted_at: null }],
    })).json();
    expect(res.results[0]).toMatchObject({ status: "rejected", error: "duplicate_name" });
  });
});
