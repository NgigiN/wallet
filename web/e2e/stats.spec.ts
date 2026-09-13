import { addTx, expect, signUp, tag, test } from "./helpers";

test("stats shows category totals and budget progress", async ({ page }) => {
  await signUp(page);

  await addTx(page, "1000", "Java");
  await tag(page, "Java", /food/);

  // "food" is the first pickable expense category (sort_order 0 in the server seed), so
  // the first "No limit" box is its monthly budget.
  await page.goto("/budgets");
  const input = page.getByPlaceholder("No limit").first();
  await input.fill("5000");
  await input.press("Enter");
  await expect(page.getByText(/Ksh 1,000 of Ksh 5,000/)).toBeVisible();

  await page.goto("/stats");
  await expect(page.getByText("Where it went")).toBeVisible();
  await expect(page.getByText("food")).toBeVisible();
  await expect(page.getByText(/of Ksh 5,000/)).toBeVisible();
});
