# Wallet v2 — Phase 1B Web PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the installable web app in `web/` (the iPhone app and the laptop dashboard) against the live `server/` API: sign in, local-first inbox/tag/add, stats and review parity with Android, categories and budgets, settings; ship it inside the API image so staging serves it at `/`.

**Architecture:** Vite + React 19 SPA served by the Hono server as static files at the same origin as `/api`. All reads come from a local Dexie (IndexedDB) copy of the user's spaces; every edit marks a row `dirty`; a sync engine pushes dirty rows in chunks of ≤1000 to `POST /api/v2/spaces/:id/sync`, adopts server ids from the results, then pulls from the stored cursor via `GET .../sync?since=` until `more` is false. Stats and review insights are pure TypeScript ports of the Android Kotlin logic, computed from Dexie. Auth is BetterAuth's React client over same-origin cookies.

**Tech Stack:** Vite 6, React 19, TypeScript 5, react-router 7 (declarative), Dexie 4 + dexie-react-hooks, better-auth/react client, vite-plugin-pwa (Workbox), uuid v11 (`v7()`), plain CSS with custom properties (no Tailwind), Vitest + fake-indexeddb + @testing-library/react, Playwright, sharp (icon generation, dev only).

**Spec:** `docs/superpowers/specs/2026-09-11-wallet-v2-multi-user-platform-design.md` — sections 7 (sync protocol incl. 7.5 client obligations), 9 (web PWA), 11.2 (endpoints). Tracker: `docs/superpowers/PROGRESS.md` Stage 1B (update the matching line after each task, same PR).

## Global Constraints

- Same origin in every environment: production `https://wallet.samtama.lol`, staging `https://wallet-staging.samtama.lol`, dev `http://localhost:5173` proxied to the server on `http://127.0.0.1:8080` (vite `server.proxy` for `/api` and `/health`). Never call an absolute API host from the app.
- Every `/api/v2/*` request sends `X-Client: web/<version>` where `<version>` is `web/package.json`'s `version` (injected via `import.meta.env.VITE_APP_VERSION`). A 426 response shows the blocking upgrade screen; a 401 signs the user out.
- Money is integer cents in Dexie and on the wire (`amount_cents`, `cost_cents`, `balance_cents`, `monthly_limit_cents`). Display via `formatKes(cents)`. Never floats in storage.
- Wire shapes are exactly the server's (snake_case): transactions `{ id, captured_by, source, receipt_code, direction, amount_cents, cost_cents, balance_cents, counterparty, occurred_at, category_id, reason, linked_transaction_id, client_updated_at, seq, updated_at, deleted_at }`; categories `{ id, name, kind, emoji, color, sort_order, archived, is_system, client_updated_at, seq, updated_at, deleted_at }`; budgets `{ id, category_id, monthly_limit_cents, client_updated_at, seq, updated_at, deleted_at }`; rules `{ id, match_counterparty, category_id, created_by, client_updated_at, seq, updated_at, deleted_at }`. Push accepts the same minus server-only fields (`captured_by`, `linked_transaction_id`, `seq`, `updated_at`, `created_by`).
- Sync client obligations (spec §7.5): after every push, pull from the STORED cursor (never store the push's `cursor`); when `result.row.id !== result.id`, adopt the server id and delete the local duplicate; at most 1000 rows per push, chunks pushed sequentially with a pull after each.
- Local rows carry `sync_state: "clean" | "dirty" | "error"` and `sync_error: string | null`; any local edit sets `client_updated_at = new Date().toISOString()` and `sync_state = "dirty"`.
- Stats exclude `direction = "transfer"` and rows whose category `kind` is `transfer`; money out = `amount_cents + cost_cents` of `out` rows; money in = `amount_cents` of `in` rows; periods are Monday-start ISO weeks, calendar months, calendar years in the browser's zone (matches Android).
- Header amounts are hidden by default (`Ksh ••••`) with an eye toggle that is NOT persisted (user's explicit preference).
- Design tokens (from the Android "canopy" theme): hero gradient `#0B4A33 → #17966B`, on-hero `#F2FBF4`, money-in `#1B7F4B` (dark `#4CAE78`), money-out `#B02E0C` (dark `#E06A3C`), gold `#AC8112`, category fallback `#607468`; font Sora (bundled `sora.ttf` from `android/app/src/main/res/font/`, OFL) with system-ui fallback; category emoji/colour come from the synced category row, the token map is only the fallback.
- Errors from the API are `{ error: "<code>", message? }`; the app maps codes to copy in one place (`src/api/errors.ts`).
- Branch flow: feature branch `feat/web-1b` from `v2` → PR into `v2` → CI green (`test`, `android-test`, `server-test`, and the new `web-test`) → merge. Commit messages end with `Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt`, no AI attribution lines.
- Controller rulings baked into this plan: (R-1B-1) TanStack Query is dropped — Dexie `useLiveQuery` is the read layer and the sync engine is the only network path; (R-1B-2) the Docker build context becomes the repo root so the image builds `web/` and copies `web/dist` to `/app/public` (replaces Phase 1A ruling R5); (R-1B-3) CORS is not added — dev uses the vite proxy so the app is always same-origin.

---

## File structure (Phase 1B)

```
web/
  package.json               scripts: dev, build, preview, test, test:e2e, typecheck, icons
  vite.config.ts             react + VitePWA + /api proxy + VITE_APP_VERSION define
  tsconfig.json, tsconfig.node.json
  vitest.config.ts           jsdom, fake-indexeddb setup
  playwright.config.ts
  index.html                 meta viewport-fit=cover, apple-mobile-web-app-*, theme-color
  public/
    fonts/sora.ttf
    icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon-180.png (generated)
  scripts/icons.mjs          sharp: SVG → PNGs
  src/
    main.tsx                 router + providers
    app/App.tsx              routes
    app/Shell.tsx            bottom tab bar (<900px) / left rail (≥900px), safe-area insets
    app/routes.tsx           route table
    theme/tokens.css         custom properties, light + dark
    theme/base.css           reset, typography, utilities
    theme/categories.ts      fallback emoji/colour map + `categoryStyle(cat)`
    api/client.ts            apiFetch(): X-Client, JSON, error mapping, 401/426 hooks
    api/errors.ts            error code → message
    api/auth.ts              better-auth react client
    api/spaces.ts            GET /spaces, ping
    api/devices.ts           POST /me/devices
    api/sync.ts              pull(), push() typed wrappers
    db/schema.ts             Dexie db + table types
    db/repo.ts               write helpers that stamp client_updated_at + dirty
    db/meta.ts               cursors, current space, device id
    sync/engine.ts           runSync(spaceId): push chunks → adopt → pull loop
    sync/useSync.ts          triggers: mount, online, visibilitychange, 5-min interval, after edits
    logic/money.ts           formatKes, parseKesInput
    logic/period.ts          Period, range, step, label, periodsInRange
    logic/stats.ts           totals, categoryTotals, topDays, biggest, counterparties, dailyTotals
    logic/review.ts          trendSeries, savingsRate, categoryMovers, heatmapBuckets, paceProjection
    logic/budget.ts          budgetProgress (spend vs limit, level 0/1/2)
    components/Amount.tsx    masked amount with eye toggle (context)
    components/CategoryChip.tsx, CategoryGrid.tsx, Sheet.tsx, SectionCard.tsx, EmptyState.tsx, PeriodNav.tsx
    screens/SignIn.tsx, SignUp.tsx
    screens/Inbox.tsx, TransactionDetail.tsx (tag / re-tag / delete)
    screens/AddTransaction.tsx
    screens/Stats.tsx, ReviewTab.tsx
    screens/Categories.tsx, Budgets.tsx
    screens/Settings.tsx, Privacy.tsx, Upgrade.tsx (426)
    hooks/useSpace.ts        current space id (meta) + spaces list
    hooks/useMask.ts         amount masking context
  test/
    setup.ts                 fake-indexeddb/auto + testing-library
    money.test.ts period.test.ts stats.test.ts review.test.ts budget.test.ts
    repo.test.ts engine.test.ts client.test.ts
  e2e/
    auth.spec.ts inbox.spec.ts stats.spec.ts offline.spec.ts
server/
  Dockerfile                 (modified) builds web/ and copies dist → /app/public
deploy/compose.yml           (modified) build context ../ (repo root)
.github/workflows/ci.yml     (modified) web-test job (typecheck, unit, build, e2e)
```

---

### Task 1: Scaffold, PWA manifest, icons, dev proxy

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/vitest.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/app/App.tsx`, `web/scripts/icons.mjs`, `web/public/fonts/sora.ttf` (copied), `web/public/icons/*.png` (generated), `web/test/setup.ts`, `web/test/smoke.test.tsx`
- Modify: `.gitignore` (ensure `web/dist` ignored, `web/public` NOT ignored — Phase 0 already removed the `public` rule; verify)

**Interfaces:**
- Produces: `import.meta.env.VITE_APP_VERSION: string`; `npm run dev` on 5173 proxying `/api` and `/health` to `http://127.0.0.1:8080`; `npm run build` → `web/dist` with `manifest.webmanifest`, `sw.js`, `registerSW.js`.

- [ ] **Step 1: Initialise**

```bash
mkdir -p web/src/app web/public/fonts web/public/icons web/scripts web/test && cd web
npm init -y >/dev/null
npm pkg set name=wallet-web version=0.1.0 type=module private=true
npm pkg set scripts.dev="vite" scripts.build="tsc -p tsconfig.json --noEmit && vite build" scripts.preview="vite preview" scripts.test="vitest run" scripts.test:e2e="playwright test" scripts.typecheck="tsc -p tsconfig.json --noEmit" scripts.icons="node scripts/icons.mjs"
npm i react react-dom react-router dexie dexie-react-hooks better-auth uuid
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vite-plugin-pwa vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event fake-indexeddb sharp @playwright/test
cp ../android/app/src/main/res/font/sora.ttf public/fonts/sora.ttf
```

- [ ] **Step 2: Config files**

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "vite-plugin-pwa/client"]
  },
  "include": ["src", "test", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`web/tsconfig.node.json`:
```json
{ "compilerOptions": { "composite": true, "module": "ESNext", "moduleResolution": "bundler", "types": ["node"] }, "include": ["vite.config.ts", "scripts"] }
```

`web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/sora.ttf", "icons/apple-touch-icon-180.png"],
      manifest: {
        name: "Wallet",
        short_name: "Wallet",
        description: "Track M-PESA, Airtel and cash spending.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0B4A33",
        theme_color: "#0B4A33",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        globPatterns: ["**/*.{js,css,html,ttf,png,svg,webmanifest}"],
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.startsWith("/api/"), handler: "NetworkOnly" }],
      },
    }),
  ],
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080", changeOrigin: false },
      "/health": { target: "http://127.0.0.1:8080", changeOrigin: false },
    },
  },
  build: { sourcemap: true },
});
```

`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify("0.1.0-test") },
  test: { environment: "jsdom", setupFiles: ["test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"], css: false },
});
```

`web/test/setup.ts`:
```ts
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
```

`web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0B4A33" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Wallet" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
    <title>Wallet</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Icon generator**

`web/scripts/icons.mjs`:
```js
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B4A33"/><stop offset="1" stop-color="#17966B"/></linearGradient></defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
  <rect x="${128 + pad}" y="${168 + pad}" width="${256 - 2 * pad}" height="${176 - 2 * pad}" rx="28" fill="#F2FBF4"/>
  <rect x="${128 + pad}" y="${216 + pad}" width="${256 - 2 * pad}" height="28" fill="#0B4A33"/>
  <circle cx="${352 - pad}" cy="${276}" r="22" fill="#AC8112"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });
const out = async (name, size, pad = 0) => sharp(Buffer.from(svg(pad))).resize(size, size).png().toFile(`public/icons/${name}`);
await out("icon-192.png", 192);
await out("icon-512.png", 512);
await out("maskable-512.png", 512, 48);
await out("apple-touch-icon-180.png", 180);
console.log("icons written");
```
Run: `npm run icons` → four PNGs in `public/icons/`. Commit them.

- [ ] **Step 4: Failing smoke test**

`web/test/smoke.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";

describe("App", () => {
  it("renders the shell title", () => {
    render(<App />);
    expect(screen.getByText("Wallet")).toBeInTheDocument();
  });
});
```
Run: `npx vitest run` → FAIL, module missing.

- [ ] **Step 5: Minimal app**

`web/src/app/App.tsx`:
```tsx
export function App() {
  return <h1>Wallet</h1>;
}
```
`web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./theme/tokens.css";
import "./theme/base.css";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```
Create empty `src/theme/tokens.css` and `src/theme/base.css` (Task 2 fills them).

- [ ] **Step 6: Verify and commit**

Run: `cd web && npx vitest run && npm run typecheck && npm run build && ls dist | grep -E "manifest.webmanifest|sw.js"`
Expected: 1 test passed; typecheck clean; build emits manifest and service worker.

```bash
git checkout -b feat/web-1b v2
git add web .gitignore && git commit -m "feat(web): scaffold Vite + React PWA with manifest, icons, dev proxy

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 2: Theme tokens, base styles, shell, amount masking

**Files:**
- Create: `web/src/theme/tokens.css`, `web/src/theme/base.css`, `web/src/theme/categories.ts`, `web/src/hooks/useMask.tsx`, `web/src/components/Amount.tsx`, `web/src/components/SectionCard.tsx`, `web/src/components/EmptyState.tsx`, `web/src/components/Sheet.tsx`, `web/src/app/Shell.tsx`, `web/src/logic/money.ts`
- Test: `web/test/money.test.ts`, `web/test/amount.test.tsx`

**Interfaces:**
- Produces: `formatKes(cents: number): string` ("Ksh 2,340" / "Ksh 2,340.50" / "−Ksh 500"), `parseKesInput(text: string): number | null` (cents), `MaskProvider`, `useMask(): { hidden: boolean; toggle(): void }`, `<Amount cents direction? masked?/>`, `<Shell>` with `<Outlet/>` and tabs Inbox / Add / Stats / Settings, `categoryStyle(cat: { emoji?: string; color?: string; name?: string } | undefined): { emoji: string; color: string }`.

- [ ] **Step 1: Failing tests**

`web/test/money.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { formatKes, parseKesInput } from "../src/logic/money";

describe("formatKes", () => {
  it("formats whole and fractional cents like Android", () => {
    expect(formatKes(234000)).toBe("Ksh 2,340");
    expect(formatKes(234050)).toBe("Ksh 2,340.50");
    expect(formatKes(-50000)).toBe("−Ksh 500");
    expect(formatKes(0)).toBe("Ksh 0");
  });
});
describe("parseKesInput", () => {
  it("accepts commas and decimals, rejects junk", () => {
    expect(parseKesInput("2,340.5")).toBe(234050);
    expect(parseKesInput("300")).toBe(30000);
    expect(parseKesInput("0")).toBeNull();
    expect(parseKesInput("abc")).toBeNull();
    expect(parseKesInput("12.345")).toBe(1235);
  });
});
```

`web/test/amount.test.tsx`:
```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaskProvider } from "../src/hooks/useMask";
import { Amount } from "../src/components/Amount";

