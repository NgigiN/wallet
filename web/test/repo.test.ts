import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, tagTransaction, softDeleteTransaction, setBudget, upsertCategory, upsertRule, reorderCategories } from "../src/db/repo";
import { getCursor, setCursor, getDeviceId } from "../src/db/meta";

const S = "space-1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("repo writes", () => {
  it("creates a manual transaction as dirty with a UUIDv7 id and cents", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 25000, counterparty: "Cash", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: "lunch" });
    const row = (await db.transactions.get(id))!;
    expect(row).toMatchObject({ space_id: S, source: "manual", receipt_code: null, amount_cents: 25000, cost_cents: 0, balance_cents: null, sync_state: "dirty", deleted_at: null });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Date.parse(row.client_updated_at)).toBeGreaterThan(0);
  });
  it("tagging bumps client_updated_at and marks dirty even on a clean row", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    await db.transactions.update(id, { sync_state: "clean", client_updated_at: "2026-09-01T00:00:00.000Z" });
    await tagTransaction(id, "cat-1", "why");
    const row = (await db.transactions.get(id))!;
    expect(row.category_id).toBe("cat-1"); expect(row.reason).toBe("why"); expect(row.sync_state).toBe("dirty");
    expect(Date.parse(row.client_updated_at)).toBeGreaterThan(Date.parse("2026-09-01T00:00:00.000Z"));
  });
  it("soft delete sets deleted_at and dirty", async () => {
    const id = await createManualTransaction(S, { direction: "in", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    await softDeleteTransaction(id);
    expect((await db.transactions.get(id))!.deleted_at).not.toBeNull();
  });
  it("setBudget upserts by (space, category)", async () => {
    const a = await setBudget(S, "cat-1", 500000); const b = await setBudget(S, "cat-1", 600000);
    expect(a).toBe(b);
    expect((await db.budgets.where({ space_id: S }).toArray()).length).toBe(1);
    expect((await db.budgets.get(a))!.monthly_limit_cents).toBe(600000);
  });
  it("upsertCategory and upsertRule normalise", async () => {
    const c = await upsertCategory(S, { name: " Rent ", kind: "expense", emoji: "🏠", color: "#333333" });
    expect((await db.categories.get(c))!.name).toBe("Rent");
    const r = await upsertRule(S, "  Naivas   Supermarket ", c);
    expect((await db.rules.get(r))!.match_counterparty).toBe("naivas supermarket");
  });
  it("editing a category via upsertCategory never changes its sort_order", async () => {
    const id = await upsertCategory(S, { name: "Rent", kind: "expense", emoji: "🏠", color: "#333333", sort_order: 5 });
    await reorderCategories([id]);
    const reordered = (await db.categories.get(id))!.sort_order;
    await upsertCategory(S, { id, name: "Renamed", kind: "expense", emoji: "🏠", color: "#333333", sort_order: 42 });
    const row = (await db.categories.get(id))!;
    expect(row.sort_order).toBe(reordered);
    expect(row.name).toBe("Renamed");
    const newCat = await upsertCategory(S, { name: "New", kind: "expense", emoji: "🆕", color: "#111111", sort_order: 3 });
    expect((await db.categories.get(newCat))!.sort_order).toBe(3);
  });
});
describe("meta", () => {
  it("cursor defaults to 0 per space and device id is stable", async () => {
    expect(await getCursor(S)).toBe(0); await setCursor(S, 42); expect(await getCursor(S)).toBe(42); expect(await getCursor("other")).toBe(0);
    const d1 = await getDeviceId(); const d2 = await getDeviceId(); expect(d1).toBe(d2); expect(d1).toHaveLength(36);
  });
});
