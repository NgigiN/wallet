import { defineConfig, devices } from "@playwright/test";

const PORT = 8089;
const DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://wallet:wallet@127.0.0.1:5434/wallet";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // One worker: the suite hits the real server, whose /api/auth/* rate limit is 10
  // requests/min per IP. Sequential specs keep every run well under that.
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // Ruling R-1B-5: the phone viewport/touch profile of an iPhone 13, driven by the
    // chromium engine (webkit is not installed in CI).
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    // Playwright does not attach context-level headers to requests a service worker
    // relays, and the built app's Workbox config puts /api/* behind a NetworkOnly route.
    // With the SW in play the per-test `x-real-ip` below is dropped from some auth calls,
    // they all fall into one shared rate-limit bucket, and a random get-session comes back
    // 429 — which the app reads as "signed out". Blocking the SW keeps the bucketing
    // deterministic. Nothing here depends on the SW: the app is a SPA, so the offline spec
    // never needs a network-served navigation. Installability and the SW itself are
    // verified on staging (PROGRESS.md D1B.1).
    serviceWorkers: "block",
  },
  webServer: {
    command:
      `npm run build && cd ../server && npm run build && ` +
      `PORT=${PORT} STATIC_DIR=../web/dist DATABASE_URL=${DATABASE_URL} ` +
      `BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://127.0.0.1:${PORT} ` +
      `TRUSTED_ORIGINS=http://127.0.0.1:${PORT} MIN_CLIENT_WEB=0.0.0 NODE_ENV=production node dist/index.js`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