describe("Amount masking", () => {
  it("is hidden by default when masked and reveals on toggle", () => {
    render(<MaskProvider><Amount cents={123400} masked /><button data-testid="eye" onClick={() => {}} /></MaskProvider>);
    expect(screen.getByText("Ksh ••••")).toBeInTheDocument();
  });
  it("shows the value when not masked", () => {
    render(<MaskProvider><Amount cents={123400} /></MaskProvider>);
    expect(screen.getByText("Ksh 1,234")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

`web/src/logic/money.ts`:
```ts
const fmtWhole = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const fmtFrac = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Ksh 2,340" for whole shillings, "Ksh 2,340.50" otherwise, "−Ksh 500" when negative. */
export function formatKes(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const body = abs % 100 === 0 ? fmtWhole.format(abs / 100) : fmtFrac.format(abs / 100);
  return `${sign}Ksh ${body}`;
}

export const MASKED = "Ksh ••••";

/** "2,340.5" → 234050 cents; null for empty, zero, negative, or non-numeric. Rounds half-up to the cent. */
export function parseKesInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents > 0 ? cents : null;
}
```

`web/src/hooks/useMask.tsx`:
```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Mask = { hidden: boolean; toggle(): void };
const Ctx = createContext<Mask>({ hidden: true, toggle() {} });

/** Header amounts start hidden on every load; the choice is deliberately not persisted. */
export function MaskProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(true);
  const value = useMemo(() => ({ hidden, toggle: () => setHidden((h) => !h) }), [hidden]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useMask = () => useContext(Ctx);
```

`web/src/components/Amount.tsx`:
```tsx
import { formatKes, MASKED } from "../logic/money";
import { useMask } from "../hooks/useMask";

export function Amount({ cents, direction, masked = false, className = "" }:
  { cents: number; direction?: "in" | "out" | "transfer"; masked?: boolean; className?: string }) {
  const { hidden } = useMask();
  const tone = direction === "in" ? "money-in" : direction === "out" ? "money-out" : "";
  return <span className={`amount ${tone} ${className}`}>{masked && hidden ? MASKED : formatKes(cents)}</span>;
}
```

`web/src/theme/categories.ts`:
```ts
export const FALLBACK: Record<string, { emoji: string; color: string }> = {
  food: { emoji: "🍛", color: "#B02E0C" }, travel: { emoji: "🚌", color: "#2B6CB0" },
  savings: { emoji: "🐖", color: "#C43A8A" }, church: { emoji: "⛪", color: "#8B5CF6" },
  investments: { emoji: "📈", color: "#AC8112" }, income: { emoji: "💰", color: "#1B7F4B" },
  transfer: { emoji: "🔁", color: "#607468" },
};
export const CATEGORY_FALLBACK = { emoji: "🧾", color: "#607468" };

export function categoryStyle(cat?: { emoji?: string; color?: string; name?: string } | null) {
  if (cat?.emoji && cat?.color) return { emoji: cat.emoji, color: cat.color };
  return (cat?.name && FALLBACK[cat.name]) || CATEGORY_FALLBACK;
}
```

`web/src/theme/tokens.css`:
```css
@font-face { font-family: "Sora"; src: url("/fonts/sora.ttf") format("truetype"); font-weight: 300 800; font-display: swap; }
:root {
  color-scheme: light dark;
  --font: "Sora", system-ui, -apple-system, "Segoe UI", sans-serif;
  --hero-top: #0B4A33; --hero-bottom: #17966B; --on-hero: #F2FBF4; --on-hero-dim: #BFE3CC;
  --on-hero-in: #9FE3BE; --on-hero-out: #FFC7AE;
  --money-in: #1B7F4B; --money-out: #B02E0C; --gold: #AC8112; --cat-fallback: #607468;
  --bg: #F6F8F6; --surface: #FFFFFF; --surface-2: #EEF3EF; --text: #14201A; --text-dim: #5C6B62; --line: #DCE5DE;
  --accent: #17966B; --danger: #B02E0C; --radius: 14px; --radius-lg: 22px;
  --safe-top: env(safe-area-inset-top, 0px); --safe-bottom: env(safe-area-inset-bottom, 0px);
  --tab-h: 64px;
}
@media (prefers-color-scheme: dark) {
  :root { --money-in: #4CAE78; --money-out: #E06A3C; --bg: #0E1512; --surface: #16201B; --surface-2: #1E2A24; --text: #EAF2EC; --text-dim: #9DB0A4; --line: #2A3A31; }
}
```

`web/src/theme/base.css`:
```css
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: inherit; }
.shell { min-height: 100dvh; display: flex; flex-direction: column; }
.shell-main { flex: 1; padding: 0 16px calc(var(--tab-h) + var(--safe-bottom) + 16px); max-width: 640px; width: 100%; margin: 0 auto; }
.tabbar { position: fixed; left: 0; right: 0; bottom: 0; height: calc(var(--tab-h) + var(--safe-bottom)); padding-bottom: var(--safe-bottom); display: grid; grid-template-columns: repeat(4, 1fr); background: var(--surface); border-top: 1px solid var(--line); }
.tabbar a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-decoration: none; font-size: 12px; color: var(--text-dim); }
.tabbar a.active { color: var(--accent); font-weight: 600; }
.tabbar .icon { font-size: 22px; line-height: 1; }
.hero { background: linear-gradient(160deg, var(--hero-top), var(--hero-bottom)); color: var(--on-hero); padding: calc(var(--safe-top) + 20px) 20px 20px; border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
.hero .dim { color: var(--on-hero-dim); font-size: 13px; }
.hero .big { font-size: 34px; font-weight: 700; letter-spacing: -0.5px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; margin: 14px 0; }
.card h3 { margin: 0 0 10px; font-size: 14px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); }
.row:last-child { border-bottom: none; }
.row .grow { flex: 1; min-width: 0; }
.row .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .sub { font-size: 12px; color: var(--text-dim); }
.money-in { color: var(--money-in); } .money-out { color: var(--money-out); }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 999px; border: 1.5px solid transparent; background: var(--surface-2); font-size: 14px; }
.chip.selected { border-color: var(--chip-color, var(--accent)); background: color-mix(in srgb, var(--chip-color, var(--accent)) 18%, transparent); }
.grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.btn { border: none; border-radius: 12px; padding: 12px 16px; font-weight: 600; background: var(--accent); color: #fff; width: 100%; }
.btn.secondary { background: var(--surface-2); color: var(--text); }
.btn.danger { background: var(--danger); }
.btn:disabled { opacity: .5; cursor: default; }
.field { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.field input, .field select, .field textarea { padding: 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); }
.field label { font-size: 13px; color: var(--text-dim); }
.error { color: var(--danger); font-size: 13px; }
.sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; justify-content: center; z-index: 20; }
.sheet { background: var(--surface); width: 100%; max-width: 640px; border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding: 16px 16px calc(16px + var(--safe-bottom)); max-height: 90dvh; overflow: auto; }
.empty { text-align: center; color: var(--text-dim); padding: 40px 16px; }
.bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--bar-color, var(--accent)); }
.iconbtn { background: transparent; border: none; color: inherit; font-size: 20px; padding: 6px; }
@media (min-width: 900px) {
  .shell { flex-direction: row; }
  .tabbar { position: sticky; top: 0; height: 100dvh; width: 200px; grid-template-columns: 1fr; grid-auto-rows: 56px; align-content: start; border-top: none; border-right: 1px solid var(--line); padding: 20px 0; }
  .tabbar a { flex-direction: row; justify-content: flex-start; padding-left: 20px; gap: 12px; font-size: 14px; }
  .shell-main { padding-bottom: 32px; max-width: 900px; }
  .hero { border-radius: var(--radius-lg); margin-top: 20px; }
}
```

`web/src/components/SectionCard.tsx`:
```tsx
import type { ReactNode } from "react";
export function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="card"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>{title}</h3>{action}</div>{children}</section>;
}
```
`web/src/components/EmptyState.tsx`:
```tsx
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return <div className="empty"><div style={{ fontSize: 40 }}>🌿</div><div style={{ fontWeight: 600 }}>{title}</div>{hint && <div style={{ fontSize: 13 }}>{hint}</div>}</div>;
}
```
`web/src/components/Sheet.tsx`:
```tsx
import type { ReactNode } from "react";
export function Sheet({ open, onClose, children }: { open: boolean; onClose(): void; children: ReactNode }) {
  if (!open) return null;
  return <div className="sheet-backdrop" onClick={onClose}><div className="sheet" role="dialog" onClick={(e) => e.stopPropagation()}>{children}</div></div>;
}
```
`web/src/app/Shell.tsx`:
```tsx
import { NavLink, Outlet } from "react-router";
const tabs = [
  { to: "/", label: "Inbox", icon: "📥" }, { to: "/add", label: "Add", icon: "➕" },
  { to: "/stats", label: "Stats", icon: "📊" }, { to: "/settings", label: "Settings", icon: "⚙️" },
];
export function Shell() {
  return (
    <div className="shell">
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><span className="icon">{t.icon}</span>{t.label}</NavLink>)}
      </nav>
      <main className="shell-main"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 3: Run, commit**

Run: `cd web && npx vitest run && npm run typecheck` → all pass.
```bash
git add web && git commit -m "feat(web): canopy theme tokens, base styles, shell, money formatting, amount masking

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 3: API client, auth client, sign-in/up, route guards, 426 screen

**Files:**
- Create: `web/src/api/client.ts`, `web/src/api/errors.ts`, `web/src/api/auth.ts`, `web/src/api/spaces.ts`, `web/src/api/devices.ts`, `web/src/screens/SignIn.tsx`, `web/src/screens/SignUp.tsx`, `web/src/screens/Upgrade.tsx`, `web/src/app/routes.tsx`, `web/src/app/RequireAuth.tsx`
- Modify: `web/src/app/App.tsx`, `web/src/main.tsx`
- Test: `web/test/client.test.ts`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, init?: RequestInit): Promise<T>` throwing `ApiError { status, code, message, extra }`; module-level hooks `onUnauthorized(fn)`, `onUpgradeRequired(fn)`; `authClient` (better-auth react) with `useSession`; `listSpaces(): Promise<Space[]>` where `Space = { id, name, kind, role }`; `registerDevice(input)`.

- [ ] **Step 1: Failing test**

`web/test/client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, onUpgradeRequired, onUnauthorized } from "../src/api/client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("apiFetch", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends X-Client and parses JSON", async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await apiFetch<{ ok: boolean }>("/api/v2/me");
    expect(out.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v2/me");
    expect(new Headers(init!.headers).get("x-client")).toBe("web/0.1.0-test");
    expect(init!.credentials).toBe("include");
  });
  it("throws ApiError with the server code and calls the 426 hook", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(426, { error: "upgrade_required", min: "1.0.0", platform: "web" })));
    const hook = vi.fn(); onUpgradeRequired(hook);
    await expect(apiFetch("/api/v2/me")).rejects.toMatchObject({ status: 426, code: "upgrade_required", extra: { min: "1.0.0" } });
    expect(hook).toHaveBeenCalledWith("1.0.0");
  });
  it("calls the 401 hook", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(401, { error: "unauthorized" })));
    const hook = vi.fn(); onUnauthorized(hook);
    await expect(apiFetch("/api/v2/me")).rejects.toBeInstanceOf(ApiError);
    expect(hook).toHaveBeenCalled();
  });
  it("wraps network failures as ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(apiFetch("/api/v2/me")).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
```

- [ ] **Step 2: Implement**

`web/src/api/errors.ts`:
```ts
export const ERROR_COPY: Record<string, string> = {
  unauthorized: "Please sign in again.",
  forbidden: "You don't have access to that space.",
  not_found: "That no longer exists.",
  rate_limited: "Too many requests. Try again in a minute.",
  upgrade_required: "This version of Wallet is too old. Reload to update.",
  batch_too_large: "Too many changes at once. Syncing in smaller batches.",
  network: "You're offline. Changes are saved and will sync later.",
  invalid: "That doesn't look right.",
  conflict: "That already exists.",
};
export const copyFor = (code: string, fallback = "Something went wrong.") => ERROR_COPY[code] ?? fallback;
```

`web/src/api/client.ts`:
```ts
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra: Record<string, unknown> = {}) {
    super(message ?? code);
  }
}

let unauthorizedHook: (() => void) | null = null;
let upgradeHook: ((min: string) => void) | null = null;
export const onUnauthorized = (fn: () => void) => { unauthorizedHook = fn; };
export const onUpgradeRequired = (fn: (min: string) => void) => { upgradeHook = fn; };

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("x-client", `web/${APP_VERSION}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const code = body?.error ?? `http_${res.status}`;
    const { error: _e, message, ...extra } = body ?? {};
    if (res.status === 401) unauthorizedHook?.();
    if (res.status === 426) upgradeHook?.(String(extra.min ?? ""));
    throw new ApiError(res.status, code, message, extra);
  }
  return body as T;
}
```

`web/src/api/auth.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: typeof window === "undefined" ? "http://localhost" : window.location.origin });
export const { useSession } = authClient;
```

`web/src/api/spaces.ts`:
```ts
import { apiFetch } from "./client";
export type Space = { id: string; name: string; kind: "personal" | "shared"; role: "owner" | "member" };
export const listSpaces = () => apiFetch<{ spaces: Space[] }>("/api/v2/spaces").then((r) => r.spaces);
```

`web/src/api/devices.ts`:
```ts
import { apiFetch } from "./client";
export type DeviceWire = { id: string; platform: "android" | "web"; name: string; app_version: string; last_seen_at: string; has_push_token: boolean };
export const registerDevice = (input: { id: string; platform: "web"; name: string; app_version: string }) =>
  apiFetch<{ device: DeviceWire }>("/api/v2/me/devices", { method: "POST", body: JSON.stringify(input) }).then((r) => r.device);
export const listDevices = () => apiFetch<{ devices: DeviceWire[] }>("/api/v2/me/devices").then((r) => r.devices);
```

`web/src/screens/SignIn.tsx`:
```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../api/auth";

export function SignIn() {
  const nav = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (error) { setError(error.message ?? "Sign in failed."); return; }
    nav("/", { replace: true });
  }
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Welcome back</div><div className="big">Wallet</div></div>
      <form onSubmit={submit} className="card">
        <div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>Sign in</button>
        <p style={{ textAlign: "center", fontSize: 13 }}>New here? <Link to="/sign-up">Create an account</Link></p>
      </form>
    </div>
  );
}
```

`web/src/screens/SignUp.tsx`:
```tsx
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "../api/auth";

export function SignUp() {
  const nav = useNavigate();
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) { setError("Use at least 10 characters."); return; }
    setBusy(true); setError(null);
    const { error } = await authClient.signUp.email({ name, email, password });
    setBusy(false);
    if (error) { setError(error.message ?? "Sign up failed."); return; }
    nav("/", { replace: true });
  }
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Let's get you set up</div><div className="big">Create account</div></div>
      <form onSubmit={submit} className="card">
        <div className="field"><label>Name</label><input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password (10+ characters)</label><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={busy}>Create account</button>
        <p style={{ textAlign: "center", fontSize: 13 }}>Already have one? <Link to="/sign-in">Sign in</Link></p>
      </form>
    </div>
  );
}
```

`web/src/screens/Upgrade.tsx`:
```tsx
export function Upgrade({ min }: { min: string }) {
  return (
    <div className="shell-main"><div className="hero"><div className="dim">Update needed</div><div className="big">Wallet</div></div>
      <div className="card"><p>This version is too old (needs {min || "a newer version"}). Reload to update; if you installed Wallet on your home screen, close it fully and open it again.</p>
        <button className="btn" onClick={() => location.reload()}>Reload</button></div></div>
  );
}
```

`web/src/app/RequireAuth.tsx`:
```tsx
import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "../api/auth";

export function RequireAuth() {
  const { data, isPending } = useSession();
  const loc = useLocation();
  if (isPending) return <div className="empty">Loading…</div>;
  if (!data) return <Navigate to="/sign-in" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
```

`web/src/app/routes.tsx` (screens not yet built render placeholders that later tasks replace):
```tsx
import { Route, Routes } from "react-router";
import { Shell } from "./Shell";
import { RequireAuth } from "./RequireAuth";
import { SignIn } from "../screens/SignIn";
import { SignUp } from "../screens/SignUp";

const Todo = ({ name }: { name: string }) => <div className="empty">{name}</div>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/sign-up" element={<SignUp />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route index element={<Todo name="Inbox" />} />
          <Route path="add" element={<Todo name="Add" />} />
          <Route path="stats" element={<Todo name="Stats" />} />
          <Route path="settings" element={<Todo name="Settings" />} />
        </Route>
      </Route>
    </Routes>
  );
}
```

`web/src/app/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router";
import { onUnauthorized, onUpgradeRequired } from "../api/client";
import { authClient } from "../api/auth";
import { MaskProvider } from "../hooks/useMask";
import { AppRoutes } from "./routes";
import { Upgrade } from "../screens/Upgrade";

export function App() {
  const [upgradeMin, setUpgradeMin] = useState<string | null>(null);
  useEffect(() => {
    onUpgradeRequired((min) => setUpgradeMin(min));
    onUnauthorized(() => { void authClient.signOut(); });
  }, []);
  if (upgradeMin !== null) return <Upgrade min={upgradeMin} />;
  return <BrowserRouter><MaskProvider><AppRoutes /></MaskProvider></BrowserRouter>;
}
```
Update `test/smoke.test.tsx` to look for "Sign in" or "Loading…" (the session query runs) — assert `screen.getByText(/Loading|Sign in/)`.

- [ ] **Step 3: Manual check against the real server**

Run the server locally (`cd server && npm run dev` with the test Postgres) and `cd web && npm run dev`; open http://localhost:5173/sign-up, create an account, land on the Inbox placeholder; reload keeps you signed in (cookie). Record in the report.

- [ ] **Step 4: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): api client with X-Client/401/426 handling, BetterAuth sign-in/up, route guards

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 4: Dexie schema, meta store, write helpers

**Files:**
- Create: `web/src/db/schema.ts`, `web/src/db/meta.ts`, `web/src/db/repo.ts`, `web/src/hooks/useSpace.ts`
- Test: `web/test/repo.test.ts`

**Interfaces:**
- Produces: `db` (Dexie) with tables `transactions`, `categories`, `budgets`, `rules`, `meta`; local row types `LocalTx`, `LocalCategory`, `LocalBudget`, `LocalRule` = wire shape + `space_id`, `sync_state`, `sync_error`; `meta` helpers `getCursor(spaceId)`, `setCursor(spaceId, seq)`, `getCurrentSpaceId()`, `setCurrentSpaceId(id)`, `getDeviceId()` (creates a UUID once); repo functions `createManualTransaction(spaceId, input)`, `tagTransaction(id, categoryId, reason)`, `softDeleteTransaction(id)`, `upsertCategory(spaceId, input)`, `archiveCategory(id, archived)`, `setBudget(spaceId, categoryId, limitCents)`, `deleteBudget(id)`, `upsertRule(spaceId, counterparty, categoryId)`, `deleteRule(id)` — every write sets `client_updated_at = nowIso()` and `sync_state = "dirty"`; `useSpaceId()` hook.

- [ ] **Step 1: Failing tests**

