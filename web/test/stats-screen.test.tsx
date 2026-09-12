import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, setBudget, upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { MaskProvider } from "../src/hooks/useMask";
import { Stats } from "../src/screens/Stats";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });
// Stats subscribes to live Dexie queries, so a leftover mounted tree from a previous
// test keeps reacting to this file's beforeEach table clears; unmount it explicitly.
afterEach(cleanup);

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
});
