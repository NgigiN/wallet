import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { setBudget, upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { Categories } from "../src/screens/Categories";
import { Budgets } from "../src/screens/Budgets";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });
describe("Categories", () => {
  it("adds a category and blocks a duplicate name", async () => {
    await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    render(<MemoryRouter><Categories /></MemoryRouter>);
    await screen.findByText("food"); // wait for the seeded category to load before racing the Add sheet
    fireEvent.click(screen.getByText("Add category"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FOOD" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/already have a category/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rent" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(async () => expect((await db.categories.toArray()).map((c) => c.name).sort()).toEqual(["Rent", "food"]));
  });

  it("disables the archive control for a built-in category, with a hint", async () => {
    await db.categories.put({ id: "sys1", name: "Uncategorised", kind: "expense", emoji: "🧾", color: "#607468", sort_order: 0, archived: false, is_system: true, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: S, sync_state: "clean", sync_error: null });
    render(<MemoryRouter><Categories /></MemoryRouter>);
    const btn = await screen.findByLabelText("Built-in categories can't be archived");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    await new Promise((r) => setTimeout(r, 0));
    expect((await db.categories.get("sys1"))!.archived).toBe(false);
  });
});

describe("Budgets", () => {
  it("saves a monthly limit typed into the amount input", async () => {
    await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    render(<MemoryRouter><Budgets /></MemoryRouter>);
    const input = await screen.findByPlaceholderText("No limit");
    fireEvent.change(input, { target: { value: "5000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    await waitFor(async () => {
      const rows = await db.budgets.toArray();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.monthly_limit_cents).toBe(500000);
    });
  });

  it("commits a typed budget once; an unchanged blur afterwards doesn't re-dirty it", async () => {
    await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    render(<MemoryRouter><Budgets /></MemoryRouter>);
    const input = await screen.findByPlaceholderText("No limit");
    fireEvent.change(input, { target: { value: "5000" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    await waitFor(async () => expect(await db.budgets.toArray()).toHaveLength(1));
    const first = (await db.budgets.toArray())[0]!;
    fireEvent.blur(input); // blur again with no intervening edit
    await new Promise((r) => setTimeout(r, 0));
    const rows = await db.budgets.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_updated_at).toBe(first.client_updated_at);
  });
});

describe("rejected rows", () => {
  it("explains a category the server bounced, in the row itself", async () => {
    const id = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await db.categories.update(id, { sync_state: "error", sync_error: "duplicate_name" });
    render(<MemoryRouter><Categories /></MemoryRouter>);
    expect(await screen.findByText("A category with that name already exists.")).toBeInTheDocument();
  });

  it("explains a budget the server bounced, under its row", async () => {
    const cat = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    const id = await setBudget(S, cat, 500000);
    await db.budgets.update(id, { sync_state: "error", sync_error: "duplicate_budget" });
    render(<MemoryRouter><Budgets /></MemoryRouter>);
    expect(await screen.findByText("That category already has a budget.")).toBeInTheDocument();
  });
});
