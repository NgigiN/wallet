import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories, transactions } from "../src/db/schema.js";
import { makeApp, testDb } from "./setup.js";
import { authed, signUp } from "./helpers.js";

const TOKEN = "legacy-token-for-tests";
// Exactly what android/.../sync/ApiClient.kt sends (Wire.toApi).
const androidJson = (over: Record<string, unknown> = {}) => JSON.stringify({
  transaction_id: "TID60759AQ", amount: 300, direction: "out", source: "mpesa", counterparty: "Margaret Njuguna",
  date_time: "2026-09-13T09:24:00+03:00", balance: 1761.18, cost: 7, category: "food", reason: "at home", ...over,
});

async function setup() {
  const bootstrap = makeApp();
  const { token, userId } = await signUp(bootstrap, "legacy@example.com");
  const { spaces } = await (await bootstrap.request("/api/v2/spaces", authed(token))).json();
  const spaceId = spaces[0].id as string;
  const app = makeApp({ LEGACY_API_TOKEN: TOKEN, LEGACY_SPACE_ID: spaceId });
  const post = (body: string, tok = TOKEN) => app.request("/api/transactions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok}` }, body });
  return { app, post, spaceId, userId, token };
}

describe("legacy shim", () => {
  it("returns 503 when unconfigured and 401 on a bad token", async () => {
    const off = makeApp();
    expect((await off.request("/api/transactions", { method: "POST", body: androidJson() })).status).toBe(503);
    const { post } = await setup();
    expect((await post(androidJson(), "wrong")).status).toBe(401);
  });

  it("creates a v2 row from the Android JSON (201), then 200 on the exact duplicate", async () => {
    const { post, spaceId, userId, token, app } = await setup();
    const first = await post(androidJson());
    expect(first.status).toBe(201); expect(await first.json()).toEqual({ created: true });
    const second = await post(androidJson());
    expect(second.status).toBe(200); expect(await second.json()).toEqual({ created: false });
    const rows = await testDb.select().from(transactions).where(eq(transactions.spaceId, spaceId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ receiptCode: "TID60759AQ", amountCents: 30000, costCents: 700, balanceCents: 176118, direction: "out", source: "mpesa", capturedBy: userId, reason: "at home" });
    expect(rows[0]!.occurredAt.toISOString()).toBe("2026-09-13T06:24:00.000Z");
    const food = (await testDb.select().from(categories).where(eq(categories.spaceId, spaceId))).find((c) => c.name === "food")!;
    expect(rows[0]!.categoryId).toBe(food.id);
    // Visible through the v2 pull as well.
    const pull = await (await app.request(`/api/v2/spaces/${spaceId}/sync?since=0`, authed(token))).json();
    expect(pull.transactions).toHaveLength(1);
  });

  it("re-tagging through the shim updates the row (200, not created) and an unknown category is created as expense", async () => {
    const { post, spaceId } = await setup();
    await post(androidJson());
    const res = await post(androidJson({ category: "Rent", reason: "" }));
    expect(res.status).toBe(200); expect(await res.json()).toEqual({ created: false });
    const rows = await testDb.select().from(transactions).where(eq(transactions.spaceId, spaceId));
    expect(rows).toHaveLength(1);
    const rent = (await testDb.select().from(categories).where(eq(categories.spaceId, spaceId))).find((c) => c.name === "rent")!;
    expect(rent).toMatchObject({ kind: "expense", isSystem: false });
    expect(rows[0]!.categoryId).toBe(rent.id); expect(rows[0]!.reason).toBeNull();
  });

  it("rejects invalid payloads with 400 and accepts income/transfer categories", async () => {
    const { post } = await setup();
    expect((await post(androidJson({ amount: -5 }))).status).toBe(400);
    expect((await post(androidJson({ source: "bank" }))).status).toBe(400);
    expect((await post(androidJson({ transaction_id: "TIDIN1", direction: "in", category: "income" }))).status).toBe(201);
    expect((await post(androidJson({ transaction_id: "TIDTR1", direction: "transfer", category: "transfer" }))).status).toBe(201);
  });

  it("GET returns the old shape for the legacy space", async () => {
    const { app, post } = await setup();
    await post(androidJson());
    const res = await app.request("/api/transactions", { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ transaction_id: "TID60759AQ", amount: 300, cost: 7, balance: 1761.18, direction: "out", source: "mpesa", category: "food", reason: "at home" });
    expect(body[0].date_time).toBe("2026-09-13T06:24:00.000Z");
  });
});
