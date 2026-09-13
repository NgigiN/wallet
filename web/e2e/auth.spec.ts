import { expect, signIn, signUp, test } from "./helpers";

test("sign up, reload keeps session, sign out and back in", async ({ page }) => {
  const { email, password } = await signUp(page);

  await page.reload();
  await expect(page.getByText("Recent")).toBeVisible({ timeout: 15_000 });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/sign-in/);

  await signIn(page, email, password);
});