`web/test/repo.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, tagTransaction, softDeleteTransaction, setBudget, upsertCategory, upsertRule } from "../src/db/repo";
import { getCursor, setCursor, getDeviceId } from "../src/db/meta";

const S = "space-1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("repo writes", () => {
  it("creates a manual transaction as dirty with a UUIDv7 id and cents", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 25000, counterparty: "Cash", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: "lunch" });
    const row = (await db.transactions.get(id))!;
    expect(row).toMatchObject({ space_id: S, source: "manual", receipt_code: null, amount_cents: 25000, cost_cents: 0, balance_cents: null, sync_state: "dirty", deleted_at: null });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Date.parse(row.client_updated_at)).toBeGreaterThan(0);
  });
  it("tagging bumps client_updated_at and marks dirty even on a clean row", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    await db.transactions.update(id, { sync_state: "clean", client_updated_at: "2026-09-01T00:00:00.000Z" });
    await tagTransaction(id, "cat-1", "why");
    const row = (await db.transactions.get(id))!;
    expect(row.category_id).toBe("cat-1"); expect(row.reason).toBe("why"); expect(row.sync_state).toBe("dirty");
    expect(Date.parse(row.client_updated_at)).toBeGreaterThan(Date.parse("2026-09-01T00:00:00.000Z"));
  });
  it("soft delete sets deleted_at and dirty", async () => {
    const id = await createManualTransaction(S, { direction: "in", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    await softDeleteTransaction(id);
    expect((await db.transactions.get(id))!.deleted_at).not.toBeNull();
  });
  it("setBudget upserts by (space, category)", async () => {
    const a = await setBudget(S, "cat-1", 500000); const b = await setBudget(S, "cat-1", 600000);
    expect(a).toBe(b);
    expect((await db.budgets.where({ space_id: S }).toArray()).length).toBe(1);
    expect((await db.budgets.get(a))!.monthly_limit_cents).toBe(600000);
  });
  it("upsertCategory and upsertRule normalise", async () => {
    const c = await upsertCategory(S, { name: " Rent ", kind: "expense", emoji: "🏠", color: "#333333" });
    expect((await db.categories.get(c))!.name).toBe("Rent");
    const r = await upsertRule(S, "  Naivas   Supermarket ", c);
    expect((await db.rules.get(r))!.match_counterparty).toBe("naivas supermarket");
  });
});
describe("meta", () => {
  it("cursor defaults to 0 per space and device id is stable", async () => {
    expect(await getCursor(S)).toBe(0); await setCursor(S, 42); expect(await getCursor(S)).toBe(42); expect(await getCursor("other")).toBe(0);
    const d1 = await getDeviceId(); const d2 = await getDeviceId(); expect(d1).toBe(d2); expect(d1).toHaveLength(36);
  });
});
```

- [ ] **Step 2: Implement**

`web/src/db/schema.ts`:
```ts
import Dexie, { type EntityTable } from "dexie";

export type SyncState = "clean" | "dirty" | "error";
type LocalMeta = { space_id: string; sync_state: SyncState; sync_error: string | null };

export type Direction = "in" | "out" | "transfer";
export type TxWire = {
  id: string; captured_by: string | null; source: string; receipt_code: string | null; direction: Direction;
  amount_cents: number; cost_cents: number; balance_cents: number | null; counterparty: string; occurred_at: string;
  category_id: string | null; reason: string | null; linked_transaction_id: string | null; client_updated_at: string;
  seq: number; updated_at: string; deleted_at: string | null;
};
export type CategoryWire = { id: string; name: string; kind: "expense" | "income" | "transfer"; emoji: string; color: string; sort_order: number; archived: boolean; is_system: boolean; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };
export type BudgetWire = { id: string; category_id: string; monthly_limit_cents: number; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };
export type RuleWire = { id: string; match_counterparty: string; category_id: string; created_by: string | null; client_updated_at: string; seq: number; updated_at: string; deleted_at: string | null };

export type LocalTx = TxWire & LocalMeta;
export type LocalCategory = CategoryWire & LocalMeta;
export type LocalBudget = BudgetWire & LocalMeta;
export type LocalRule = RuleWire & LocalMeta;
export type MetaRow = { key: string; value: string };

export const db = new Dexie("wallet") as Dexie & {
  transactions: EntityTable<LocalTx, "id">;
  categories: EntityTable<LocalCategory, "id">;
  budgets: EntityTable<LocalBudget, "id">;
  rules: EntityTable<LocalRule, "id">;
  meta: EntityTable<MetaRow, "key">;
};

db.version(1).stores({
  transactions: "id, space_id, [space_id+occurred_at], [space_id+sync_state], [space_id+category_id], counterparty",
  categories: "id, space_id, [space_id+sync_state], [space_id+name]",
  budgets: "id, space_id, [space_id+sync_state], [space_id+category_id]",
  rules: "id, space_id, [space_id+sync_state], [space_id+match_counterparty]",
  meta: "key",
});

export const nowIso = () => new Date().toISOString();
```

`web/src/db/meta.ts`:
```ts
import { v7 as uuidv7 } from "uuid";
import { db } from "./schema";

const get = async (key: string) => (await db.meta.get(key))?.value ?? null;
const set = (key: string, value: string) => db.meta.put({ key, value });

export const getCursor = async (spaceId: string) => Number((await get(`cursor:${spaceId}`)) ?? 0);
export const setCursor = (spaceId: string, seq: number) => set(`cursor:${spaceId}`, String(seq));
export const getCurrentSpaceId = () => get("currentSpace");
export const setCurrentSpaceId = (id: string) => set("currentSpace", id);
export async function getDeviceId() {
  const existing = await get("deviceId");
  if (existing) return existing;
  const id = uuidv7(); await set("deviceId", id); return id;
}
export const getLastSyncAt = async (spaceId: string) => await get(`lastSync:${spaceId}`);
export const setLastSyncAt = (spaceId: string, iso: string) => set(`lastSync:${spaceId}`, iso);
export const clearAllLocal = () => Promise.all(db.tables.map((t) => t.clear()));
```

`web/src/db/repo.ts`:
```ts
import { v7 as uuidv7 } from "uuid";
import { db, nowIso, type Direction, type LocalBudget, type LocalCategory, type LocalRule, type LocalTx } from "./schema";

const dirty = { sync_state: "dirty" as const, sync_error: null };
export const normaliseCounterparty = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function createManualTransaction(spaceId: string, input: { direction: Direction; amount_cents: number; counterparty: string; occurred_at: string; category_id: string | null; reason: string | null }) {
  const id = uuidv7();
  const row: LocalTx = {
    id, space_id: spaceId, captured_by: null, source: "manual", receipt_code: null, direction: input.direction,
    amount_cents: input.amount_cents, cost_cents: 0, balance_cents: null, counterparty: input.counterparty.trim(),
    occurred_at: input.occurred_at, category_id: input.category_id, reason: input.reason?.trim() || null,
    linked_transaction_id: null, client_updated_at: nowIso(), seq: 0, updated_at: nowIso(), deleted_at: null, ...dirty,
  };
  await db.transactions.add(row);
  return id;
}
export const tagTransaction = (id: string, categoryId: string | null, reason: string | null) =>
  db.transactions.update(id, { category_id: categoryId, reason: reason?.trim() || null, client_updated_at: nowIso(), ...dirty });
export const editManualTransaction = (id: string, patch: { amount_cents: number; counterparty: string; occurred_at: string; direction: Direction }) =>
  db.transactions.update(id, { ...patch, counterparty: patch.counterparty.trim(), client_updated_at: nowIso(), ...dirty });
export const softDeleteTransaction = (id: string) => db.transactions.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });

export async function upsertCategory(spaceId: string, input: { id?: string; name: string; kind: "expense" | "income" | "transfer"; emoji: string; color: string; sort_order?: number }) {
  const id = input.id ?? uuidv7();
  const existing = input.id ? await db.categories.get(input.id) : undefined;
  const row: LocalCategory = {
    id, space_id: spaceId, name: input.name.trim(), kind: input.kind, emoji: input.emoji, color: input.color,
    sort_order: input.sort_order ?? existing?.sort_order ?? 99, archived: existing?.archived ?? false, is_system: existing?.is_system ?? false,
    client_updated_at: nowIso(), seq: existing?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty,
  };
  await db.categories.put(row);
  return id;
}
export const archiveCategory = (id: string, archived: boolean) => db.categories.update(id, { archived, client_updated_at: nowIso(), ...dirty });
export const reorderCategories = (ids: string[]) => db.transaction("rw", db.categories, async () => {
  for (const [i, id] of ids.entries()) await db.categories.update(id, { sort_order: i, client_updated_at: nowIso(), ...dirty });
});

export async function setBudget(spaceId: string, categoryId: string, limitCents: number) {
  const live = (await db.budgets.where({ space_id: spaceId, category_id: categoryId }).toArray()).find((b) => !b.deleted_at);
  const id = live?.id ?? uuidv7();
  const row: LocalBudget = { id, space_id: spaceId, category_id: categoryId, monthly_limit_cents: limitCents, client_updated_at: nowIso(), seq: live?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty };
  await db.budgets.put(row);
  return id;
}
export const deleteBudget = (id: string) => db.budgets.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });

export async function upsertRule(spaceId: string, counterparty: string, categoryId: string) {
  const match = normaliseCounterparty(counterparty);
  const live = (await db.rules.where({ space_id: spaceId, match_counterparty: match }).toArray()).find((r) => !r.deleted_at);
  const id = live?.id ?? uuidv7();
  const row: LocalRule = { id, space_id: spaceId, match_counterparty: match, category_id: categoryId, created_by: live?.created_by ?? null, client_updated_at: nowIso(), seq: live?.seq ?? 0, updated_at: nowIso(), deleted_at: null, ...dirty };
  await db.rules.put(row);
  return id;
}
export const deleteRule = (id: string) => db.rules.update(id, { deleted_at: nowIso(), client_updated_at: nowIso(), ...dirty });
```

`web/src/hooks/useSpace.ts`:
```ts
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
export function useSpaceId(): string | null {
  const row = useLiveQuery(() => db.meta.get("currentSpace"), []);
  return row?.value ?? null;
}
```

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): Dexie local store, meta cursors, dirty-marking write helpers

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 5: Sync engine (push chunks → adopt ids → pull loop) and triggers

**Files:**
- Create: `web/src/api/sync.ts`, `web/src/sync/engine.ts`, `web/src/sync/useSync.ts`
- Test: `web/test/engine.test.ts`

**Interfaces:**
- Produces: `pullPage(spaceId, since, limit?)`, `pushBatch(spaceId, body)` in `api/sync.ts`; `runSync(spaceId, deps?): Promise<SyncSummary>` where `SyncSummary = { pushed: number; rejected: number; pulled: number; cursor: number }`; `useSync(spaceId): { syncing: boolean; lastError: string | null; syncNow(): Promise<void> }`; a module-level `requestSync()` that screens call after a write (debounced 1.5 s).
- Semantics (spec §7.5): (1) collect dirty rows per table for the space; (2) push in chunks whose total rows ≤ 1000, categories first; (3) for each result: `applied`/`unchanged` → if `row.id !== result.id` delete the local row with the client id and upsert the server row (`clean`); else mark clean and, when a `row` is present, copy server fields (`seq`, `updated_at`, `captured_by`, `linked_transaction_id`); `rejected` → mark `error` with `error` code as `sync_error` (for `immutable`/`bad_category`/`duplicate_*` with a `row`, also upsert the server row and, if `row.id !== result.id`, delete the local duplicate); (4) after EACH chunk, pull from the stored cursor until `more` is false, applying rows (tombstones delete local rows), storing the pull cursor; never store the push cursor; (5) local rows that are dirty are NOT overwritten by a pulled row with an older `client_updated_at` (the push will resolve them), but ARE replaced when the pulled row's `client_updated_at` is newer or equal.

- [ ] **Step 1: Failing tests**

`web/test/engine.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, setBudget } from "../src/db/repo";
import { getCursor, setCursor } from "../src/db/meta";
import { runSync } from "../src/sync/engine";

const S = "space-1";
const srvTx = (over: Partial<any> = {}) => ({
  id: "srv-1", captured_by: "u1", source: "mpesa", receipt_code: "TID1", direction: "out", amount_cents: 500, cost_cents: 0, balance_cents: null,
  counterparty: "Shop", occurred_at: "2026-09-10T10:00:00.000Z", category_id: null, reason: null, linked_transaction_id: null,
  client_updated_at: "2026-09-10T10:00:00.000Z", seq: 10, updated_at: "2026-09-10T10:00:00.000Z", deleted_at: null, ...over,
});
function fakeApi() {
  const pushes: any[] = [];
  const pulls: number[] = [];
  const api = {
    pushBatch: vi.fn(async (_s: string, body: any) => { pushes.push(body); return { results: body.transactions?.map((t: any) => ({ table: "transactions", id: t.id, status: "applied", row: { ...t, seq: 100, updated_at: "x", captured_by: "me", linked_transaction_id: null } })) ?? [], cursor: 100 }; }),
    pullPage: vi.fn(async (_s: string, since: number) => { pulls.push(since); return { cursor: since, more: false, transactions: [], categories: [], budgets: [], rules: [] }; }),
  };
  return { api, pushes, pulls };
}
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("runSync", () => {
  it("pushes dirty rows, marks them clean with server fields, then pulls from the STORED cursor (not the push cursor)", async () => {
    await setCursor(S, 7);
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api, pushes, pulls } = fakeApi();
    const out = await runSync(S, api);
    expect(pushes).toHaveLength(1); expect(pushes[0].transactions[0].id).toBe(id);
    expect(pushes[0].transactions[0]).not.toHaveProperty("space_id"); expect(pushes[0].transactions[0]).not.toHaveProperty("sync_state");
    expect(pulls[0]).toBe(7);
    const row = (await db.transactions.get(id))!;
    expect(row.sync_state).toBe("clean"); expect(row.seq).toBe(100); expect(row.captured_by).toBe("me");
    expect(out.pushed).toBe(1); expect(await getCursor(S)).toBe(7);
  });
  it("adopts the server id on dedupe-as-edit and deletes the local duplicate", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({ results: [{ table: "transactions", id: body.transactions[0].id, status: "applied", row: srvTx({ id: "srv-1" }) }], cursor: 50 }));
    await runSync(S, api);
    expect(await db.transactions.get(id)).toBeUndefined();
    expect((await db.transactions.get("srv-1"))!.sync_state).toBe("clean");
  });
  it("marks rejected rows as error with the code and keeps them", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: "nope", reason: null });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async (_s: string, body: any) => ({ results: [{ table: "transactions", id: body.transactions[0].id, status: "rejected", error: "bad_category" }], cursor: 50 }));
    const out = await runSync(S, api);
    expect((await db.transactions.get(id))!).toMatchObject({ sync_state: "error", sync_error: "bad_category" });
    expect(out.rejected).toBe(1);
  });
  it("pulls pages until more=false, applies tombstones, stores the pull cursor", async () => {
    await db.transactions.add({ ...srvTx({ id: "old" }), space_id: S, sync_state: "clean", sync_error: null } as any);
    const { api } = fakeApi();
    api.pullPage.mockImplementationOnce(async () => ({ cursor: 20, more: true, transactions: [srvTx({ id: "srv-2", seq: 20 })], categories: [], budgets: [], rules: [] }))
      .mockImplementationOnce(async () => ({ cursor: 30, more: false, transactions: [srvTx({ id: "old", seq: 30, deleted_at: "2026-09-12T00:00:00.000Z" })], categories: [], budgets: [], rules: [] }));
    const out = await runSync(S, api);
    expect(await db.transactions.get("old")).toBeUndefined();
    expect(await db.transactions.get("srv-2")).toBeDefined();
    expect(await getCursor(S)).toBe(30); expect(out.pulled).toBe(2);
  });
  it("does not overwrite a dirty local row with an older pulled version", async () => {
    const id = await createManualTransaction(S, { direction: "out", amount_cents: 100, counterparty: "x", occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: "mine" });
    const { api } = fakeApi();
    api.pushBatch.mockImplementationOnce(async () => { throw Object.assign(new Error("offline"), { status: 0, code: "network" }); });
    api.pullPage.mockImplementationOnce(async () => ({ cursor: 5, more: false, transactions: [srvTx({ id, reason: "theirs", client_updated_at: "2020-01-01T00:00:00.000Z" })], categories: [], budgets: [], rules: [] }));
    await expect(runSync(S, api)).rejects.toMatchObject({ code: "network" });
    expect((await db.transactions.get(id))!.reason).toBe("mine");
  });
  it("chunks pushes at 1000 rows, categories before transactions", async () => {
    await setBudget(S, "c1", 100);
    for (let i = 0; i < 1005; i++) await createManualTransaction(S, { direction: "out", amount_cents: 1, counterparty: `x${i}`, occurred_at: "2026-09-12T10:00:00.000Z", category_id: null, reason: null });
    const { api, pushes } = fakeApi();
    await runSync(S, api);
    expect(pushes.length).toBe(2);
    const total = (b: any) => (b.transactions?.length ?? 0) + (b.categories?.length ?? 0) + (b.budgets?.length ?? 0) + (b.rules?.length ?? 0);
    expect(total(pushes[0])).toBe(1000); expect(total(pushes[1])).toBe(6);
    expect(pushes[0].budgets.length).toBe(1);
  });
});
```

- [ ] **Step 2: Implement**

`web/src/api/sync.ts`:
```ts
import { apiFetch } from "./client";
import type { BudgetWire, CategoryWire, RuleWire, TxWire } from "../db/schema";

export type PullPage = { cursor: number; more: boolean; transactions: TxWire[]; categories: CategoryWire[]; budgets: BudgetWire[]; rules: RuleWire[] };
export type PushResult = { table: "transactions" | "categories" | "budgets" | "rules"; id: string; status: "applied" | "unchanged" | "rejected"; error?: string; message?: string; row?: any };
export type PushResponse = { results: PushResult[]; cursor: number };
export type PushBody = { transactions?: unknown[]; categories?: unknown[]; budgets?: unknown[]; rules?: unknown[] };

export const pullPage = (spaceId: string, since: number, limit = 500) =>
  apiFetch<PullPage>(`/api/v2/spaces/${spaceId}/sync?since=${since}&limit=${limit}`);
export const pushBatch = (spaceId: string, body: PushBody) =>
  apiFetch<PushResponse>(`/api/v2/spaces/${spaceId}/sync`, { method: "POST", body: JSON.stringify(body) });
export type SyncApi = { pullPage: typeof pullPage; pushBatch: typeof pushBatch };
```

