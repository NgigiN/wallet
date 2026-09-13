import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db, type LocalTx } from "../src/db/schema";
import { setCurrentSpaceId } from "../src/db/meta";
import { TransactionDetail } from "../src/screens/TransactionDetail";

const S = "s1";
const OCCURRED = "2026-09-13T06:08:00.000Z";

async function seed(over: Partial<LocalTx> = {}) {
  const row: LocalTx = {
    id: "t1", space_id: S, captured_by: null, source: "manual", receipt_code: null, direction: "out",
    amount_cents: 150000, cost_cents: 0, balance_cents: null, counterparty: "Naivas", occurred_at: OCCURRED,
    category_id: null, reason: null, linked_transaction_id: null, client_updated_at: OCCURRED, seq: 3,
    updated_at: OCCURRED, deleted_at: null, sync_state: "clean", sync_error: null, ...over,
  };
  await db.transactions.put(row);
  return row;
}
// Two entries so the screen's nav(-1) after a save has somewhere to go.
const renderDetail = () => render(
  <MemoryRouter initialEntries={["/", "/tx/t1"]} initialIndex={1}>
    <Routes><Route path="/" element={<div>HOME</div>} /><Route path="/tx/:id" element={<TransactionDetail />} /></Routes>
  </MemoryRouter>,
);
const saved = () => waitFor(async () => expect((await db.transactions.get("t1"))!.sync_state).toBe("dirty"));

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });

describe("TransactionDetail", () => {
  it("shows the rejection copy for a row the engine re-queued as dirty (sync_error set, not error state)", async () => {
    await seed({ sync_state: "dirty", sync_error: "bad_category" });
    renderDetail();
    await screen.findByDisplayValue("Naivas");
    expect(screen.getByText(/That category no longer exists/)).toBeInTheDocument();
  });
  it("saves an untouched manual row without shifting occurred_at", async () => {
    await seed();
    renderDetail();
    await screen.findByDisplayValue("Naivas");
    fireEvent.click(screen.getByText("Save"));
    await saved();
    expect((await db.transactions.get("t1"))!.occurred_at.slice(0, 16)).toBe(OCCURRED.slice(0, 16));
  });

  it("keeps a transfer row's direction and hides the in/out control", async () => {
    await seed({ direction: "transfer" });
    renderDetail();
    await screen.findByDisplayValue("Naivas");
    expect(screen.queryByLabelText("Direction")).toBeNull();
    fireEvent.click(screen.getByText("Save"));
    await saved();
    expect((await db.transactions.get("t1"))!.direction).toBe("transfer");
  });

  it("refuses to save a manual row with no date, and says so", async () => {
    await seed();
    renderDetail();
    const when = await screen.findByLabelText<HTMLInputElement>("When");
    // The screen fills this input from an effect that runs after the row loads; clearing it
    // before that lands would simply be overwritten.
    await waitFor(() => expect(when.value).not.toBe(""));
    fireEvent.change(when, { target: { value: "" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("Pick a date and time.")).toBeInTheDocument();
    expect((await db.transactions.get("t1"))!.sync_state).toBe("clean");
  });
});
