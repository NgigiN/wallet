import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, setBudget, upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { MaskProvider } from "../src/hooks/useMask";
import { Stats } from "../src/screens/Stats";
import { dayLabel, toDayKey } from "../src/logic/dates";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });

describe("Stats period tab", () => {
  it("shows category bars with direct labels and a budget bar in month view", async () => {
    const food = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await createManualTransaction(S, { direction: "out", amount_cents: 150000, counterparty: "Naivas", occurred_at: new Date().toISOString(), category_id: food, reason: null });
    await setBudget(S, food, 200000);
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Where it went")).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
    expect(screen.getByText(/of Ksh 2,000/)).toBeInTheDocument(); // budget progress label
    expect(screen.getByText("Top counterparties")).toBeInTheDocument();
  });
  it("shows the empty state when the period has no rows", async () => {
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });
  it("shows the true over-budget percentage while the bar itself stays clamped", async () => {
    const food = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await createManualTransaction(S, { direction: "out", amount_cents: 150000, counterparty: "Naivas", occurred_at: new Date().toISOString(), category_id: food, reason: null });
    await setBudget(S, food, 100000);
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    const whereItWent = (await screen.findByText("Where it went")).closest("section")!;
    expect(within(whereItWent).getByText(/150% of Ksh 1,000/)).toBeInTheDocument();
    expect(within(whereItWent).getByText("Ksh 1,500")).toBeInTheDocument();
  });
  it("shows 'No spending this period.' for an income-only period, not the untagged copy", async () => {
    await createManualTransaction(S, { direction: "in", amount_cents: 500000, counterparty: "Employer", occurred_at: new Date().toISOString(), category_id: null, reason: null });
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Where it went")).toBeInTheDocument();
    expect(screen.getByText("No spending this period.")).toBeInTheDocument();
    expect(screen.queryByText("Everything in this period is untagged.")).not.toBeInTheDocument();
  });
  it("files a transaction just after local midnight under today's local day, not UTC's", async () => {
    const food = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    const now = new Date();
    const localMidnightThirty = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30, 0);
    const occurredAt = localMidnightThirty.toISOString();
    await createManualTransaction(S, { direction: "out", amount_cents: 90000, counterparty: "Kiosk", occurred_at: occurredAt, category_id: food, reason: null });
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    const biggest = (await screen.findByText("Biggest expenses")).closest("section")!;
    expect(within(biggest).getByText(dayLabel(toDayKey(occurredAt)))).toBeInTheDocument();
  });
});
