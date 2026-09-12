import { describe, expect, it } from "vitest";
import { totals, categoryTotals, topDays, biggestExpenses, topCounterparties, categorySpend, dailyTotals } from "../src/logic/stats";
import type { LocalCategory, LocalTx } from "../src/db/schema";

const cat = (id: string, name: string, kind: LocalCategory["kind"] = "expense"): LocalCategory => ({ id, name, kind, emoji: "x", color: "#000000", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
const cats = new Map([["food", cat("food", "food")], ["tr", cat("tr", "transfer", "transfer")], ["inc", cat("inc", "income", "income")]]);
const tx = (o: Partial<LocalTx>): LocalTx => ({ id: Math.random().toString(), space_id: "s", captured_by: null, source: "mpesa", receipt_code: null, direction: "out", amount_cents: 1000, cost_cents: 0, balance_cents: null, counterparty: "A", occurred_at: "2026-09-10T10:00:00.000Z", category_id: "food", reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null, ...o });
const from = Date.parse("2026-09-01T00:00:00.000Z"), to = Date.parse("2026-10-01T00:00:00.000Z");

describe("stats", () => {
  const rows = [
    tx({ amount_cents: 1000, cost_cents: 50 }), tx({ amount_cents: 2000, category_id: null }),
    tx({ direction: "in", amount_cents: 5000, category_id: "inc" }), tx({ direction: "transfer", amount_cents: 9999, category_id: "tr" }),
    tx({ amount_cents: 700, category_id: "tr" }), tx({ amount_cents: 300, occurred_at: "2026-08-31T23:59:59.000Z" }),
  ];
  it("totals: out includes cost and untagged, excludes transfers; in excludes transfers", () => {
    expect(totals(rows, cats, from, to)).toEqual({ moneyIn: 5000, moneyOut: 3050 });
  });
  it("categoryTotals excludes untagged and transfer-kind, sorted desc", () => {
    expect(categoryTotals(rows, cats, from, to)).toEqual([{ categoryId: "food", name: "food", total: 1050 }]);
  });
  it("topDays, biggest, counterparties, categorySpend, dailyTotals", () => {
    expect(topDays(rows, cats, from, to)[0]).toMatchObject({ day: "2026-09-10", total: 3050 });
    expect(biggestExpenses(rows, cats, from, to)[0]!.amount_cents).toBe(2000);
    expect(topCounterparties(rows, cats, from, to)).toEqual([{ name: "A", total: 3050 }]);
    expect(categorySpend(rows, cats, "food", from, to)).toBe(1050);
    expect(dailyTotals(rows, cats, from, to)).toHaveLength(30);
  });
});