`web/src/sync/engine.ts`:
```ts
import { db, type LocalBudget, type LocalCategory, type LocalRule, type LocalTx } from "../db/schema";
import { getCursor, setCursor, setLastSyncAt } from "../db/meta";
import { pullPage, pushBatch, type PushResult, type SyncApi } from "../api/sync";

export const MAX_PUSH_ROWS = 1000;
export type SyncSummary = { pushed: number; rejected: number; pulled: number; cursor: number };
type Table = "transactions" | "categories" | "budgets" | "rules";
const TABLES: Table[] = ["categories", "budgets", "rules", "transactions"];
const SERVER_ONLY = new Set(["space_id", "sync_state", "sync_error", "seq", "updated_at", "captured_by", "linked_transaction_id", "created_by"]);

function toWireIn(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!SERVER_ONLY.has(k)) out[k] = v;
  return out;
}
const localTable = (t: Table) => db[t] as unknown as typeof db.transactions;

async function applyResult(t: Table, r: PushResult) {
  const table = localTable(t);
  const local = await table.get(r.id);
  if (r.status === "rejected") {
    if (local) await table.update(r.id, { sync_state: "error", sync_error: r.error ?? "rejected" } as any);
    if (r.row && r.row.id !== r.id) { if (local) await table.delete(r.id); await table.put({ ...r.row, space_id: local?.space_id, sync_state: "clean", sync_error: null } as any); }
    return;
  }
  if (r.row && r.row.id !== r.id) {
    if (local) await table.delete(r.id);
    await table.put({ ...r.row, space_id: local?.space_id, sync_state: "clean", sync_error: null } as any);
    return;
  }
  if (!local) return;
  const serverFields = r.row ? { seq: r.row.seq, updated_at: r.row.updated_at, captured_by: r.row.captured_by ?? local.captured_by, linked_transaction_id: r.row.linked_transaction_id ?? null } : {};
  await table.update(r.id, { ...serverFields, sync_state: "clean", sync_error: null } as any);
}

async function collectDirty(spaceId: string) {
  const out: Record<Table, any[]> = { categories: [], budgets: [], rules: [], transactions: [] };
  for (const t of TABLES) out[t] = await localTable(t).where({ space_id: spaceId, sync_state: "dirty" }).toArray();
  return out;
}

/** Splits dirty rows into batches of ≤ MAX_PUSH_ROWS, preserving table order so categories land first. */
function chunk(dirty: Record<Table, any[]>): Record<Table, any[]>[] {
  const batches: Record<Table, any[]>[] = [];
  let cur: Record<Table, any[]> = { categories: [], budgets: [], rules: [], transactions: [] }; let n = 0;
  for (const t of TABLES) for (const row of dirty[t]) {
    if (n === MAX_PUSH_ROWS) { batches.push(cur); cur = { categories: [], budgets: [], rules: [], transactions: [] }; n = 0; }
    cur[t].push(row); n++;
  }
  if (n > 0) batches.push(cur);
  return batches;
}

async function applyPulled(spaceId: string, t: Table, rows: any[]) {
  const table = localTable(t);
  await db.transaction("rw", table, async () => {
    for (const row of rows) {
      if (row.deleted_at) { await table.delete(row.id); continue; }
      const local = await table.get(row.id);
      if (local && local.sync_state === "dirty" && Date.parse(local.client_updated_at) > Date.parse(row.client_updated_at)) continue;
      await table.put({ ...row, space_id: spaceId, sync_state: "clean", sync_error: null } as any);
    }
  });
}

async function pullAll(spaceId: string, api: SyncApi): Promise<number> {
  let pulled = 0;
  for (;;) {
    const since = await getCursor(spaceId);
    const page = await api.pullPage(spaceId, since);
    for (const t of TABLES) { await applyPulled(spaceId, t, page[t]); pulled += page[t].length; }
    if (page.cursor > since) await setCursor(spaceId, page.cursor);
    if (!page.more) break;
  }
  return pulled;
}

export async function runSync(spaceId: string, api: SyncApi = { pullPage, pushBatch }): Promise<SyncSummary> {
  let pushed = 0, rejected = 0, pulled = 0;
  const batches = chunk(await collectDirty(spaceId));
  for (const b of batches) {
    const body: Record<string, unknown[]> = {};
    for (const t of TABLES) if (b[t].length) body[t] = b[t].map(toWireIn);
    const res = await api.pushBatch(spaceId, body);
    for (const r of res.results) { await applyResult(r.table, r); if (r.status === "rejected") rejected++; else pushed++; }
    pulled += await pullAll(spaceId, api);
  }
  if (batches.length === 0) pulled += await pullAll(spaceId, api);
  await setLastSyncAt(spaceId, new Date().toISOString());
  return { pushed, rejected, pulled, cursor: await getCursor(spaceId) };
}
```
Note on the "dirty row vs older pulled row" test: the push throws before any pull, so `runSync` rejects and the local row is untouched. The `applyPulled` guard covers the case where a pull runs while the row is still dirty (e.g. a prior push rejected it). Both behaviours are required.

`web/src/sync/useSync.ts`:
```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { runSync } from "./engine";
import { ApiError } from "../api/client";
import { copyFor } from "../api/errors";

let pending: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
/** Screens call this after a local write; the engine runs 1.5 s later, coalescing bursts. */
export function requestSync() {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => { pending = null; listeners.forEach((l) => l()); }, 1500);
}

export function useSync(spaceId: string | null) {
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const running = useRef(false);
  const syncNow = useCallback(async () => {
    if (!spaceId || running.current || !navigator.onLine) return;
    running.current = true; setSyncing(true);
    try { await runSync(spaceId); setLastError(null); }
    catch (e) { setLastError(e instanceof ApiError ? copyFor(e.code) : "Sync failed."); }
    finally { running.current = false; setSyncing(false); }
  }, [spaceId]);
  useEffect(() => {
    void syncNow();
    const onOnline = () => void syncNow();
    const onVisible = () => { if (document.visibilityState === "visible") void syncNow(); };
    const timer = setInterval(() => void syncNow(), 5 * 60_000);
    window.addEventListener("online", onOnline); document.addEventListener("visibilitychange", onVisible); listeners.add(syncNow);
    return () => { window.removeEventListener("online", onOnline); document.removeEventListener("visibilitychange", onVisible); listeners.delete(syncNow); clearInterval(timer); };
  }, [syncNow]);
  return { syncing, lastError, syncNow };
}
```

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): sync engine — chunked push, server-id adoption, cursor pull loop, triggers

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 6: Period, stats, review, and budget logic (ports of the Android Kotlin)

**Files:**
- Create: `web/src/logic/period.ts`, `web/src/logic/stats.ts`, `web/src/logic/review.ts`, `web/src/logic/budget.ts`, `web/src/logic/dates.ts`
- Test: `web/test/period.test.ts`, `web/test/stats.test.ts`, `web/test/review.test.ts`, `web/test/budget.test.ts`

**Interfaces:**
- `period.ts`: `type Period = "week" | "month" | "year"`; `range(period, ref: Date): { from: number; to: number }` (epoch ms, `to` exclusive, local zone, Monday-start weeks); `step(period, ref, dir: -1 | 1): Date`; `label(period, ref, today?)` ("Week 37 · Sep 7–13 (so far)", "September 2026", "2026"); `periodsInRange(period, earliest, today?)`: newest-first refs; `isoWeek(d): { week: number; year: number }`.
- `stats.ts` over `LocalTx[]` (already filtered to the space, `deleted_at === null`) plus a `Map<string, LocalCategory>`: `totals(rows, from, to)` → `{ moneyIn, moneyOut }` cents; `categoryTotals(rows, cats, from, to)` → `[{ categoryId, name, total }]` desc; `topDays(rows, from, to, n=3)` → `[{ day: "YYYY-MM-DD", total }]`; `dailyTotals(rows, from, to)` → every day in range; `biggestExpenses(rows, from, to, n=5)`; `topCounterparties(rows, from, to, n=5)`; `categorySpend(rows, categoryId, from, to)`. Rules: exclude `direction === "transfer"` and rows whose category `kind === "transfer"`; moneyOut = `amount_cents + cost_cents` for `out`; moneyIn = `amount_cents` for `in`; untagged `out` rows count in totals but not in categoryTotals.
- `review.ts`: `savingsRate(moneyIn, moneyOut): number | null`; `trendSeries(rows, period, ref, count)` → oldest-first `[{ label, ref, moneyOut, savingsRate }]`; `categoryMovers(rows, cats, period, ref, limit=3)` → `[{ categoryId, name, current, previous, percentChange: number | null, isNew }]` sorted by |percentChange| desc with `null` first; `heatmapBuckets(daily)` → `Record<day, 0..4>` (quartiles of non-zero days); `paceProjection(spentSoFar, from, to, now): number | null`.
- `budget.ts`: `budgetLevel(spendCents, limitCents): 0 | 1 | 2` (≥100% → 2, ≥80% → 1); `budgetProgress(spend, limit)` → `{ fraction: number; level }`.
- `dates.ts`: `toDayKey(iso: string): "YYYY-MM-DD"` in local zone; `dayLabel("2026-09-01")` → "Tue 1 Sep"; `timeAgo(iso, now?)`.

- [ ] **Step 1: Failing tests** (fixed reference dates; `vi.setSystemTime` where `today` matters)

`web/test/period.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { range, step, label, periodsInRange, isoWeek } from "../src/logic/period";

const d = (s: string) => new Date(s + "T12:00:00");
describe("period", () => {
  it("week range is Monday..next Monday exclusive", () => {
    const { from, to } = range("week", d("2026-09-10")); // Thursday
    expect(new Date(from).getDay()).toBe(1); expect(new Date(from).getDate()).toBe(7);
    expect(new Date(to).getDate()).toBe(14); expect(new Date(to).getHours()).toBe(0);
  });
  it("month and year ranges", () => {
    const m = range("month", d("2026-02-10")); expect(new Date(m.from).getDate()).toBe(1); expect(new Date(m.to).getMonth()).toBe(2);
    const y = range("year", d("2026-06-01")); expect(new Date(y.from).getFullYear()).toBe(2026); expect(new Date(y.to).getFullYear()).toBe(2027);
  });
  it("steps and labels like Android", () => {
    expect(step("month", d("2026-01-31"), 1).getMonth()).toBe(1);
    expect(label("month", d("2026-09-10"))).toBe("September 2026");
    expect(label("year", d("2026-09-10"))).toBe("2026");
    expect(label("week", d("2026-09-10"), d("2026-09-10"))).toBe("Week 37 · Sep 7–13 (so far)");
    expect(label("week", d("2026-09-02"), d("2026-09-10"))).toBe("Week 36 · Aug 31–Sep 6");
    expect(isoWeek(d("2026-01-01"))).toEqual({ week: 1, year: 2026 });
  });
  it("periodsInRange walks back to the period containing the earliest date", () => {
    const refs = periodsInRange("month", d("2026-06-15"), d("2026-09-10"));
    expect(refs.map((r) => r.getMonth())).toEqual([8, 7, 6, 5]);
    expect(periodsInRange("week", d("2027-01-01"), d("2026-09-10"))).toHaveLength(1);
  });
});
```

`web/test/stats.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { totals, categoryTotals, topDays, biggestExpenses, topCounterparties, categorySpend, dailyTotals } from "../src/logic/stats";
import type { LocalCategory, LocalTx } from "../src/db/schema";

const cat = (id: string, name: string, kind: LocalCategory["kind"] = "expense"): LocalCategory => ({ id, name, kind, emoji: "x", color: "#000000", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
const cats = new Map([["food", cat("food", "food")], ["tr", cat("tr", "transfer", "transfer")], ["inc", cat("inc", "income", "income")]]);
const tx = (o: Partial<LocalTx>): LocalTx => ({ id: Math.random().toString(), space_id: "s", captured_by: null, source: "mpesa", receipt_code: null, direction: "out", amount_cents: 1000, cost_cents: 0, balance_cents: null, counterparty: "A", occurred_at: "2026-09-10T10:00:00.000Z", category_id: "food", reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null, ...o });
const from = Date.parse("2026-09-01T00:00:00.000Z"), to = Date.parse("2026-10-01T00:00:00.000Z");

describe("stats", () => {
  const rows = [
    tx({ amount_cents: 1000, cost_cents: 50 }), tx({ amount_cents: 2000, category_id: null }),
    tx({ direction: "in", amount_cents: 5000, category_id: "inc" }), tx({ direction: "transfer", amount_cents: 9999, category_id: "tr" }),
    tx({ amount_cents: 700, category_id: "tr" }), tx({ amount_cents: 300, occurred_at: "2026-08-31T23:59:59.000Z" }),
  ];
  it("totals: out includes cost and untagged, excludes transfers; in excludes transfers", () => {
    expect(totals(rows, cats, from, to)).toEqual({ moneyIn: 5000, moneyOut: 3050 });
  });
  it("categoryTotals excludes untagged and transfer-kind, sorted desc", () => {
    expect(categoryTotals(rows, cats, from, to)).toEqual([{ categoryId: "food", name: "food", total: 1050 }]);
  });
  it("topDays, biggest, counterparties, categorySpend, dailyTotals", () => {
    expect(topDays(rows, cats, from, to)[0]).toMatchObject({ day: "2026-09-10", total: 3050 });
    expect(biggestExpenses(rows, cats, from, to)[0]!.amount_cents).toBe(2000);
    expect(topCounterparties(rows, cats, from, to)).toEqual([{ name: "A", total: 3050 }]);
    expect(categorySpend(rows, cats, "food", from, to)).toBe(1050);
    expect(dailyTotals(rows, cats, from, to)).toHaveLength(30);
  });
});
```

`web/test/review.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { savingsRate, heatmapBuckets, paceProjection, categoryMovers, trendSeries } from "../src/logic/review";
import type { LocalCategory, LocalTx } from "../src/db/schema";

describe("review", () => {
  it("savingsRate", () => { expect(savingsRate(0, 10)).toBeNull(); expect(savingsRate(1000, 250)).toBeCloseTo(0.75); });
  it("heatmapBuckets quartiles non-zero days", () => {
    const b = heatmapBuckets([{ day: "d1", total: 0 }, { day: "d2", total: 10 }, { day: "d3", total: 20 }, { day: "d4", total: 30 }, { day: "d5", total: 40 }]);
    expect(b.d1).toBe(0); expect(b.d2).toBe(1); expect(b.d5).toBe(4);
  });
  it("paceProjection extrapolates inside the period only", () => {
    expect(paceProjection(500, 0, 1000, 500)).toBe(1000); expect(paceProjection(500, 0, 1000, 1000)).toBeNull(); expect(paceProjection(500, 0, 1000, -1)).toBeNull();
  });
  const cat = (id: string): LocalCategory => ({ id, name: id, kind: "expense", emoji: "", color: "#000", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
  const cats = new Map([["a", cat("a")], ["b", cat("b")]]);
  const tx = (cents: number, catId: string, iso: string): LocalTx => ({ id: iso + catId + cents, space_id: "s", captured_by: null, source: "manual", receipt_code: null, direction: "out", amount_cents: cents, cost_cents: 0, balance_cents: null, counterparty: "x", occurred_at: iso, category_id: catId, reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null });
  const rows = [tx(1000, "a", "2026-08-10T10:00:00"), tx(2000, "a", "2026-09-10T10:00:00"), tx(500, "b", "2026-09-11T10:00:00")];
  it("categoryMovers: new categories first, then by |percent|", () => {
    const m = categoryMovers(rows, cats, "month", new Date("2026-09-15T12:00:00"));
    expect(m[0]).toMatchObject({ categoryId: "b", isNew: true, percentChange: null });
    expect(m[1]).toMatchObject({ categoryId: "a", current: 2000, previous: 1000, percentChange: 100 });
  });
  it("trendSeries oldest-first with labels", () => {
    const s = trendSeries(rows, cats, "month", new Date("2026-09-15T12:00:00"), 3);
    expect(s.map((p) => p.moneyOut)).toEqual([0, 1000, 2500]); expect(s[2]!.label).toBe("September 2026");
  });
});
```

`web/test/budget.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { budgetLevel, budgetProgress } from "../src/logic/budget";
describe("budget", () => {
  it("levels at 80% and 100%", () => { expect(budgetLevel(79, 100)).toBe(0); expect(budgetLevel(80, 100)).toBe(1); expect(budgetLevel(100, 100)).toBe(2); expect(budgetLevel(5, 0)).toBe(0); });
  it("progress fraction clamps at 1", () => { expect(budgetProgress(150, 100)).toEqual({ fraction: 1, level: 2 }); expect(budgetProgress(25, 100).fraction).toBe(0.25); });
});
```

- [ ] **Step 2: Implement**

`web/src/logic/dates.ts`:
```ts
const pad = (n: number) => String(n).padStart(2, "0");
export const toDayKey = (iso: string | Date) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const dayKeyToDate = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y!, m! - 1, d!); };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-01" → "Tue 1 Sep" */
export const dayLabel = (key: string) => { const d = dayKeyToDate(key); return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
export const monthDay = (d: Date) => `${MON[d.getMonth()]} ${d.getDate()}`;
export function timeAgo(iso: string, now = Date.now()) {
  const then = Date.parse(iso), diff = now - then, d = new Date(then);
  if (diff < 60_000) return "Just now"; if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`; if (diff < 7 * 86_400_000) return WD[d.getDay()]!;
  return `${d.getDate()} ${MON[d.getMonth()]}`;
}
```

`web/src/logic/period.ts`:
```ts
import { monthDay } from "./dates";
export type Period = "week" | "month" | "year";
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monday = (d: Date) => { const s = startOfDay(d); const off = (s.getDay() + 6) % 7; s.setDate(s.getDate() - off); return s; };

