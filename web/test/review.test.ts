import { describe, expect, it } from "vitest";
import { savingsRate, heatmapBuckets, paceProjection, categoryMovers, trendSeries } from "../src/logic/review";
import type { LocalCategory, LocalTx } from "../src/db/schema";

describe("review", () => {
  it("savingsRate", () => { expect(savingsRate(0, 10)).toBeNull(); expect(savingsRate(1000, 250)).toBeCloseTo(0.75); });
  it("heatmapBuckets quartiles non-zero days", () => {
    const b = heatmapBuckets([{ day: "d1", total: 0 }, { day: "d2", total: 10 }, { day: "d3", total: 20 }, { day: "d4", total: 30 }, { day: "d5", total: 40 }]);
    expect(b.d1).toBe(0); expect(b.d2).toBe(1); expect(b.d5).toBe(4);
  });
  it("paceProjection extrapolates inside the period only", () => {
    expect(paceProjection(500, 0, 1000, 500)).toBe(1000); expect(paceProjection(500, 0, 1000, 1000)).toBeNull(); expect(paceProjection(500, 0, 1000, -1)).toBeNull();
  });
  const cat = (id: string): LocalCategory => ({ id, name: id, kind: "expense", emoji: "", color: "#000", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
  const cats = new Map([["a", cat("a")], ["b", cat("b")]]);
  const tx = (cents: number, catId: string, iso: string): LocalTx => ({ id: iso + catId + cents, space_id: "s", captured_by: null, source: "manual", receipt_code: null, direction: "out", amount_cents: cents, cost_cents: 0, balance_cents: null, counterparty: "x", occurred_at: iso, category_id: catId, reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null });
  const rows = [tx(1000, "a", "2026-08-10T10:00:00"), tx(2000, "a", "2026-09-10T10:00:00"), tx(500, "b", "2026-09-11T10:00:00")];
  it("categoryMovers: new categories first, then by |percent|", () => {
    const m = categoryMovers(rows, cats, "month", new Date("2026-09-15T12:00:00"));
    expect(m[0]).toMatchObject({ categoryId: "b", isNew: true, percentChange: null });
    expect(m[1]).toMatchObject({ categoryId: "a", current: 2000, previous: 1000, percentChange: 100 });
  });
  it("trendSeries oldest-first with labels", () => {
    const s = trendSeries(rows, cats, "month", new Date("2026-09-15T12:00:00"), 3);
    expect(s.map((p) => p.moneyOut)).toEqual([0, 1000, 2500]); expect(s[2]!.label).toBe("September 2026");
  });
});
