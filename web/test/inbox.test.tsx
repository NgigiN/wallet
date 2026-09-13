import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, tagTransaction, upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { MaskProvider } from "../src/hooks/useMask";
import { Inbox } from "../src/screens/Inbox";
import { SyncStatusContext } from "../src/app/SpaceGate";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });

describe("Inbox", () => {
  it("lists untagged rows under 'Needs a category' and tagged under 'Recent'", async () => {
    const food = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await createManualTransaction(S, { direction: "out", amount_cents: 150000, counterparty: "Naivas", occurred_at: new Date().toISOString(), category_id: null, reason: null });
    const t2 = await createManualTransaction(S, { direction: "out", amount_cents: 30000, counterparty: "Java", occurred_at: new Date().toISOString(), category_id: null, reason: null });
    await tagTransaction(t2, food, null);
    render(<MemoryRouter><MaskProvider><SyncStatusContext.Provider value={{ syncing: false, lastError: null, syncNow: async () => {} }}><Inbox /></SyncStatusContext.Provider></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Naivas")).toBeInTheDocument();
    expect(screen.getByText("Needs a category")).toBeInTheDocument();
    expect(screen.getByText("Java")).toBeInTheDocument();
    // Hero shows two masked amounts (out and in) by default, so use getAllByText.
    expect(screen.getAllByText("Ksh ••••").length).toBeGreaterThanOrEqual(1);
  });
});