export function range(period: Period, ref: Date): { from: number; to: number } {
  let start: Date, end: Date;
  if (period === "week") { start = monday(ref); end = new Date(start); end.setDate(end.getDate() + 7); }
  else if (period === "month") { start = new Date(ref.getFullYear(), ref.getMonth(), 1); end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1); }
  else { start = new Date(ref.getFullYear(), 0, 1); end = new Date(ref.getFullYear() + 1, 0, 1); }
  return { from: start.getTime(), to: end.getTime() };
}
export function step(period: Period, ref: Date, dir: -1 | 1): Date {
  const d = new Date(ref);
  if (period === "week") d.setDate(d.getDate() + 7 * dir);
  else if (period === "month") { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + dir); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}
export function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7), year: t.getUTCFullYear() };
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function label(period: Period, ref: Date, today = new Date()): string {
  if (period === "month") return `${MONTHS[ref.getMonth()]} ${ref.getFullYear()}`;
  if (period === "year") return String(ref.getFullYear());
  const mon = monday(ref); const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  const w = isoWeek(ref), tw = isoWeek(today);
  const dates = mon.getMonth() === sun.getMonth() ? `${monthDay(mon)}–${sun.getDate()}` : `${monthDay(mon)}–${monthDay(sun)}`;
  const sofar = w.week === tw.week && w.year === tw.year ? " (so far)" : "";
  return `Week ${w.week} · ${dates}${sofar}`;
}
export function periodsInRange(period: Period, earliest: Date, today = new Date()): Date[] {
  if (earliest > today) return [today];
  const out: Date[] = []; let cursor = today;
  for (;;) {
    out.push(cursor);
    const boundary = new Date(range(period, cursor).from);
    if (boundary <= startOfDay(earliest)) break;
    cursor = step(period, cursor, -1);
  }
  return out;
}
```

`web/src/logic/stats.ts`:
```ts
import type { LocalCategory, LocalTx } from "../db/schema";
import { toDayKey } from "./dates";

type Cats = Map<string, LocalCategory>;
const inRange = (t: LocalTx, from: number, to: number) => { const ms = Date.parse(t.occurred_at); return ms >= from && ms < to; };
const isTransfer = (t: LocalTx, cats: Cats) => t.direction === "transfer" || (t.category_id != null && cats.get(t.category_id)?.kind === "transfer");
const outCents = (t: LocalTx) => t.amount_cents + t.cost_cents;
/** Spend rows: out, not transfer, in range, not deleted. */
export const spendRows = (rows: LocalTx[], cats: Cats, from: number, to: number) => rows.filter((t) => !t.deleted_at && t.direction === "out" && !isTransfer(t, cats) && inRange(t, from, to));

export function totals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  let moneyIn = 0, moneyOut = 0;
  for (const t of rows) {
    if (t.deleted_at || !inRange(t, from, to) || isTransfer(t, cats)) continue;
    if (t.direction === "in") moneyIn += t.amount_cents; else if (t.direction === "out") moneyOut += outCents(t);
  }
  return { moneyIn, moneyOut };
}
export function categoryTotals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  const acc = new Map<string, number>();
  for (const t of spendRows(rows, cats, from, to)) if (t.category_id) acc.set(t.category_id, (acc.get(t.category_id) ?? 0) + outCents(t));
  return [...acc].map(([categoryId, total]) => ({ categoryId, name: cats.get(categoryId)?.name ?? "?", total })).sort((a, b) => b.total - a.total);
}
export function dailyTotals(rows: LocalTx[], cats: Cats, from: number, to: number) {
  const acc = new Map<string, number>();
  for (let d = new Date(from); d.getTime() < to; d.setDate(d.getDate() + 1)) acc.set(toDayKey(d), 0);
  for (const t of spendRows(rows, cats, from, to)) { const k = toDayKey(t.occurred_at); acc.set(k, (acc.get(k) ?? 0) + outCents(t)); }
  return [...acc].map(([day, total]) => ({ day, total }));
}
export const topDays = (rows: LocalTx[], cats: Cats, from: number, to: number, n = 3) => dailyTotals(rows, cats, from, to).filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, n);
export const biggestExpenses = (rows: LocalTx[], cats: Cats, from: number, to: number, n = 5) => spendRows(rows, cats, from, to).sort((a, b) => outCents(b) - outCents(a)).slice(0, n);
export function topCounterparties(rows: LocalTx[], cats: Cats, from: number, to: number, n = 5) {
  const acc = new Map<string, number>();
  for (const t of spendRows(rows, cats, from, to)) acc.set(t.counterparty, (acc.get(t.counterparty) ?? 0) + outCents(t));
  return [...acc].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, n);
}
export const categorySpend = (rows: LocalTx[], cats: Cats, categoryId: string, from: number, to: number) => spendRows(rows, cats, from, to).filter((t) => t.category_id === categoryId).reduce((s, t) => s + outCents(t), 0);
```

`web/src/logic/review.ts`:
```ts
import type { LocalCategory, LocalTx } from "../db/schema";
import { categoryTotals, totals } from "./stats";
import { label, range, step, type Period } from "./period";

export const savingsRate = (moneyIn: number, moneyOut: number) => (moneyIn <= 0 ? null : (moneyIn - moneyOut) / moneyIn);
export function trendSeries(rows: LocalTx[], cats: Map<string, LocalCategory>, period: Period, ref: Date, count: number) {
  const points = []; let cursor = ref;
  for (let i = 0; i < count; i++) {
    const { from, to } = range(period, cursor); const t = totals(rows, cats, from, to);
    points.push({ label: label(period, cursor), ref: cursor, moneyOut: t.moneyOut, savingsRate: savingsRate(t.moneyIn, t.moneyOut) });
    cursor = step(period, cursor, -1);
  }
  return points.reverse();
}
export function categoryMovers(rows: LocalTx[], cats: Map<string, LocalCategory>, period: Period, ref: Date, limit = 3) {
  const cur = range(period, ref), prev = range(period, step(period, ref, -1));
  const current = new Map(categoryTotals(rows, cats, cur.from, cur.to).map((c) => [c.categoryId, c.total]));
  const previous = new Map(categoryTotals(rows, cats, prev.from, prev.to).map((c) => [c.categoryId, c.total]));
  return [...new Set([...current.keys(), ...previous.keys()])].map((id) => {
    const c = current.get(id) ?? 0, p = previous.get(id) ?? 0;
    return { categoryId: id, name: cats.get(id)?.name ?? "?", current: c, previous: p, percentChange: p > 0 ? Math.round(((c - p) / p) * 100) : null, isNew: p === 0 && c > 0 };
  }).sort((a, b) => (b.percentChange === null ? Infinity : Math.abs(b.percentChange)) - (a.percentChange === null ? Infinity : Math.abs(a.percentChange))).slice(0, limit);
}
export function heatmapBuckets(daily: { day: string; total: number }[]): Record<string, number> {
  const nz = daily.filter((d) => d.total > 0).map((d) => d.total).sort((a, b) => a - b);
  const out: Record<string, number> = {};
  for (const d of daily) {
    if (d.total <= 0 || nz.length === 0) { out[d.day] = 0; continue; }
    const idx = Math.max(0, nz.findIndex((v) => v >= d.total));
    out[d.day] = Math.min(3, Math.floor((idx * 4) / nz.length)) + 1;
  }
  return out;
}
export function paceProjection(spentSoFar: number, from: number, to: number, now: number): number | null {
  if (now < from || now >= to) return null;
  const f = (now - from) / (to - from);
  return f <= 0 ? null : spentSoFar / f;
}
```

`web/src/logic/budget.ts`:
```ts
export const budgetLevel = (spend: number, limit: number): 0 | 1 | 2 => (limit <= 0 ? 0 : spend >= limit ? 2 : spend >= 0.8 * limit ? 1 : 0);
export const budgetProgress = (spend: number, limit: number) => ({ fraction: limit <= 0 ? 0 : Math.min(1, spend / limit), level: budgetLevel(spend, limit) });
```

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): period, stats, review, and budget logic ported from Android with tests

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 7: Space bootstrap, Inbox, tag sheet, transaction detail

**Files:**
- Create: `web/src/app/SpaceGate.tsx`, `web/src/hooks/useCategories.ts`, `web/src/components/CategoryGrid.tsx`, `web/src/components/TxRow.tsx`, `web/src/components/SyncBadge.tsx`, `web/src/screens/Inbox.tsx`, `web/src/screens/TransactionDetail.tsx`
- Modify: `web/src/app/routes.tsx`
- Test: `web/test/inbox.test.tsx`

**Interfaces:**
- `SpaceGate` (rendered inside `RequireAuth`, outside `Shell`): on mount `listSpaces()`; if `currentSpace` meta is unset or not in the list, set it to the personal space; register the device once per session (`registerDevice({ id: getDeviceId(), platform: "web", name: navigator.userAgent short form, app_version })`); mount `useSync(spaceId)` and expose `{ syncing, lastError, syncNow }` via context `useSyncStatus()`; show a spinner until the first pull completes when the local store is empty.
- `useCategories(spaceId)` → `{ list: LocalCategory[] (live, not deleted, sorted by sort_order), byId: Map, pickable: LocalCategory[] (not archived, kind !== "transfer") }`.
- `CategoryGrid({ categories, selected, onSelect })` — 3-column chip grid using `categoryStyle`.
- `Inbox`: hero with this month's money out/in (masked), a sync badge (Synced / Syncing… / Offline / error), then sections "Needs a category" (untagged, oldest first) and "Recent" (tagged, newest first, 50 rows, "Show more" +50). Row tap → `/tx/:id`.
- `TransactionDetail`: shows amount/direction/counterparty/date/source/receipt; `CategoryGrid` + reason field; Save → `tagTransaction`, `requestSync()`, back; manual rows also allow editing amount/counterparty/date/direction (`editManualTransaction`); Delete (confirm) → `softDeleteTransaction`; rows in `error` show the `sync_error` copy.

- [ ] **Step 1: Failing test**

`web/test/inbox.test.tsx`:
```tsx
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
    expect(screen.getByText("Ksh ••••")).toBeInTheDocument(); // hero masked by default
  });
});
```

- [ ] **Step 2: Implement**

`web/src/hooks/useCategories.ts`:
```ts
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type LocalCategory } from "../db/schema";
export function useCategories(spaceId: string | null) {
  const rows = useLiveQuery(() => (spaceId ? db.categories.where({ space_id: spaceId }).toArray() : Promise.resolve([] as LocalCategory[])), [spaceId]) ?? [];
  return useMemo(() => {
    const list = rows.filter((c) => !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return { list, byId: new Map(list.map((c) => [c.id, c])), pickable: list.filter((c) => !c.archived && c.kind !== "transfer") };
  }, [rows]);
}
```

`web/src/components/CategoryGrid.tsx`:
```tsx
import type { LocalCategory } from "../db/schema";
import { categoryStyle } from "../theme/categories";
export function CategoryGrid({ categories, selected, onSelect }: { categories: LocalCategory[]; selected: string | null; onSelect(id: string): void }) {
  return (
    <div className="grid3" role="listbox" aria-label="Category">
      {categories.map((c) => { const s = categoryStyle(c); const sel = c.id === selected;
        return <button key={c.id} type="button" role="option" aria-selected={sel} className={`chip ${sel ? "selected" : ""}`} style={{ ["--chip-color" as any]: s.color, justifyContent: "center" }} onClick={() => onSelect(c.id)}>{s.emoji} {c.name}</button>; })}
    </div>
  );
}
```

`web/src/components/TxRow.tsx`:
```tsx
import { Link } from "react-router";
import type { LocalCategory, LocalTx } from "../db/schema";
import { Amount } from "./Amount";
import { categoryStyle } from "../theme/categories";
import { timeAgo } from "../logic/dates";
export function TxRow({ t, cat }: { t: LocalTx; cat?: LocalCategory }) {
  const s = t.category_id ? categoryStyle(cat) : { emoji: t.sync_state === "error" ? "❗" : "🧾", color: "var(--cat-fallback)" };
  return (
    <Link to={`/tx/${t.id}`} className="row" style={{ textDecoration: "none" }}>
      <span style={{ fontSize: 22 }}>{s.emoji}</span>
      <div className="grow"><div className="title">{t.counterparty}</div><div className="sub">{cat?.name ?? (t.sync_state === "error" ? "Needs attention" : "Untagged")} · {timeAgo(t.occurred_at)}{t.reason ? ` · ${t.reason}` : ""}</div></div>
      <Amount cents={t.direction === "in" ? t.amount_cents : -(t.amount_cents + t.cost_cents)} direction={t.direction} />
    </Link>
  );
}
```

`web/src/components/SyncBadge.tsx`:
```tsx
import { useSyncStatus } from "../app/SpaceGate";
export function SyncBadge() {
  const { syncing, lastError, syncNow } = useSyncStatus();
  const text = syncing ? "Syncing…" : !navigator.onLine ? "Offline" : lastError ?? "Synced";
  return <button className="iconbtn" style={{ fontSize: 12, color: lastError ? "var(--on-hero-out)" : "var(--on-hero-dim)" }} onClick={() => void syncNow()}>{text} ⟳</button>;
}
```

`web/src/app/SpaceGate.tsx`:
```tsx
import { createContext, useContext, useEffect, useState } from "react";
import { Outlet } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { listSpaces, type Space } from "../api/spaces";
import { registerDevice } from "../api/devices";
import { APP_VERSION } from "../api/client";
import { db } from "../db/schema";
import { getCurrentSpaceId, getDeviceId, setCurrentSpaceId } from "../db/meta";
import { useSpaceId } from "../hooks/useSpace";
import { useSync } from "../sync/useSync";

export const SyncStatusContext = createContext<{ syncing: boolean; lastError: string | null; syncNow(): Promise<void> }>({ syncing: false, lastError: null, syncNow: async () => {} });
export const useSyncStatus = () => useContext(SyncStatusContext);
export const SpacesContext = createContext<Space[]>([]);
export const useSpaces = () => useContext(SpacesContext);

const deviceName = () => { const ua = navigator.userAgent; return /iPhone/.test(ua) ? "iPhone (web)" : /Android/.test(ua) ? "Android (web)" : /Mac/.test(ua) ? "Mac (web)" : "Browser"; };

export function SpaceGate() {
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const spaceId = useSpaceId();
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listSpaces(); if (!alive) return;
        setSpaces(list);
        const current = await getCurrentSpaceId();
        if (!current || !list.some((s) => s.id === current)) await setCurrentSpaceId((list.find((s) => s.kind === "personal") ?? list[0]!).id);
        void registerDevice({ id: await getDeviceId(), platform: "web", name: deviceName(), app_version: APP_VERSION }).catch(() => {});
      } catch { if (alive) setBootError("Couldn't load your spaces. Check your connection and reload."); }
    })();
    return () => { alive = false; };
  }, []);
  const sync = useSync(spaceId);
  const count = useLiveQuery(() => (spaceId ? db.categories.where({ space_id: spaceId }).count() : Promise.resolve(0)), [spaceId]) ?? 0;
  if (bootError && !spaceId) return <div className="empty">{bootError}</div>;
  if (!spaceId || !spaces) return <div className="empty">Loading…</div>;
  if (count === 0 && sync.syncing) return <div className="empty">Fetching your data…</div>;
  return <SpacesContext.Provider value={spaces}><SyncStatusContext.Provider value={sync}><Outlet /></SyncStatusContext.Provider></SpacesContext.Provider>;
}
```

`web/src/screens/Inbox.tsx`:
```tsx
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { useMask } from "../hooks/useMask";
import { Amount } from "../components/Amount";
import { TxRow } from "../components/TxRow";
import { SyncBadge } from "../components/SyncBadge";
import { SectionCard } from "../components/SectionCard";
import { EmptyState } from "../components/EmptyState";
import { totals } from "../logic/stats";
import { range, label } from "../logic/period";

export function Inbox() {
  const spaceId = useSpaceId();
  const { byId } = useCategories(spaceId);
  const { hidden, toggle } = useMask();
  const [limit, setLimit] = useState(50);
  const rows = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).toArray() : Promise.resolve([])), [spaceId]) ?? [];
  const live = rows.filter((t) => !t.deleted_at);
  const untagged = live.filter((t) => !t.category_id && t.direction !== "transfer").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const recent = live.filter((t) => t.category_id || t.direction === "transfer").sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const now = new Date(); const { from, to } = range("month", now); const t = totals(live, byId, from, to);
  return (
    <>
      <div className="hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="dim">{label("month", now)}</span><SyncBadge /></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="big"><Amount cents={t.moneyOut} masked /></span><span className="dim">out</span>
          <button className="iconbtn" aria-label={hidden ? "Show amounts" : "Hide amounts"} onClick={toggle}>{hidden ? "👁" : "🙈"}</button></div>
        <div className="dim">In: <Amount cents={t.moneyIn} masked /></div>
      </div>
      {untagged.length > 0 && <SectionCard title="Needs a category">{untagged.map((x) => <TxRow key={x.id} t={x} />)}</SectionCard>}
      <SectionCard title="Recent">
        {recent.length === 0 && untagged.length === 0 ? <EmptyState title="Nothing here yet" hint="Add a transaction or sync your phone." /> :
          <>{recent.slice(0, limit).map((x) => <TxRow key={x.id} t={x} cat={x.category_id ? byId.get(x.category_id) : undefined} />)}
            {recent.length > limit && <button className="btn secondary" onClick={() => setLimit((l) => l + 50)}>Show more</button>}</>}
      </SectionCard>
    </>
  );
}
```

`web/src/screens/TransactionDetail.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
import { editManualTransaction, softDeleteTransaction, tagTransaction } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { CategoryGrid } from "../components/CategoryGrid";
import { Amount } from "../components/Amount";
import { formatKes, parseKesInput } from "../logic/money";
import { copyFor } from "../api/errors";

