import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// Two rate limiters sit in front of /api/auth/*, and every browser context in the suite
// must land in its own bucket or the second spec of a run dies on "Sign up failed." (429):
//   - ours: 10 requests/min, keyed on `x-real-ip` first (server/src/middleware/rate-limit.ts);
//   - BetterAuth's built-in one, on by default under NODE_ENV=production, which allows only
//     3 requests per 10 s to /sign-up/email and /sign-in/email and keys on `x-forwarded-for`.
// So each context gets one synthetic IP announced in both headers. Real traffic reaches the
// server through nginx, which overwrites `X-Real-IP` with the true peer address.
// Random rather than a counter: Playwright starts a fresh worker process after a failed
// test, which would reset a counter and hand the next context an already-spent bucket.
const octet = () => 1 + Math.floor(Math.random() * 254);
const nextIp = () => `10.${octet()}.${octet()}.${octet()}`;
const ipHeaders = () => { const ip = nextIp(); return { "x-real-ip": ip, "x-forwarded-for": ip }; };

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.setExtraHTTPHeaders(ipHeaders());
    await use(context);
  },
});
export { expect };

/** A second, signed-out browser context standing in for the user's other device. */
export async function newDevice(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.setExtraHTTPHeaders(ipHeaders());
  return ctx;
}

/**
 * Tap "sync now" until `counterparty` shows up. The other device pushes on a 1.5 s
 * debounce, so its row may not be on the server yet when this device's opening sync runs —
 * this is the pull-to-refresh a user would do, not a bare timeout.
 */
export async function syncUntilVisible(page: Page, counterparty: string) {
  await expect(async () => {
    await badge(page, /Offline|Synced|Syncing/).click();
    await expect(page.getByText(counterparty).first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 25_000 });
}

export const fresh = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** The badge reads "Synced ⟳" / "Offline ⟳" / "Syncing… ⟳", so match on a substring. */
export const badge = (page: Page, re: RegExp) => page.getByText(re).first();

/**
 * A fresh account starts with an empty local store, so SpaceGate holds on
 * "Fetching your data…" until the first pull lands the 7 seeded categories. Give the
 * inbox a generous window: the first sync on a cold server can take a few seconds.
 */
const READY = { timeout: 15_000 };

export async function signUp(page: Page, email = fresh(), password = "correct-horse-battery") {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Recent")).toBeVisible(READY);
  return { email, password };
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Recent")).toBeVisible(READY);
}

export async function addTx(page: Page, amount: string, counterparty: string) {
  await page.goto("/add");
  await page.getByLabel("Amount (Ksh)").fill(amount);
  await page.getByLabel("Counterparty").fill(counterparty);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(counterparty).first()).toBeVisible();
}

/**
 * Open a row from the inbox, tag it with a category, save, and wait until the tagged row
 * is back on the inbox. Saving writes to IndexedDB and only then navigates back, so a
 * caller that fires `page.goto` straight after the click can tear the document down with
 * the write still in flight — the tag is then silently lost. Waiting on the rendered
 * category proves the write committed.
 */
export async function tag(page: Page, counterparty: string, category: RegExp) {
  await page.getByText(counterparty).first().click();
  await page.waitForURL(/\/tx\//);
  await page.getByRole("option", { name: category }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/tx/"));
  await expect(page.getByText(category).first()).toBeVisible();
}
