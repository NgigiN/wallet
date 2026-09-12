import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewTab } from "../src/screens/ReviewTab";
import type { LocalCategory, LocalTx } from "../src/db/schema";
const cat = (id: string): LocalCategory => ({ id, name: id, kind: "expense", emoji: "x", color: "#B02E0C", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
const tx = (cents: number, iso: string): LocalTx => ({ id: iso + cents, space_id: "s", captured_by: null, source: "manual", receipt_code: null, direction: "out", amount_cents: cents, cost_cents: 0, balance_cents: null, counterparty: "x", occurred_at: iso, category_id: "food", reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null });
describe("ReviewTab", () => {
  it("renders trend, movers, pace and heatmap sections", () => {
    const now = new Date(); const iso = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 10).toISOString();
    render(<ReviewTab rows={[tx(5000, iso)]} cats={new Map([["food", cat("food")]])} period="month" refDate={now} />);
    expect(screen.getByText("Spend trend")).toBeInTheDocument();
    expect(screen.getByText("Category movers")).toBeInTheDocument();
    expect(screen.getByText(/At this pace/)).toBeInTheDocument();
    expect(screen.getByText("Spend calendar")).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
  });
});