export function TransactionDetail() {
  const { id } = useParams(); const nav = useNavigate(); const spaceId = useSpaceId();
  const { pickable } = useCategories(spaceId);
  const t = useLiveQuery(() => (id ? db.transactions.get(id) : Promise.resolve(undefined)), [id]);
  const [cat, setCat] = useState<string | null>(null); const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(""); const [counterparty, setCounterparty] = useState(""); const [when, setWhen] = useState(""); const [dir, setDir] = useState<"in" | "out">("out");
  useEffect(() => { if (t) { setCat(t.category_id); setReason(t.reason ?? ""); setAmount(String(t.amount_cents / 100)); setCounterparty(t.counterparty); setWhen(t.occurred_at.slice(0, 16)); setDir(t.direction === "in" ? "in" : "out"); } }, [t?.id]);
  if (!t) return <div className="empty">Not found</div>;
  const manual = t.source === "manual";
  async function save() {
    if (manual) { const cents = parseKesInput(amount); if (!cents) return; await editManualTransaction(t!.id, { amount_cents: cents, counterparty, occurred_at: new Date(when).toISOString(), direction: dir }); }
    await tagTransaction(t!.id, cat, reason); requestSync(); nav(-1);
  }
  async function del() { if (confirm("Delete this transaction?")) { await softDeleteTransaction(t!.id); requestSync(); nav("/", { replace: true }); } }
  return (
    <>
      <div className="hero"><div className="dim">{t.counterparty}</div><div className="big"><Amount cents={t.amount_cents} direction={t.direction} /></div>
        <div className="dim">{new Date(t.occurred_at).toLocaleString()} · {t.source}{t.receipt_code ? ` · ${t.receipt_code}` : ""}{t.cost_cents ? ` · fee ${formatKes(t.cost_cents)}` : ""}</div></div>
      {t.sync_state === "error" && <div className="card error">Not synced: {copyFor(t.sync_error ?? "", t.sync_error ?? "")}</div>}
      <div className="card">
        {manual && <>
          <div className="field"><label>Direction</label><select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")}><option value="out">Money out</option><option value="in">Money in</option></select></div>
          <div className="field"><label>Amount (Ksh)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label>Counterparty</label><input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></div>
          <div className="field"><label>When</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div></>}
        <div className="field"><label>Category</label><CategoryGrid categories={pickable} selected={cat} onSelect={setCat} /></div>
        <div className="field"><label>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. lunch with Sam" /></div>
        <button className="btn" onClick={() => void save()}>Save</button>
        <button className="btn danger" style={{ marginTop: 8 }} onClick={() => void del()}>Delete</button>
      </div>
    </>
  );
}
```
Routes: wrap the `Shell` route in `<Route element={<SpaceGate />}>`; add `<Route path="tx/:id" element={<TransactionDetail />} />`; replace the Inbox placeholder.

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): space bootstrap, device registration, inbox, tag/edit/delete detail

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 8: Add transaction screen with rule auto-tag

**Files:**
- Create: `web/src/screens/AddTransaction.tsx`, `web/src/logic/rules.ts`
- Modify: `web/src/app/routes.tsx`
- Test: `web/test/rules.test.ts`

**Interfaces:** `matchRule(rules: LocalRule[], counterparty: string): string | null` (category id for an exact normalised match, live rules only). Screen: direction toggle (out/in), amount (`inputMode="decimal"`), counterparty (with a datalist of the 20 most recent distinct counterparties), date-time default now, category grid (pre-selected by rule when counterparty matches; a manual pick always wins), reason. Save → `createManualTransaction`, `requestSync()`, navigate to `/`.

- [ ] **Step 1: Failing test**

`web/test/rules.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { matchRule } from "../src/logic/rules";
const r = (m: string, c: string, deleted = false) => ({ id: m, match_counterparty: m, category_id: c, deleted_at: deleted ? "x" : null } as any);
describe("matchRule", () => {
  it("matches normalised counterparty against live rules only", () => {
    expect(matchRule([r("naivas supermarket", "food")], "  Naivas   SUPERMARKET ")).toBe("food");
    expect(matchRule([r("naivas", "food", true)], "naivas")).toBeNull();
    expect(matchRule([], "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

`web/src/logic/rules.ts`:
```ts
import type { LocalRule } from "../db/schema";
import { normaliseCounterparty } from "../db/repo";
export function matchRule(rules: LocalRule[], counterparty: string): string | null {
  const key = normaliseCounterparty(counterparty);
  return rules.find((r) => !r.deleted_at && r.match_counterparty === key)?.category_id ?? null;
}
```

`web/src/screens/AddTransaction.tsx`:
```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/schema";
import { createManualTransaction } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { CategoryGrid } from "../components/CategoryGrid";
import { parseKesInput } from "../logic/money";
import { matchRule } from "../logic/rules";

const localNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

export function AddTransaction() {
  const nav = useNavigate(); const spaceId = useSpaceId(); const { pickable } = useCategories(spaceId);
  const rules = useLiveQuery(() => (spaceId ? db.rules.where({ space_id: spaceId }).toArray() : Promise.resolve([])), [spaceId]) ?? [];
  const recent = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).reverse().sortBy("occurred_at") : Promise.resolve([])), [spaceId]) ?? [];
  const suggestions = useMemo(() => [...new Set(recent.filter((t) => !t.deleted_at).map((t) => t.counterparty))].slice(0, 20), [recent]);
  const [dir, setDir] = useState<"out" | "in">("out"); const [amount, setAmount] = useState(""); const [counterparty, setCounterparty] = useState("");
  const [when, setWhen] = useState(localNow()); const [cat, setCat] = useState<string | null>(null); const [picked, setPicked] = useState(false); const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!picked) setCat(matchRule(rules, counterparty)); }, [counterparty, rules, picked]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseKesInput(amount); if (!cents) { setError("Enter an amount above zero."); return; }
    if (!counterparty.trim()) { setError("Who was this with?"); return; }
    await createManualTransaction(spaceId!, { direction: dir, amount_cents: cents, counterparty, occurred_at: new Date(when).toISOString(), category_id: cat, reason: reason || null });
    requestSync(); nav("/", { replace: true });
  }
  return (
    <form onSubmit={save}>
      <div className="hero"><div className="dim">New transaction</div><div className="big">Add</div></div>
      <div className="card">
        <div className="field"><label>Direction</label><div className="grid3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <button type="button" className={`chip ${dir === "out" ? "selected" : ""}`} style={{ ["--chip-color" as any]: "var(--money-out)", justifyContent: "center" }} onClick={() => setDir("out")}>Money out</button>
          <button type="button" className={`chip ${dir === "in" ? "selected" : ""}`} style={{ ["--chip-color" as any]: "var(--money-in)", justifyContent: "center" }} onClick={() => setDir("in")}>Money in</button></div></div>
        <div className="field"><label>Amount (Ksh)</label><input inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></div>
        <div className="field"><label>Counterparty</label><input list="cp" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Shop, person, or note" /><datalist id="cp">{suggestions.map((s) => <option key={s} value={s} />)}</datalist></div>
        <div className="field"><label>When</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <div className="field"><label>Category{!picked && cat ? " (from a rule)" : ""}</label><CategoryGrid categories={pickable} selected={cat} onSelect={(id) => { setCat(id); setPicked(true); }} /></div>
        <div className="field"><label>Reason (optional)</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        {error && <div className="error">{error}</div>}
        <button className="btn">Save</button>
      </div>
    </form>
  );
}
```
Route: replace the Add placeholder.

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): add manual transaction with rule-based auto-tag

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 9: Stats screen (period tab)

**Files:**
- Create: `web/src/components/PeriodNav.tsx`, `web/src/components/Bar.tsx`, `web/src/screens/Stats.tsx`, `web/src/hooks/useSpaceData.ts`
- Modify: `web/src/app/routes.tsx`, `web/src/theme/base.css` (chart rules)
- Test: `web/test/stats-screen.test.tsx`

**Chart rules (validated 2026-09-12 with the dataviz palette validator):** the six spend-category colours pass all checks on light `#FFFFFF` and dark `#16201B`; the transfer gray `#607468` is excluded from every chart (transfers are excluded from stats). Bars are thin (8px), 4px-rounded at the data end only, anchored at the baseline, with a 2px surface gap between adjacent bars; every bar carries its own direct label (category name + amount) so identity is never colour-alone; values and labels use text tokens, not the series colour; hover/tap shows a tooltip via `title`. One axis, no dual scales.

**Interfaces:**
- `useSpaceData(spaceId)` → `{ rows: LocalTx[] (live, deleted excluded), cats, budgets: LocalBudget[] (live) }` from Dexie.
- `PeriodNav({ period, ref, onChange, earliest })` — segmented control week/month/year, chevrons, and a "jump" sheet listing `periodsInRange(period, earliest)` labels.
- `Bar({ fraction, color, label, value, sub })` — the bar row used by "Where it went" and budgets.
- `Stats` route `/stats` with tabs Period | Review (Review is Task 10). Period tab sections (parity with Android): hero totals (out / in, masked, comparison vs previous period "▲ 12% vs last month"), "Where it went" (category bars as share of spend; in `month` view a category with a budget shows budget progress instead: fraction of limit, colour turns to `--money-out` at level 2, gold at level 1), "Top spending days", "Biggest expenses", "Top counterparties"; empty state "Nothing here yet" when the period has no rows.

- [ ] **Step 1: Failing test**

`web/test/stats-screen.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { createManualTransaction, setBudget, upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { MaskProvider } from "../src/hooks/useMask";
import { Stats } from "../src/screens/Stats";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });

describe("Stats period tab", () => {
  it("shows category bars with direct labels and a budget bar in month view", async () => {
    const food = await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    await createManualTransaction(S, { direction: "out", amount_cents: 150000, counterparty: "Naivas", occurred_at: new Date().toISOString(), category_id: food, reason: null });
    await setBudget(S, food, 200000);
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Where it went")).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
    expect(screen.getByText(/of Ksh 2,000/)).toBeInTheDocument(); // budget progress label
    expect(screen.getByText("Top counterparties")).toBeInTheDocument();
  });
  it("shows the empty state when the period has no rows", async () => {
    render(<MemoryRouter><MaskProvider><Stats /></MaskProvider></MemoryRouter>);
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Add to `base.css`:
```css
.barrow { display: grid; grid-template-columns: 28px 1fr auto; gap: 10px; align-items: center; padding: 8px 0; }
.barrow .track { height: 8px; background: var(--surface-2); border-radius: 0 4px 4px 0; overflow: hidden; margin-top: 4px; }
.barrow .fill { height: 100%; border-radius: 0 4px 4px 0; background: var(--bar-color); box-shadow: 2px 0 0 var(--surface); }
.barrow .label { font-size: 14px; font-weight: 600; }
.barrow .sub { font-size: 12px; color: var(--text-dim); }
.seg { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--surface-2); border-radius: 12px; padding: 3px; }
.seg button { border: none; background: transparent; padding: 8px; border-radius: 10px; color: var(--text-dim); }
.seg button.on { background: var(--surface); color: var(--text); font-weight: 600; }
.pnav { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
.pnav .title { flex: 1; text-align: center; font-weight: 600; }
.tabs { display: flex; gap: 16px; border-bottom: 1px solid var(--line); margin: 8px 0; }
.tabs button { background: none; border: none; padding: 10px 0; color: var(--text-dim); border-bottom: 2px solid transparent; }
.tabs button.on { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
```

`web/src/hooks/useSpaceData.ts`:
```ts
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db } from "../db/schema";
import { useCategories } from "./useCategories";
export function useSpaceData(spaceId: string | null) {
  const all = useLiveQuery(() => (spaceId ? db.transactions.where({ space_id: spaceId }).toArray() : Promise.resolve([])), [spaceId]) ?? [];
  const budgetsAll = useLiveQuery(() => (spaceId ? db.budgets.where({ space_id: spaceId }).toArray() : Promise.resolve([])), [spaceId]) ?? [];
  const cats = useCategories(spaceId);
  const rows = useMemo(() => all.filter((t) => !t.deleted_at), [all]);
  const budgets = useMemo(() => budgetsAll.filter((b) => !b.deleted_at), [budgetsAll]);
  const earliest = useMemo(() => rows.reduce<string | null>((m, t) => (m === null || t.occurred_at < m ? t.occurred_at : m), null), [rows]);
  return { rows, cats, budgets, earliest: earliest ? new Date(earliest) : new Date() };
}
```

`web/src/components/Bar.tsx`:
```tsx
export function Bar({ fraction, color, emoji, label, value, sub }: { fraction: number; color: string; emoji: string; label: string; value: string; sub?: string }) {
  return (
    <div className="barrow" title={`${label}: ${value}${sub ? ` (${sub})` : ""}`}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div><div className="label">{label}</div><div className="track"><div className="fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`, ["--bar-color" as any]: color }} /></div>{sub && <div className="sub">{sub}</div>}</div>
      <div className="label">{value}</div>
    </div>
  );
}
```

`web/src/components/PeriodNav.tsx`:
```tsx
import { useState } from "react";
import { Sheet } from "./Sheet";
import { label, periodsInRange, step, type Period } from "../logic/period";
export function PeriodNav({ period, refDate, earliest, onChange }: { period: Period; refDate: Date; earliest: Date; onChange(p: Period, r: Date): void }) {
  const [jump, setJump] = useState(false);
  const today = new Date(); const atLatest = step(period, refDate, 1) > today;
  return (
    <>
      <div className="seg">{(["week", "month", "year"] as Period[]).map((p) => <button key={p} className={p === period ? "on" : ""} onClick={() => onChange(p, today)}>{p[0]!.toUpperCase() + p.slice(1)}</button>)}</div>
      <div className="pnav"><button className="iconbtn" aria-label="Previous" onClick={() => onChange(period, step(period, refDate, -1))}>‹</button>
        <button className="title iconbtn" onClick={() => setJump(true)}>{label(period, refDate)}</button>
        <button className="iconbtn" aria-label="Next" disabled={atLatest} onClick={() => onChange(period, step(period, refDate, 1))}>›</button></div>
      <Sheet open={jump} onClose={() => setJump(false)}>
        {periodsInRange(period, earliest).map((r) => <button key={r.toISOString()} className="row" style={{ width: "100%", background: "none", border: "none", textAlign: "left" }} onClick={() => { onChange(period, r); setJump(false); }}>{label(period, r)}</button>)}
      </Sheet>
    </>
  );
}
```

`web/src/screens/Stats.tsx`:
```tsx
import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaceData } from "../hooks/useSpaceData";
import { useMask } from "../hooks/useMask";
import { Amount } from "../components/Amount";
import { Bar } from "../components/Bar";
import { PeriodNav } from "../components/PeriodNav";
import { SectionCard } from "../components/SectionCard";
import { EmptyState } from "../components/EmptyState";
import { ReviewTab } from "./ReviewTab";
import { range, step, type Period } from "../logic/period";
import { biggestExpenses, categoryTotals, topCounterparties, topDays, totals, categorySpend } from "../logic/stats";
import { budgetProgress } from "../logic/budget";
import { formatKes } from "../logic/money";
import { dayLabel } from "../logic/dates";
import { categoryStyle } from "../theme/categories";

export function Stats() {
  const spaceId = useSpaceId(); const { rows, cats, budgets, earliest } = useSpaceData(spaceId);
  const [tab, setTab] = useState<"period" | "review">("period");
  const [period, setPeriod] = useState<Period>("month"); const [ref, setRef] = useState(new Date());
  const { hidden, toggle } = useMask();
  const { from, to } = range(period, ref); const prev = range(period, step(period, ref, -1));
  const t = totals(rows, cats.byId, from, to); const p = totals(rows, cats.byId, prev.from, prev.to);
  const delta = p.moneyOut > 0 ? Math.round(((t.moneyOut - p.moneyOut) / p.moneyOut) * 100) : null;
  const byCat = categoryTotals(rows, cats.byId, from, to); const maxCat = byCat[0]?.total ?? 1;
  const budgetByCat = new Map(budgets.map((b) => [b.category_id, b]));
  const empty = t.moneyIn === 0 && t.moneyOut === 0;
  return (
    <>
      <div className="hero">
        <div className="dim">Money out</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="big"><Amount cents={t.moneyOut} masked /></span><button className="iconbtn" onClick={toggle}>{hidden ? "👁" : "🙈"}</button></div>
        <div className="dim">In: <Amount cents={t.moneyIn} masked />{delta !== null && !hidden && <> · {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs previous</>}</div>
      </div>
      <div className="tabs"><button className={tab === "period" ? "on" : ""} onClick={() => setTab("period")}>Period</button><button className={tab === "review" ? "on" : ""} onClick={() => setTab("review")}>Review</button></div>
      {tab === "review" ? <ReviewTab rows={rows} cats={cats.byId} period={period} refDate={ref} /> : <>
        <PeriodNav period={period} refDate={ref} earliest={earliest} onChange={(p, r) => { setPeriod(p); setRef(r); }} />
        {empty ? <EmptyState title="Nothing here yet" hint="No transactions in this period." /> : <>
          <SectionCard title="Where it went">
            {byCat.map((c) => { const cat = cats.byId.get(c.categoryId); const s = categoryStyle(cat); const b = period === "month" ? budgetByCat.get(c.categoryId) : undefined;
              if (b) { const bp = budgetProgress(categorySpend(rows, cats.byId, c.categoryId, from, to), b.monthly_limit_cents); const color = bp.level === 2 ? "var(--money-out)" : bp.level === 1 ? "var(--gold)" : s.color;
                return <Bar key={c.categoryId} fraction={bp.fraction} color={color} emoji={s.emoji} label={c.name} value={formatKes(c.total)} sub={`${Math.round(bp.fraction * 100)}% of ${formatKes(b.monthly_limit_cents)}`} />; }
              return <Bar key={c.categoryId} fraction={c.total / maxCat} color={s.color} emoji={s.emoji} label={c.name} value={formatKes(c.total)} sub={`${Math.round((c.total / Math.max(1, t.moneyOut)) * 100)}% of spend`} />; })}
            {byCat.length === 0 && <div className="sub">Everything in this period is untagged.</div>}
          </SectionCard>
          <SectionCard title="Top spending days">{topDays(rows, cats.byId, from, to).map((d) => <div key={d.day} className="row"><div className="grow title">{dayLabel(d.day)}</div><span>{formatKes(d.total)}</span></div>)}</SectionCard>
          <SectionCard title="Biggest expenses">{biggestExpenses(rows, cats.byId, from, to).map((x) => <div key={x.id} className="row"><span>{categoryStyle(x.category_id ? cats.byId.get(x.category_id) : undefined).emoji}</span><div className="grow"><div className="title">{x.counterparty}</div><div className="sub">{dayLabel(x.occurred_at.slice(0, 10))}</div></div><span>{formatKes(x.amount_cents + x.cost_cents)}</span></div>)}</SectionCard>
          <SectionCard title="Top counterparties">{topCounterparties(rows, cats.byId, from, to).map((c) => <div key={c.name} className="row"><div className="grow title">{c.name}</div><span>{formatKes(c.total)}</span></div>)}</SectionCard>
        </>}
      </>}
    </>
  );
}
```
`ReviewTab` is created in Task 10; for this task create `web/src/screens/ReviewTab.tsx` as `export function ReviewTab(_: { rows: LocalTx[]; cats: Map<string, LocalCategory>; period: Period; refDate: Date }) { return <div className="empty">Review</div>; }` so the build passes. Route: replace the Stats placeholder.

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): stats period tab with period nav, category and budget bars, top lists

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 10: Review tab (trend strip, savings rate, movers, pace, heatmap)

**Files:**
- Modify: `web/src/screens/ReviewTab.tsx` (replace the stub), `web/src/theme/base.css`
- Test: `web/test/review-tab.test.tsx`

**Interfaces / rules:** Trend strip = last 8 periods as thin vertical bars (one hue `var(--accent)`, 4px rounded top, 2px gaps, direct label under the current bar only, `title` tooltip on each); savings-rate trend as a sparkline of text values ("32% · 28% · —"); movers list (up to 3) with "new" / "+120%" / "−40%" badges in text tokens; pace projection card ("At this pace: Ksh 48,000 by month end") only inside the current period; heatmap = trailing 12 months of daily totals as a 7-row calendar grid, 5 sequential steps of ONE hue light→dark (`color-mix(in srgb, var(--accent) N%, var(--surface-2))` for N in 0, 25, 45, 65, 90), each cell `title`-tooltipped with the day and amount, plus a text legend "less → more". Everything readable without colour (labels/tooltips/text badges).

- [ ] **Step 1: Failing test**

`web/test/review-tab.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewTab } from "../src/screens/ReviewTab";
import type { LocalCategory, LocalTx } from "../src/db/schema";
const cat = (id: string): LocalCategory => ({ id, name: id, kind: "expense", emoji: "x", color: "#B02E0C", sort_order: 0, archived: false, is_system: false, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, space_id: "s", sync_state: "clean", sync_error: null });
const tx = (cents: number, iso: string): LocalTx => ({ id: iso + cents, space_id: "s", captured_by: null, source: "manual", receipt_code: null, direction: "out", amount_cents: cents, cost_cents: 0, balance_cents: null, counterparty: "x", occurred_at: iso, category_id: "food", reason: null, linked_transaction_id: null, client_updated_at: "", seq: 0, updated_at: "", deleted_at: null, sync_state: "clean", sync_error: null });
describe("ReviewTab", () => {
  it("renders trend, movers, pace and heatmap sections", () => {
    const now = new Date(); const iso = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 10).toISOString();
    render(<ReviewTab rows={[tx(5000, iso)]} cats={new Map([["food", cat("food")]])} period="month" refDate={now} />);
    expect(screen.getByText("Spend trend")).toBeInTheDocument();
    expect(screen.getByText("Category movers")).toBeInTheDocument();
    expect(screen.getByText(/At this pace/)).toBeInTheDocument();
    expect(screen.getByText("Spend calendar")).toBeInTheDocument();
    expect(screen.getByText("food")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Add to `base.css`:
```css
.trend { display: grid; grid-auto-flow: column; align-items: end; gap: 2px; height: 96px; }
.trend .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.trend .vbar { width: 100%; max-width: 28px; background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; }
.trend .cur .vbar { background: var(--hero-bottom); }
.trend .lbl { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.heat { display: grid; grid-template-rows: repeat(7, 10px); grid-auto-flow: column; gap: 2px; overflow-x: auto; padding-bottom: 4px; }
.heat i { display: block; width: 10px; height: 10px; border-radius: 2px; background: var(--cell); }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); }
```

`web/src/screens/ReviewTab.tsx`:
```tsx
import type { LocalCategory, LocalTx } from "../db/schema";
import { SectionCard } from "../components/SectionCard";
import { formatKes } from "../logic/money";
import { range, type Period } from "../logic/period";
import { dailyTotals, totals } from "../logic/stats";
import { categoryMovers, heatmapBuckets, paceProjection, trendSeries } from "../logic/review";
import { dayLabel } from "../logic/dates";
import { categoryStyle } from "../theme/categories";

const STEPS = [0, 25, 45, 65, 90];
export function ReviewTab({ rows, cats, period, refDate }: { rows: LocalTx[]; cats: Map<string, LocalCategory>; period: Period; refDate: Date }) {
  const series = trendSeries(rows, cats, period, refDate, 8); const max = Math.max(1, ...series.map((s) => s.moneyOut));
  const movers = categoryMovers(rows, cats, period, refDate);
  const { from, to } = range(period, refDate); const now = Date.now(); const pace = paceProjection(totals(rows, cats, from, to).moneyOut, from, to, now);
  const yearAgo = new Date(refDate); yearAgo.setFullYear(yearAgo.getFullYear() - 1); yearAgo.setDate(1);
  const daily = dailyTotals(rows, cats, yearAgo.getTime(), range("month", refDate).to); const buckets = heatmapBuckets(daily);
  const lead = (new Date(daily[0]?.day ?? refDate).getDay() + 6) % 7;
  return (
    <>
      <SectionCard title="Spend trend">
        <div className="trend">{series.map((s, i) => <div key={s.label} className={`col ${i === series.length - 1 ? "cur" : ""}`} title={`${s.label}: ${formatKes(s.moneyOut)}`}><div className="vbar" style={{ height: `${Math.max(2, (s.moneyOut / max) * 80)}%` }} />{i === series.length - 1 && <div className="lbl">{formatKes(s.moneyOut)}</div>}</div>)}</div>
        <div className="sub" style={{ marginTop: 8 }}>Savings rate: {series.map((s) => (s.savingsRate === null ? "—" : `${Math.round(s.savingsRate * 100)}%`)).join(" · ")}</div>
      </SectionCard>
      <SectionCard title="Category movers">
        {movers.length === 0 ? <div className="sub">Not enough history yet.</div> : movers.map((m) => { const s = categoryStyle(cats.get(m.categoryId)); return <div key={m.categoryId} className="row"><span>{s.emoji}</span><div className="grow"><div className="title">{m.name}</div><div className="sub">{formatKes(m.current)} vs {formatKes(m.previous)}</div></div><span className="badge">{m.isNew ? "new" : `${m.percentChange! >= 0 ? "+" : "−"}${Math.abs(m.percentChange!)}%`}</span></div>; })}
      </SectionCard>
      {pace !== null && <SectionCard title="Pace"><div className="title">At this pace: {formatKes(Math.round(pace))} by period end</div></SectionCard>}
      <SectionCard title="Spend calendar">
        <div className="heat" role="img" aria-label="Daily spend for the last 12 months">
          {Array.from({ length: lead }, (_, i) => <i key={`lead${i}`} style={{ visibility: "hidden" }} />)}
          {daily.map((d) => <i key={d.day} title={`${dayLabel(d.day)}: ${formatKes(d.total)}`} style={{ ["--cell" as any]: `color-mix(in srgb, var(--accent) ${STEPS[buckets[d.day] ?? 0]}%, var(--surface-2))` }} />)}
        </div>
        <div className="sub">less → more</div>
      </SectionCard>
    </>
  );
}
```

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): review tab — trend strip, movers, pace, 12-month spend calendar

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 11: Categories and budgets screens

**Files:**
- Create: `web/src/screens/Categories.tsx`, `web/src/screens/Budgets.tsx`
- Modify: `web/src/app/routes.tsx`, `web/src/screens/Settings.tsx` links (Task 12 creates Settings; add routes `/categories`, `/budgets` now)
- Test: `web/test/categories.test.tsx`

**Interfaces / rules:** Categories: list (emoji, name, kind badge, archived dimmed); "Add" sheet with name, emoji (text input, 1–2 graphemes), colour (`<input type="color">` defaulting to a rotating pick from the validated six), kind (expense/income); tap to edit; Archive/Unarchive; up/down reorder buttons (`reorderCategories`); system rows (`is_system`) cannot be archived or change kind (controls disabled with a hint); duplicate name (case-insensitive among live rows) blocked client-side with "You already have a category called X". Budgets: one row per pickable expense category with a "Ksh" input; blur/Enter saves via `setBudget` (empty → `deleteBudget` if one exists); current month progress bar under each. Both call `requestSync()` after writes.

- [ ] **Step 1: Failing test**

`web/test/categories.test.tsx`:
```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/schema";
import { upsertCategory } from "../src/db/repo";
import { setCurrentSpaceId } from "../src/db/meta";
import { Categories } from "../src/screens/Categories";

const S = "s1";
beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await setCurrentSpaceId(S); });
describe("Categories", () => {
  it("adds a category and blocks a duplicate name", async () => {
    await upsertCategory(S, { name: "food", kind: "expense", emoji: "🍛", color: "#B02E0C" });
    render(<MemoryRouter><Categories /></MemoryRouter>);
    fireEvent.click(await screen.findByText("Add category"));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "FOOD" } });
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText(/already have a category/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Rent" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(async () => expect((await db.categories.toArray()).map((c) => c.name).sort()).toEqual(["Rent", "food"]));
  });
});
```

- [ ] **Step 2: Implement**

`web/src/screens/Categories.tsx`:
```tsx
import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useCategories } from "../hooks/useCategories";
import { archiveCategory, reorderCategories, upsertCategory } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { Sheet } from "../components/Sheet";
import { SectionCard } from "../components/SectionCard";
import { categoryStyle } from "../theme/categories";
import type { LocalCategory } from "../db/schema";

const PALETTE = ["#B02E0C", "#2B6CB0", "#C43A8A", "#8B5CF6", "#AC8112", "#1B7F4B"];
type Draft = { id?: string; name: string; emoji: string; color: string; kind: "expense" | "income" };

export function Categories() {
  const spaceId = useSpaceId(); const { list } = useCategories(spaceId);
  const [draft, setDraft] = useState<Draft | null>(null); const [error, setError] = useState<string | null>(null);
  const editing = draft?.id ? list.find((c) => c.id === draft.id) : undefined;
  function open(c?: LocalCategory) { setError(null); setDraft(c ? { id: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind === "income" ? "income" : "expense" } : { name: "", emoji: "🧾", color: PALETTE[list.length % PALETTE.length]!, kind: "expense" }); }
  async function save() {
    if (!draft) return; const name = draft.name.trim();
    if (!name) { setError("Give it a name."); return; }
    if (list.some((c) => c.id !== draft.id && c.name.toLowerCase() === name.toLowerCase())) { setError(`You already have a category called ${name}.`); return; }
    if (!/^\p{Extended_Pictographic}/u.test(draft.emoji) || [...draft.emoji].length > 2) { setError("Pick one emoji."); return; }
    await upsertCategory(spaceId!, { id: draft.id, name, emoji: draft.emoji, color: draft.color, kind: editing?.is_system ? editing.kind : draft.kind });
    requestSync(); setDraft(null);
  }
  async function move(i: number, dir: -1 | 1) { const ids = list.map((c) => c.id); const j = i + dir; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j]!, ids[i]!]; await reorderCategories(ids); requestSync(); }
  return (
    <>
      <div className="hero"><div className="dim">Settings</div><div className="big">Categories</div></div>
      <SectionCard title="Your categories" action={<button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => open()}>Add category</button>}>
        {list.map((c, i) => { const s = categoryStyle(c); return (
          <div key={c.id} className="row" style={{ opacity: c.archived ? 0.5 : 1 }}>
            <span style={{ fontSize: 22 }}>{s.emoji}</span>
            <button className="grow iconbtn" style={{ textAlign: "left", fontSize: 14 }} onClick={() => open(c)}><div className="title">{c.name}</div><div className="sub">{c.kind}{c.is_system ? " · built-in" : ""}{c.archived ? " · archived" : ""}</div></button>
            <button className="iconbtn" aria-label="Move up" onClick={() => void move(i, -1)}>↑</button><button className="iconbtn" aria-label="Move down" onClick={() => void move(i, 1)}>↓</button>
            {!c.is_system && <button className="iconbtn" onClick={() => { void archiveCategory(c.id, !c.archived); requestSync(); }}>{c.archived ? "♻️" : "🗄"}</button>}
          </div>); })}
      </SectionCard>
      <Sheet open={draft !== null} onClose={() => setDraft(null)}>
        {draft && <>
          <h3>{draft.id ? "Edit category" : "New category"}</h3>
          <div className="field"><label htmlFor="cat-name">Name</label><input id="cat-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-emoji">Emoji</label><input id="cat-emoji" value={draft.emoji} onChange={(e) => setDraft({ ...draft, emoji: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-color">Colour</label><input id="cat-color" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></div>
          <div className="field"><label htmlFor="cat-kind">Kind</label><select id="cat-kind" value={draft.kind} disabled={!!editing?.is_system} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}><option value="expense">Expense</option><option value="income">Income</option></select>{editing?.is_system && <div className="sub">Built-in categories keep their kind.</div>}</div>
          {error && <div className="error">{error}</div>}
          <button className="btn" onClick={() => void save()}>Save</button>
        </>}
      </Sheet>
    </>
  );
}
```

`web/src/screens/Budgets.tsx`:
```tsx
import { useState } from "react";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaceData } from "../hooks/useSpaceData";
import { deleteBudget, setBudget } from "../db/repo";
import { requestSync } from "../sync/useSync";
import { SectionCard } from "../components/SectionCard";
import { Bar } from "../components/Bar";
import { parseKesInput, formatKes } from "../logic/money";
import { range } from "../logic/period";
import { categorySpend } from "../logic/stats";
import { budgetProgress } from "../logic/budget";
import { categoryStyle } from "../theme/categories";

export function Budgets() {
  const spaceId = useSpaceId(); const { rows, cats, budgets } = useSpaceData(spaceId);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { from, to } = range("month", new Date());
  const byCat = new Map(budgets.map((b) => [b.category_id, b]));
  async function commit(categoryId: string) {
    const text = drafts[categoryId]; if (text === undefined) return;
    const cents = parseKesInput(text); const existing = byCat.get(categoryId);
    if (cents) await setBudget(spaceId!, categoryId, cents); else if (existing) await deleteBudget(existing.id);
    requestSync();
  }
  return (
    <>
      <div className="hero"><div className="dim">Settings</div><div className="big">Budgets</div><div className="dim">Monthly limits per category. You'll see progress on Stats.</div></div>
      <SectionCard title="This month">
        {cats.pickable.filter((c) => c.kind === "expense").map((c) => { const b = byCat.get(c.id); const s = categoryStyle(c); const spend = categorySpend(rows, cats.byId, c.id, from, to); const bp = b ? budgetProgress(spend, b.monthly_limit_cents) : null;
          return <div key={c.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 20 }}>{s.emoji}</span><div className="title" style={{ flex: 1 }}>{c.name}</div>
              <input inputMode="decimal" placeholder="No limit" style={{ width: 120, padding: 8, borderRadius: 10, border: "1px solid var(--line)" }} value={drafts[c.id] ?? (b ? String(b.monthly_limit_cents / 100) : "")}
                onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })} onBlur={() => void commit(c.id)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></div>
            {bp && <Bar fraction={bp.fraction} color={bp.level === 2 ? "var(--money-out)" : bp.level === 1 ? "var(--gold)" : s.color} emoji="" label="" value={`${formatKes(spend)} of ${formatKes(b!.monthly_limit_cents)}`} />}
          </div>; })}
      </SectionCard>
    </>
  );
}
```
Routes: add `categories` and `budgets` inside the `Shell` route.

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): categories (add/edit/archive/reorder) and budgets screens

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 12: Settings, devices, install hint, sign-out, privacy page

**Files:**
- Create: `web/src/screens/Settings.tsx`, `web/src/screens/Privacy.tsx`, `web/src/components/InstallHint.tsx`
- Modify: `web/src/app/routes.tsx`
- Test: `web/test/install-hint.test.tsx`

**Interfaces / rules:** Settings shows the signed-in name/email (from `useSession`), the current space (name, kind), links to Categories, Budgets, Privacy; a "Devices" list from `listDevices()` (name, platform, last seen); "Sync now" with the last-sync time from meta; app version; "Sign out" (calls `authClient.signOut()`, clears local tables via `clearAllLocal()`, navigates to `/sign-in`). `InstallHint` renders only when not in standalone mode (`!window.matchMedia("(display-mode: standalone)").matches && !navigator.standalone`) and the UA is iOS Safari: "Install Wallet: tap Share, then Add to Home Screen"; on other browsers with a captured `beforeinstallprompt` event it renders an "Install" button that calls `prompt()`. Privacy page is the spec §16 text (what is stored, what is not, who sees it, retention, contact) as static content at `/privacy`, reachable without sign-in.

- [ ] **Step 1: Failing test**

`web/test/install-hint.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallHint } from "../src/components/InstallHint";
describe("InstallHint", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows the iOS Share hint in Safari on iPhone when not installed", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", standalone: false });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    render(<InstallHint />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
  });
  it("renders nothing when already standalone", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<InstallHint />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Implement**

`web/src/components/InstallHint.tsx`:
```tsx
import { useEffect, useState } from "react";
const isStandalone = () => (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone === true;
const isIosSafari = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
export function InstallHint() {
  const [prompt, setPrompt] = useState<any>(null);
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setPrompt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  if (isStandalone()) return null;
  if (isIosSafari()) return <div className="card"><div className="title">Install Wallet</div><div className="sub">Tap Share <span aria-hidden>⎋</span>, then <b>Add to Home Screen</b>. It opens full-screen and works offline.</div></div>;
  if (prompt) return <div className="card"><div className="title">Install Wallet</div><button className="btn" onClick={() => void prompt.prompt()}>Install</button></div>;
  return null;
}
```

`web/src/screens/Settings.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { authClient, useSession } from "../api/auth";
import { APP_VERSION } from "../api/client";
import { listDevices, type DeviceWire } from "../api/devices";
import { db } from "../db/schema";
import { clearAllLocal } from "../db/meta";
import { useSpaceId } from "../hooks/useSpace";
import { useSpaces, useSyncStatus } from "../app/SpaceGate";
import { SectionCard } from "../components/SectionCard";
import { InstallHint } from "../components/InstallHint";
import { timeAgo } from "../logic/dates";

export function Settings() {
  const { data } = useSession(); const nav = useNavigate(); const spaceId = useSpaceId(); const spaces = useSpaces(); const { syncing, syncNow, lastError } = useSyncStatus();
  const [devices, setDevices] = useState<DeviceWire[]>([]);
  const lastSync = useLiveQuery(() => (spaceId ? db.meta.get(`lastSync:${spaceId}`) : Promise.resolve(undefined)), [spaceId]);
  useEffect(() => { void listDevices().then(setDevices).catch(() => {}); }, []);
  const space = spaces.find((s) => s.id === spaceId);
  async function signOut() { await authClient.signOut(); await clearAllLocal(); nav("/sign-in", { replace: true }); }
  return (
    <>
      <div className="hero"><div className="dim">{data?.user.email}</div><div className="big">{data?.user.name ?? "You"}</div><div className="dim">Space: {space?.name ?? "—"} ({space?.kind ?? ""})</div></div>
      <InstallHint />
      <SectionCard title="Manage">
        <Link className="row" to="/categories"><div className="grow title">Categories</div>›</Link>
        <Link className="row" to="/budgets"><div className="grow title">Budgets</div>›</Link>
        <Link className="row" to="/privacy"><div className="grow title">Privacy</div>›</Link>
      </SectionCard>
      <SectionCard title="Sync" action={<button className="btn secondary" style={{ width: "auto", padding: "6px 12px" }} disabled={syncing} onClick={() => void syncNow()}>{syncing ? "Syncing…" : "Sync now"}</button>}>
        <div className="sub">{lastError ?? (lastSync?.value ? `Last synced ${timeAgo(lastSync.value)}` : "Not synced yet")}</div>
      </SectionCard>
      <SectionCard title="Devices">{devices.map((d) => <div key={d.id} className="row"><div className="grow"><div className="title">{d.name}</div><div className="sub">{d.platform} · v{d.app_version} · seen {timeAgo(d.last_seen_at)}</div></div></div>)}</SectionCard>
      <SectionCard title="About"><div className="sub">Wallet web v{APP_VERSION}</div><button className="btn danger" style={{ marginTop: 12 }} onClick={() => void signOut()}>Sign out</button></SectionCard>
    </>
  );
}
```

`web/src/screens/Privacy.tsx`:
```tsx
export function Privacy() {
  return (
    <div className="shell-main">
      <div className="hero"><div className="dim">Wallet</div><div className="big">Privacy</div></div>
      <div className="card">
        <h3>What Wallet stores</h3>
        <p>For each transaction: the amount, fee, the counterparty name or till as it appears in your M-PESA or Airtel message, the receipt code, the date, your account balance after the transaction if the message included it, and the category and note you add. It also stores your categories, budgets, auto-tag rules, your email and name, and a list of the devices you have signed in from.</p>
        <h3>What it does not store</h3>
        <p>The text of your SMS messages never leaves your phone. Wallet does not store your phone number, contacts, or location.</p>
        <h3>Who can see it</h3>
        <p>You, and anyone you invite into a shared space. The person running the service can access the database for maintenance and backups and does not look at individual transactions.</p>
        <h3>How long it is kept</h3>
        <p>Until you delete a transaction, or delete your account. Encrypted backups are kept for 30 days, monthly copies for 6 months.</p>
        <h3>Contact</h3>
        <p>Questions or deletion requests: message the person who invited you, or email the address on the sign-in page.</p>
      </div>
    </div>
  );
}
```
Routes: `settings` replaces its placeholder; add public `<Route path="/privacy" element={<Privacy />} />` outside `RequireAuth`.

- [ ] **Step 3: Run, commit**

```bash
cd web && npx vitest run && npm run typecheck
git add web && git commit -m "feat(web): settings with devices, sync status, install hint, sign-out; privacy page

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
```

### Task 13: Playwright e2e, CI `web-test`, image bundles the web app, staging deploy, parity check

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/auth.spec.ts`, `web/e2e/inbox.spec.ts`, `web/e2e/stats.spec.ts`, `web/e2e/offline.spec.ts`, `web/e2e/helpers.ts`
- Modify: `server/Dockerfile` (build `web/`, copy dist to `/app/public`), `deploy/compose.yml` (build context `..`, `dockerfile: server/Dockerfile`), `.github/workflows/ci.yml` (`web-test` job; `server-test`'s Docker build runs from the repo root), `server/.dockerignore` → move to repo-root `.dockerignore`, `docs/superpowers/PROGRESS.md`

**Interfaces / rules:** e2e runs against the REAL single-origin shape: the server (built, `STATIC_DIR=../web/dist`, test Postgres on 5434, `MIN_CLIENT_WEB=0.0.0`) serves both the app and the API on `http://127.0.0.1:8089`; Playwright's `webServer` builds `web/dist` then starts the server. Each spec signs up a fresh email. Specs: (auth) sign up → inbox; reload keeps session; sign out → sign-in page. (inbox) add a manual transaction → appears under "Needs a category"; open it, pick a category, save → moves to "Recent"; a second browser context signed in as the same user sees it after "Sync now" (proves server round-trip). (stats) after adding two transactions in the current month, Stats shows "Where it went" with the category and the total; set a budget → progress label appears. (offline) with `context.setOffline(true)`, add a transaction (shows "Offline" badge), go online, "Sync now" → the badge says "Synced" and a fresh context sees the row.

- [ ] **Step 1: Playwright config and helpers**

`web/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";
const PORT = 8089;
export default defineConfig({
  testDir: "e2e", timeout: 60_000, retries: process.env.CI ? 1 : 0, workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", ...devices["iPhone 13"] },
  webServer: {
    command: `npm run build && cd ../server && npm run build && PORT=${PORT} STATIC_DIR=../web/dist DATABASE_URL=${process.env.DATABASE_URL_TEST ?? "postgres://wallet:wallet@127.0.0.1:5434/wallet"} BETTER_AUTH_SECRET=0123456789abcdef0123456789abcdef BETTER_AUTH_URL=http://127.0.0.1:${PORT} TRUSTED_ORIGINS=http://127.0.0.1:${PORT} MIN_CLIENT_WEB=0.0.0 NODE_ENV=production node dist/index.js`,
    url: `http://127.0.0.1:${PORT}/health`, reuseExistingServer: !process.env.CI, timeout: 180_000,
  },
});
```

`web/e2e/helpers.ts`:
```ts
import { expect, type Page } from "@playwright/test";
export const fresh = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
export async function signUp(page: Page, email = fresh(), password = "correct-horse-battery") {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E"); await page.getByLabel("Email").fill(email); await page.getByLabel(/Password/).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Recent")).toBeVisible();
  return { email, password };
}
export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in"); await page.getByLabel("Email").fill(email); await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click(); await expect(page.getByText("Recent")).toBeVisible();
}
export async function addTx(page: Page, amount: string, counterparty: string) {
  await page.goto("/add"); await page.getByLabel("Amount (Ksh)").fill(amount); await page.getByLabel("Counterparty").fill(counterparty);
  await page.getByRole("button", { name: "Save" }).click(); await expect(page.getByText(counterparty)).toBeVisible();
}
```

`web/e2e/auth.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { signUp, signIn } from "./helpers";
test("sign up, reload keeps session, sign out", async ({ page }) => {
  const { email, password } = await signUp(page);
  await page.reload(); await expect(page.getByText("Recent")).toBeVisible();
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/sign-in/);
  await signIn(page, email, password);
});
```

`web/e2e/inbox.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { addTx, signIn, signUp } from "./helpers";
test("add, tag, and see it from a second device", async ({ page, browser }) => {
  const { email, password } = await signUp(page);
  await addTx(page, "1,500", "Naivas");
  await expect(page.getByText("Needs a category")).toBeVisible();
  await page.getByText("Naivas").click();
  await page.getByRole("option", { name: /food/ }).click(); await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Needs a category")).toHaveCount(0);
  await page.getByText("Synced").waitFor({ timeout: 15_000 });
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await signIn(p2, email, password);
  await expect(p2.getByText("Naivas")).toBeVisible({ timeout: 15_000 });
  await ctx2.close();
});
```

`web/e2e/stats.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { addTx, signUp } from "./helpers";
test("stats shows category totals and budget progress", async ({ page }) => {
  await signUp(page);
  await addTx(page, "1000", "Java"); await page.getByText("Java").click(); await page.getByRole("option", { name: /food/ }).click(); await page.getByRole("button", { name: "Save" }).click();
  await page.goto("/budgets"); const input = page.getByPlaceholder("No limit").first(); await input.fill("5000"); await input.press("Enter");
  await page.goto("/stats"); await expect(page.getByText("Where it went")).toBeVisible();
  await expect(page.getByText(/of Ksh 5,000/)).toBeVisible();
});
```

`web/e2e/offline.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { addTx, signIn, signUp } from "./helpers";
test("edits made offline sync when back online", async ({ page, context, browser }) => {
  const { email, password } = await signUp(page);
  await context.setOffline(true);
  await addTx(page, "250", "Boda"); await expect(page.getByText("Offline")).toBeVisible();
  await context.setOffline(false);
  await page.getByText(/Offline|Synced|Syncing/).click(); await page.getByText("Synced").waitFor({ timeout: 15_000 });
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); await signIn(p2, email, password);
  await expect(p2.getByText("Boda")).toBeVisible({ timeout: 15_000 }); await ctx2.close();
});
```
Run locally: `cd web && npx playwright install chromium && npm run test:e2e` (test Postgres up). All four must pass. Add `web/test-results`, `web/playwright-report` to `.gitignore`.

- [ ] **Step 2: Image bundles the web app (ruling R-1B-2)**

Move `server/.dockerignore` to repo-root `.dockerignore`:
```
**/node_modules
**/dist
**/.env*
server/compose.test.yml
android
financial-tracker
.git
.superpowers
```
`server/Dockerfile` becomes:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/drizzle.config.ts ./
COPY server/src ./src
COPY server/drizzle ./drizzle
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production STATIC_DIR=/app/public PORT=8080
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY --from=web /web/dist ./public
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 8080
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```
`deploy/compose.yml`: `api.build.context: ..` and `dockerfile: server/Dockerfile`. CI `server-test` Docker step: `run: docker build -f server/Dockerfile -t wallet-api:ci .` with `working-directory: .` (override the job default). Local check: `docker build -f server/Dockerfile -t wallet-api:local . && docker run --rm --network host -e DATABASE_URL=postgres://wallet:wallet@127.0.0.1:5434/wallet -e BETTER_AUTH_SECRET=$(openssl rand -hex 32) -e BETTER_AUTH_URL=http://localhost:8099 -e PORT=8099 wallet-api:local` then `curl -s http://127.0.0.1:8099/ | grep -c '<div id="root">'` → 1.

