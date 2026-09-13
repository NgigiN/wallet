import { addTx, badge, expect, newDevice, signIn, signUp, syncUntilVisible, tag, test } from "./helpers";

test("add, tag, and see it from a second device", async ({ page, browser }) => {
  const { email, password } = await signUp(page);

  await addTx(page, "1,500", "Naivas");
  await expect(page.getByText("Needs a category")).toBeVisible();

  await tag(page, "Naivas", /food/);
  await expect(page.getByText("Needs a category")).toHaveCount(0);
  await badge(page, /Synced/).waitFor({ timeout: 15_000 });

  // A second browser context signed in as the same user proves the row went through the
  // server, not just through this tab's IndexedDB.
  const ctx2 = await newDevice(browser);
  const p2 = await ctx2.newPage();
  await signIn(p2, email, password);
  await syncUntilVisible(p2, "Naivas");
  await ctx2.close();
});
