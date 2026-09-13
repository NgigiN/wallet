import { badge, expect, newDevice, signIn, signUp, syncUntilVisible, test } from "./helpers";

test("edits made offline sync when back online", async ({ page, context, browser }) => {
  const { email, password } = await signUp(page);

  // Open the form first, then pull the plug: everything after this point — the local write
  // and the hop back to the inbox — is client-side, which is the whole point of the
  // offline-first store.
  await page.goto("/add");
  await expect(page.getByLabel("Amount (Ksh)")).toBeVisible();
  await context.setOffline(true);

  await page.getByLabel("Amount (Ksh)").fill("250");
  await page.getByLabel("Counterparty").fill("Boda");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Boda").first()).toBeVisible();
  await expect(badge(page, /Offline/)).toBeVisible();

  await context.setOffline(false);
  await badge(page, /Offline|Synced|Syncing/).click();
  await badge(page, /Synced/).waitFor({ timeout: 15_000 });

  const ctx2 = await newDevice(browser);
  const p2 = await ctx2.newPage();
  await signIn(p2, email, password);
  await syncUntilVisible(p2, "Boda");
  await ctx2.close();
});