- [ ] **Step 3: CI `web-test` job** (add to `.github/workflows/ci.yml`; required check added after the first green run)

```yaml
  web-test:
    name: web-test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: wallet, POSTGRES_PASSWORD: wallet, POSTGRES_DB: wallet }
        ports: ["5434:5432"]
        options: >-
          --health-cmd "pg_isready -U wallet" --health-interval 5s --health-timeout 5s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: "web/package-lock.json" }
      - run: npm ci
        working-directory: web
      - run: npm ci
        working-directory: server
      - run: npm run typecheck && npm test
        working-directory: web
      - run: npx playwright install --with-deps chromium
        working-directory: web
      - run: npm run test:e2e
        working-directory: web
        env: { CI: "1", DATABASE_URL_TEST: "postgres://wallet:wallet@127.0.0.1:5434/wallet" }
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: web/playwright-report }
```

- [ ] **Step 4: Deploy to staging and record parity**

On the VPS: `git fetch && git checkout feat/web-1b && git pull`, then `cd deploy && docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml up -d --build`; `curl -s https://wallet-staging.samtama.lol/ | grep -c 'id="root"'` → 1; `curl -s https://wallet-staging.samtama.lol/manifest.webmanifest | head -c 200`; sign up in a real browser on staging; run Lighthouse (Chrome DevTools, mobile) → record the PWA "installable" result and performance score in PROGRESS.md D1B.1/D1B.6. Parity check (D1B.6): on staging, create the same three transactions the Android app holds for the current month (or, if the user's phone is available, compare the month totals shown by Android against the web Stats for the same rows) and record both numbers.

- [ ] **Step 5: Update PROGRESS.md Stage 1B (D1B.1–D1B.7 with results, commands, counts), commit, push, PR**

```bash
git add -A && git commit -m "feat(web): e2e suite, web-test CI job, image bundles the PWA, staging serves the app

Claude-Session: https://claude.ai/code/session_011Jr8smMtFyrBsCPjETsgxt"
git push -u origin feat/web-1b
gh pr create --base v2 --title "Phase 1B: web PWA (inbox, tag, stats, review, categories, budgets, settings)" --fill
```

---

## Self-review against the spec

- §9 screens: 1 sign in/up (T3), 2 inbox (T7), 3 add (T8), 4 stats + review (T9, T10), 5 categories (T11), 6 budgets (T11), 7 settings/devices/privacy/install hint (T12); 8 space switcher and 9 rules UI are Phase 3 / Phase 2 by spec — rules are only *applied* here (T8), not managed. Amount masking hidden-by-default, not persisted (T2). Offline-first via Dexie + Workbox (T1, T4, T5). Responsive rail ≥900px (T2).
- §7 / §7.5 client obligations: push chunks ≤1000 categories-first, pull from the stored cursor after each chunk, adopt server ids, `X-Client` on every call, 426 screen — all in T3/T5 with tests.
- §11.2 endpoints used: `/api/auth/*`, `/api/v2/spaces`, `/api/v2/spaces/:id/sync` GET/POST, `/api/v2/me/devices` GET/POST. `/stats` server endpoint (spec D1B row) is deliberately NOT called: stats are computed locally (ruling R-1B-1); the server endpoint stays deferred to the digest feature.
- Spec §18 D1B acceptance: D1B.1 Lighthouse installable + iOS Add to Home Screen (T13 step 4; the iPhone check needs a device — recorded as manual); D1B.2 e2e sign up/in/out (T13 auth.spec); D1B.3 offline edit then reconnect (offline.spec); D1B.4 inbox/tag/add/delete (inbox.spec + T7 unit); D1B.5 categories/budgets (T11 unit + stats.spec budget); D1B.6 parity (T13 step 4); D1B.7 settings/privacy (T12).
- Placeholder scan: none. Type consistency: `LocalTx`/`LocalCategory`/`LocalBudget`/`LocalRule` (T4) used by T5–T11; `useSpaceId` (T4), `useCategories` (T7), `useSpaceData` (T9), `useSyncStatus`/`useSpaces` (T7) match their consumers; `requestSync` (T5) used by T7, T8, T11; `Bar` props (T9) used by T11 with empty emoji/label (allowed); `ReviewTab` stub (T9) replaced in T10 with the same props.
- Known deferrals for the 1B follow-up list: no CSP header on the PWA vhost yet (nginx), no `npm audit` in CI, no rules management UI (Phase 2), no space switcher (Phase 3), server `/stats` endpoint unused.
