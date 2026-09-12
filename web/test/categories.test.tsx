import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { upsertCategory } from "../src/db/repo";
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
});
