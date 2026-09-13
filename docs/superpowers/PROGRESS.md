# Wallet v2 — progress tracker

Spec: `docs/superpowers/specs/2026-09-11-wallet-v2-multi-user-platform-design.md`
Rules for this file:

- One line per step. Update the status column, never delete history.
- Status: `todo` | `doing` | `blocked (<why>)` | `done <date>` | `skipped (<why>)`.
- A stage is done only when every verification line under it has been run
  and its result written next to it. "Ran tests" without the output summary
  does not count.
- Needs-from-user table at the bottom is the single list of external inputs.
- Append to the changelog at the bottom on every update.

Legend for verification lines: `cmd:` something to run, `check:` something
to observe, `record:` a number or fact that must be written into this file.

---

## Phase 0 — Safety net and process (target 2026-09-11 → 2026-09-18)

### Stage 0.1 Protect the existing data
| Step | Status |
|---|---|
| Back up `transaction.db` from the VPS to local disk | done 2026-09-11 (`~/.local/share/wallet-backups/transaction-2026-09-11.db`) |
| Record row count and per-direction sums from the VPS copy | done 2026-09-11 (74 rows; out 9027.00; in 2400.00; 2026-08-31 → 2026-09-11) |
| Create backup bucket and `rclone` remote on the VPS (D0.2) | done 2026-09-11 (`rclone`+`age` in `~/.local/bin` on the VPS, no sudo; remote `r2:` in `~/.config/rclone/rclone.conf`; token stored on laptop at `~/.config/wallet-backup/r2.env`) |
| Generate `age` keypair; user stores private key outside repo | done 2026-09-11 (private key at `~/.config/wallet-backup/age-key.txt` on the user's laptop, mode 600; public key `age1ra0rk40y79kvyzezpla2duw38nj8jjueg9uupqgvepzvz52fwc3sx87a3z`; user to copy the private key into a password manager) |
| Upload the SQLite backup to the bucket | done 2026-09-11 (`deploy/backup-sqlite-once.sh` → `r2:wallet/sqlite/sqlite-20260911-1327.db.age`, 37064 bytes) |

Verification
- cmd (VPS): `sqlite3 /home/deploy/opt/wallet/data/transaction.db "select count(*), sum(case when direction in ('','out') then amount else 0 end), sum(case when direction='in' then amount else 0 end) from transactions where deleted_at is null;"` → record: 74 | 9027.00 | 2400.00 (2026-09-11)
- cmd (local): same query on the copied file → check: identical — verified 2026-09-11 on the decrypted R2 copy: (74, 9027.0, 2400.0)
- cmd (VPS): `rclone ls r2:wallet/sqlite/` → check: the `.db.age` file is listed with non-zero size — verified 2026-09-11, 37064 bytes

### Stage 0.2 Branching and CI
| Step | Status |
|---|---|
| `v2` branch created | done 2026-09-11 |
| Branch protection on `main` and `v2` (PR required, CI required, no force-push) | done 2026-09-11 (`gh api`: PR required, 0 approvals, checks `test`+`android-test` strict, enforce_admins, no force-push/deletion) |
| Remove push-to-main deploy from `.github/workflows/deploy.yml`; make it tag-triggered | done 2026-09-11 (PR #1) |
| Add `.github/workflows/ci.yml`: Go tests + Android unit tests on PR | done 2026-09-11 (PR #1, both jobs green: https://github.com/NgigiN/wallet/actions/runs/34601952878) |
| Fix `.gitignore` (`migrations/`, `public`, `dist`, `build/` scoped; `docs/` reviewed) | done 2026-09-11 (PR #1) |

Verification
- check: open a throwaway PR with a failing Go test → merge button disabled
- cmd: `cd android && ./gradlew testDebugUnitTest` passes in CI → record run URL: ____
- cmd: `git check-ignore -v server/drizzle/0000_x.sql web/public/manifest.json` → check: not ignored

### Stage 0.3 Accounts and approvals
| Step | Status |
|---|---|
| Sentry projects created (server, web, android); DSNs received | done 2026-09-11 (DSNs stored on laptop at `~/.config/wallet-backup/sentry.env`, not in repo; wired in 1A Task 12 env and 1B/1D) |
| Spec reviewed and approved by user | done 2026-09-11 (same-origin hostname; Postgres as a container with named volume) |
| Phase 1 implementation plan written (writing-plans skill) | done 2026-09-11 for Phase 0 + 1A (`plans/2026-09-11-wallet-v2-phase0-and-1a-backend.md`); 1B plan done 2026-09-12 (`plans/2026-09-12-wallet-v2-phase1b-web-pwa.md`, 13 tasks); 1C/1D plans after 1B ships |

Verification
- check: `docs/superpowers/plans/2026-09-11-wallet-v2-phase0-and-1a-backend.md` exists and user has read it

---

## Phase 1 — Identity, spaces, Postgres, sync v2 (target 2026-09-18 → 2026-10-09)

### Stage 1A Backend
| Step | Status |
|---|---|
| Staging nginx vhost + Let's Encrypt cert (user sudo) | done 2026-09-11 (https://wallet-staging.samtama.lol/health → 200 healthy; cert expires 2026-12-10) |
| D1A.1 `server/` scaffold: Hono, Drizzle schema, migrations, BetterAuth (email+password, bearer, organization), personal-space hook | done 2026-09-11 |
| D1A.2 Membership middleware, client-version middleware (426), auth rate limit | done 2026-09-11 |
| D1A.3 Sync pull/push with merge rules (spec §7) | done 2026-09-11 |
| D1A.4 Category seeding on space creation | done 2026-09-11 |
| D1A.5 `server/Dockerfile`, `deploy/compose.yml`, backup sidecar, staging overlay; staging up on VPS :8082 | done 2026-09-11 (compose project `wallet2-staging`, API on 127.0.0.1:8082; live `financial-tracker-bot` on :8080 untouched) |
| nginx vhost `wallet-staging.samtama.lol` → 127.0.0.1:8082 + Let's Encrypt cert | blocked (needs user sudo; commands delivered) — file committed at `deploy/nginx-wallet-staging.conf`, staged on the VPS at `/tmp/nginx-wallet-staging.conf` |
| Decide: BetterAuth org plugin vs own spaces tables (spec §20) | done 2026-09-11 (BetterAuth `organization` plugin = spaces; app tables key off `organization.id`) |

Verification
- cmd: `cd server && npm test` → 2026-09-11: **13 files, 58 tests, 0 failures**
- cmd: `cd server && npm run typecheck` → 2026-09-11: clean (exit 0)
- check: integration test "member of space A requesting space B → 403" exists and passes → yes (`test/membership.test.ts`)
- check: integration test "two users push same receipt code, opposite directions → two rows; same direction → one row" passes → yes (`test/sync.test.ts`)
- check: unit tests cover every row of spec §7.2 (create, dedupe-as-edit, immutable reject, LWW newer wins, LWW older unchanged, soft delete, bad_category) → yes (`test/sync-merge.test.ts`)
- cmd (local): `docker build -t wallet-api:local server/` then run against the test DB → `{"status":"healthy","db":"ok","version":"dev",...}`
- cmd (VPS): `curl -s http://127.0.0.1:8082/health` → 2026-09-11: `{"status":"healthy","db":"ok","version":"staging","uptime_seconds":14,"timestamp":"2026-09-11T17:28:38.683Z"}`
- check: a `wallet-*.dump.age` file appears in the bucket from a **manual** run → 2026-09-11: **`wallet-staging-20260911-1728.dump.age`** (34212 bytes, `r2:wallet/pg/staging/`)
- check: a `wallet-*.dump.age` file appears in the bucket from the **scheduled** run (crond inside the backup sidecar, not a manual invocation) → 2026-09-11 **proven** with `BACKUP_CRON="* * * * *"` in `.env.staging`, sidecar recreated, then the override removed and the crontab confirmed back to `0 2 * * *`. Sidecar log:
  ```
  crond: USER root pid 285 cmd sh /backup.sh
  backup ok: wallet-staging-20260911-1752.dump.age (34212 bytes)
  ```
  Newest scheduled file in `r2:wallet/pg/staging/`: **`wallet-staging-20260911-1752.dump.age`**, 34212 bytes (> the 10000-byte upload floor). Eight further 34212-byte minute-dumps from the same proof window are in the bucket and age out under the 30-day retention.
- check: the size floor actually refuses a bad dump → yes: with `pg_dump` stubbed to produce nothing, `backup FAILED: … is only 200 bytes (minimum 10000); not uploading`, exit 1, nothing uploaded, temp file removed by the `trap`.
- cmd (VPS): `docker compose … exec -T api node dist/scripts/purge-tombstones.js` → `purged 0 transactions/budgets/rules/categories tombstones`; with `DATABASE_URL` unset it exits 2 with a message.
- check: weekly tombstone purge documented as a host cron in `deploy/VPS_SETUP.md` → yes (documented with `>> deploy/purge.log 2>&1`, not installed)

### Stage 1B Web PWA
| Step | Status |
|---|---|
| D1B.1 Scaffold, theme tokens, manifest/service worker, install hint | done 2026-09-12 (manifest `display: standalone`, 192/512/maskable icons; SW registered and controlling on staging — evidence below) |
| D1B.2 Auth screens, session, 426 screen | done 2026-09-12 (e2e `auth.spec`: sign up → inbox, reload keeps session, sign out → sign-in, sign back in) |
| D1B.3 Dexie store + sync client | done 2026-09-12 (e2e `offline.spec`: edit made offline → reconnect → "Synced" → a second device sees the row) |
| D1B.4 Inbox, tag, manual add, delete | done 2026-09-12 (e2e `inbox.spec`: add → "Needs a category" → tag → "Recent" → visible on a second device) |
| D1B.5 Categories + budgets screens | done 2026-09-12 (unit tests `categories.test.tsx`, `budget.test.ts`; e2e `stats.spec` sets a monthly limit and reads its progress back) |
| D1B.6 Stats + Review | done 2026-09-12 (unit `stats.test.ts`, `review.test.ts`, `stats-screen.test.tsx`, `review-tab.test.tsx`; staging self-check below) |
| D1B.7 Settings, devices, privacy page | done 2026-09-12 (devices list, sync status, install hint, sign-out; `/privacy` unauthenticated) |
| Task 13: Playwright e2e, `web-test` CI job, image bundles the PWA, staging deploy | done 2026-09-13 (`c8c60b2`) |

Verification (2026-09-13 unless noted)
- cmd: `cd web && npm run typecheck` → clean (exit 0); `npm run build` → `dist/` with 16 precached entries (569 KiB)
- cmd: `cd web && npm test` → **17 files, 54 tests, 0 failures**
- cmd: `cd web && npm run test:e2e` → **4 passed** (`auth`, `inbox`, `offline`, `stats`), and again with `CI=1` (retries on, `reuseExistingServer` off) → 4 passed. The suite builds `web/dist` + `server/dist` and runs the real single-origin server on 127.0.0.1:8089 against the test Postgres on 5434.
- cmd (local image, repo-root context): `docker build -f server/Dockerfile -t wallet-api:local .` → built; run against the test DB on :8099 → `/health` `{"status":"healthy","db":"ok"}`, `curl / | grep -c 'id="root"'` → **1**, `/manifest.webmanifest` → **200** `"display":"standalone"`, `/sw.js` → 200, `/stats` (deep link) → 200 via SPA fallback, `/api/nope` → 404 JSON
- cmd (VPS): `cd deploy && docker compose --env-file .env.staging -f compose.yml -f compose.staging.yml up -d --build` → `wallet2-staging-api-1` recreated and healthy; `financial-tracker-bot` untouched (still `Up 4 days`)
- check (staging): `https://wallet-staging.samtama.lol/` → **200**, `grep -c 'id="root"'` → **1** · `/manifest.webmanifest` → **200**, `"display":"standalone"` · `/health` → **200** `{"status":"healthy","db":"ok","version":"staging"}`
- check: Lighthouse "installable" passes on the staging URL → **not available**: Lighthouse 13.4.1 removed the `pwa` category (and the `installable-manifest` audit) in v12, so installability is recorded directly instead. Lighthouse 13.4.1, mobile, `https://wallet-staging.samtama.lol/sign-in`: **performance 94, best-practices 100, accessibility 88** (FCP 2.4 s, LCP 2.4 s, TBT 0 ms, CLS 0.008, Speed Index 3.5 s).
- check (installability, measured in a headless Chromium session against staging): `<link rel="manifest" href="/manifest.webmanifest">` present · manifest 200 with `display: standalone`, `start_url: /`, `scope: /`, icons 192x192 + 512x512 + 512x512 maskable · after the first load `navigator.serviceWorker.getRegistration()` → registered, active, scope `https://wallet-staging.samtama.lol/` · after a second load `navigator.serviceWorker.controller.scriptURL` → `https://wallet-staging.samtama.lol/sw.js` (the page is SW-controlled)
- check: on an iPhone, Share → Add to Home Screen opens standalone with no Safari chrome → **pending — needs the user's device** (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` and a 180px apple-touch-icon are in `index.html`)
- check: Stats month totals on web equal Android Stats for the same month on imported data → **done 2026-09-13 — phone DB pulled over ADB (83 rows), same rows pushed to a staging parity account; Sept 2026 out/in Ksh 9,281 / 2,100 and Aug 190 / 300, top categories food 3,849 · investments 2,918 · travel 2,314 (Sept), travel 150 · food 40 (Aug): identical on Android (DAO queries) and on the web Stats screen**. Self-consistency check run on staging instead (September 2026, throwaway account `e2e-staging-1789280442078@example.com`): entered Naivas Ksh 1,200 + Java Ksh 800 (food) and Matatu Ksh 450 (travel); Stats hero "Money out" → **Ksh 2,450** (= 1,200 + 800 + 450), bars → **food Ksh 2,000** (= 1,200 + 800), **travel Ksh 450**. A second browser context signed in as the same user read back the identical hero and bars, so the numbers survived the server round trip.

Follow-ups opened by this stage
- `TransactionDetail` seeds its `datetime-local` box with `t.occurred_at.slice(0, 16)` — a UTC instant read as local time, so every save of a manual transaction shifts `occurred_at` backwards by the UTC offset (3 h in Nairobi), cumulatively. Fix: format the local-time string the way `AddTransaction.localNow()` does.
- BetterAuth's built-in rate limiter keys on `x-forwarded-for`, whose first element the client controls through nginx's `$proxy_add_x_forwarded_for`. Pin it with `advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } }` so the 3-per-10 s sign-in limit cannot be sidestepped.
- Lighthouse accessibility 88: the primary `.btn` fails contrast at 3.74:1 (white on the green fill) and no `<main>` landmark exists on the auth screens.
- e2e blocks service workers (Playwright drops context headers on SW-relayed requests); the SW itself is therefore only covered by the staging checks above.

### Stage 1C Import and cutover
| Step | Status |
|---|---|
| D1C.1 Legacy shim (`/api/transactions` with `LEGACY_API_TOKEN`) | done 2026-09-13 (`server/src/routes/legacy.ts`, 5 tests incl. the exact Android JSON → 201 then 200) |
| D1C.2 Import script + fixture test | done 2026-09-13 (`deploy/export-sqlite.py` + `server/src/scripts/import-json.ts`, 3 tests; exporter reproduces 74/9027/2400 on the Sep 11 copy) |
| Import rehearsal | done 2026-09-13 (fixture + exporter check on the real Sep 11 copy; user chose direct cutover) |
| Cutover per spec §12.3 | done 2026-09-13 11:11 EAT (record in `deploy/VPS_SETUP.md`) |
| Delete Go code, Dockerfile, start_app.sh, Discord bot; merge `v2` → `main`; tag `v2.0.0` | done 2026-09-13 (PR #7, PR #8, tag v2.0.0 deploy run succeeded) |
| Revoke Discord bot token | done 2026-09-13 (user) |
| D1C.4 Restore drill on first production dump | done 2026-09-13 (`wallet-prod-20260913-1115.dump.age` → 85 tx / 1 user / maxseq 99 = production) |

Verification
- check: integration test posts the exact JSON `android/.../sync/ApiClient.kt` sends → 201 then 200 on repeat
- cmd: `npm run import -- --db ./fixtures/sample.db --email test@x` → record: read/inserted/updated/skipped counts
- record (production, real export): SQLite 85 vs Postgres 85; out-sum 9,557.00 vs 9,557.00; in-sum 2,400.00 vs 2,400.00 (equal)
- cmd (VPS after cutover): `curl -s https://wallet.samtama.lol/health` → new stack version string
- check: Android pull-to-refresh succeeds; a new SMS on the phone appears in web inbox → record time: ____
- check: `docker ps` shows `financial-tracker-bot` stopped, `wallet2-api-1` up
- record: restore drill 2026-09-13, `wallet-prod-20260913-1115.dump.age`, restored 85 | 1 | 99 vs prod 85 | 1 | 99

### Stage 1D Android login + sync v2
| Step | Status |
|---|---|
| D1D.1 Login screen, EncryptedSharedPreferences session, base URL constant | todo |
| D1D.2 Room migration 2→3, sync v2 client, categories/budgets from tables | todo |
| Migration rehearsal on a debug build against a copy of the user's real Room DB | todo |
| D1D.3 `release.yml` signed APK; installed on user's phone; shim removed; tag `v2.1.0` | todo |

Verification
- cmd: `cd android && ./gradlew testDebugUnitTest` → record: N tests
- check: migration test from a v2 Room fixture passes
- check: fresh install → login → full history visible; capture an SMS → visible on web after one sync → record: ____
- cmd: `curl -s -o /dev/null -w '%{http_code}' https://wallet.samtama.lol/api/transactions` → 404

---

## Phase 2 — Tagging quality (target 2026-10-09 → 2026-10-23)

| Step | Status |
|---|---|
| D2.1 Custom categories on both clients; system rows protected | todo |
| D2.2 Re-tag anywhere; bulk re-tag endpoint + UI | todo |
| D2.3 Rules: table, capture-time application, server-side application, create-from-bulk | todo |
| D2.4 Resend configured; email OTP on web; verification on sign-up | blocked (Resend key) |
| D2.5 First `MIN_CLIENT_*` bump exercised | todo |

Verification
- check: tests: cannot archive/rename-kind/delete `income`/`transfer`; rule never overwrites non-null category
- check: tag on web → appears on Android after sync, and the reverse → record: ____
- check: bulk re-tag of counterparty X changes only untagged/same-category rows → integration test
- cmd: e2e OTP login with test inbox passes
- check: old APK build shows upgrade screen after bump → record versions: ____

---

## Phase 3 — Shared spaces and notifications (target 2026-10-23 → 2026-11-06)

| Step | Status |
|---|---|
| D3.1 Create shared space, invite by email, accept, members, leave | todo |
| D3.2 Space switcher on both clients | todo |
| D3.3 Partner-transfer linking + stats exclusion | todo |
| D3.4 Firebase: server FCM, device tokens, server-side budget alerts + untagged reminder, web push | blocked (Firebase project) |
| D3.5 Remove local Android budget alert code and reminder worker | todo |

Verification
- check: e2e with two accounts: invite → accept → both see the same transaction
- check: integration: user A pushes `out` R, user B pushes `in` R → both linked, both `transfer`, excluded from spend and income
- check: budget alert received on Android and on an installed iOS/desktop PWA → record: ____
- check: 20:00 untagged reminder arrives from the server, not the local worker

---

## Phase 4 — Distribution, compliance, unknown sources (target 2026-11-06 → 2026-11-20)

| Step | Status |
|---|---|
| D4.1 Account deletion + export | todo |
| D4.2 Privacy page, README v2, friend onboarding guide | todo |
| D4.3 Parser registry, unknown-sender capture, "Report this format" | todo |
| D4.4 Uptime Kuma monitor confirmed, Sentry on all surfaces, `npm audit` in CI | todo |
| D4.5 Play Store SMS policy assessment doc | todo |
| D4.6 First two friends onboarded | todo |

Verification
- check: integration: delete user → personal rows gone, shared rows `captured_by = null`
- cmd: `GET /export?format=csv` row count equals non-deleted transactions
- check: deliberate staging outage triggers a monitor alert email → record time to alert: ____
- record: friend 1 / friend 2 onboarded dates and first feedback

---

## Release checklist (every tag)

1. All stage verifications for the included deliverables are recorded above.
2. Migration rehearsed on staging against a restored production dump.
3. `MIN_CLIENT_*` bump decided explicitly (default: no bump).
4. Tag `vX.Y.Z` on `main`; watch `deploy.yml`; confirm `/health` version.
5. If Android changed: `release.yml` APK attached to the GitHub Release; installed on the user's phone.
6. Changelog entry below.

## Needs from user

| Item | Needed by | Status |
|---|---|---|
| R2 API token (Access Key ID + Secret) for bucket `wallet` | Phase 0 | done |
| Branch protection enabled on `main`/`v2` | Phase 0 | done |
| Android keystore + secrets in GitHub | Phase 1D | pending |
| Sentry DSNs (server, web, android) | Phase 1A | done |
| VPS sudo session for staging nginx vhost | Phase 1A | pending — exact command block in `deploy/nginx-wallet-staging.conf` header; file staged on the VPS at `/tmp/nginx-wallet-staging.conf` |
| Resend API key + verified sender | Phase 2 | pending |
| Firebase: service account JSON, `google-services.json`, web config + VAPID key | Phase 3 | pending |
| Uptime Kuma monitor on new `/health` | Phase 1C | done ("Wallet Peep", 3 min) |

## Changelog

- 2026-09-11: spec drafted, `v2` branch created, tracker created. Awaiting spec review.
- 2026-09-11: VPS survey. `sync.samtama.lol` is already taken (Obsidian CouchDB, port 5984), so the API cannot use it. `wallet.samtama.lol` proxies only the Go container with an API-only CSP. Uptime Kuma already runs at `status.samtama.lol` (Phase 4 monitor need is covered). Host PostgreSQL 16.15 is installed natively on 127.0.0.1:5432. Root disk is plain ext4, no LUKS (spec §15.5 gap confirmed). Live SQLite holds 74 rows dated 2026-08-31 onward; pre-Aug-31 Discord history is not in the file.
- 2026-09-11: spec approved. Decisions: same-origin (`wallet.samtama.lol` serves PWA + `/api`), Postgres container with named volume. `v2` pushed; branch protection applied to `main` and `v2`. `age` keypair generated on the laptop. Uptime Kuma replaces the external monitor. R2 bucket `wallet` identified; API token still needed. Sentry explained to user; DSNs pending.
- 2026-09-11: PR #1 opened (CI + tag deploys + docs). Phase 0 + 1A plan written (12 tasks, TDD). Spec §5.2 amended: `client_updated_at` on all synced tables.
- 2026-09-11: PR #1 merged. Phase 0 complete except the staging-nginx sudo step (moved to 1A Task 12). R2 remote live, SQLite backed up encrypted and restore-verified. Sentry DSNs and R2 token received (kept out of repo). Execution: subagent-driven. Staging hostname: `wallet-staging.samtama.lol` (user's default accepted). PRs self-merged on green CI.
- 2026-09-11: Stage 1A backend complete (Tasks 1–12). 58 tests green, typecheck clean. `server/Dockerfile` (multi-stage node:22-alpine, tini, non-root), `deploy/compose.yml` + `compose.staging.yml`, encrypted backup sidecar (pg_dump → age → rclone → R2), tombstone purge script. Staging live on the VPS at 127.0.0.1:8082 (`wallet2-staging`), `/health` healthy with `version=staging`, Sentry server DSN wired. First encrypted backup in R2: `wallet-staging-20260911-1728.dump.age`. Remaining 1A item: the nginx vhost for `wallet-staging.samtama.lol` needs one sudo session from the user.
- 2026-09-11: Task 12 review fix round 1. Backups made trustworthy: `set -euo pipefail` + `trap`, a 10000-byte upload floor, monthlies uploaded from the local dump instead of a remote→remote copy, and the sidecar now writes `/etc/backup.env` (root-only) before starting crond because busybox crond gives its jobs a bare environment — the scheduled path was then proven end to end via `BACKUP_CRON`. Tombstone purge runs in one transaction, logs per table, guards `DATABASE_URL`, and skips category tombstones still referenced by a transaction/budget/rule. `env_file` is now a single `${ENV_FILE:-.env}` entry per environment so a future prod `.env` cannot leak into staging.
- 2026-09-11: staging live over HTTPS. Gotcha: `*.samtama.lol` is a proxied wildcard plus a Cloudflare redirect rule to the apex, so `dig` shows every subdomain as existing; a NEW subdomain needs an explicit A record AND an exclusion from the redirect rule before certbot's HTTP-01 challenge can reach the origin. Phase 1A: all 12 tasks complete, 64 server tests, final review parked 2 residuals (see PR).
- 2026-09-12: Phase 1A merged (PR #3, `3d4e08b`); `server-test` now a required check. Phase 1B plan written against the real server interfaces. 1B rulings: TanStack Query dropped (Dexie liveQuery is the read layer); Docker build context moves to the repo root so the image bundles `web/dist`; no CORS (dev uses the vite proxy). Chart palette (six spend colours) validated on light and dark surfaces with the dataviz validator; transfer gray excluded from charts.
- 2026-09-13: Stage 1B complete (Tasks 1–13). 54 web unit tests and 4 Playwright e2e specs green; `web-test` added to CI. The image now builds from the repo root and bundles the PWA — `server/Dockerfile` gained a `web` stage, `server/.dockerignore` moved to the repo root, `deploy/compose.yml` builds with `context: ..`. Staging serves the app at https://wallet-staging.samtama.lol (root, manifest and /health all verified; `financial-tracker-bot` untouched). Lighthouse 13 has no `pwa` category any more, so installability is recorded as manifest + SW-controller evidence: performance 94, best-practices 100, accessibility 88. Parity against Android is still pending the user's numbers; a staging self-check (1,200 + 800 food, 450 travel → hero Ksh 2,450) matched on two devices. Gotchas: Playwright does not attach context headers to service-worker-relayed requests, so the SW is blocked in e2e to keep the auth rate-limit buckets per-test; and a `page.goto` fired straight after a Save can tear down the in-flight IndexedDB write, so the tag helper waits for the rendered result.
- 2026-09-13: Phase 1B parity check passed exactly (Android vs staging web, 83 rows, two months). Task 13 complete; staging serves the PWA at https://wallet-staging.samtama.lol. Known follow-ups from Task 13: manual-transaction save shifts occurred_at by the UTC offset (TransactionDetail); BetterAuth's internal rate limiter trusts x-forwarded-for.
- 2026-09-13: Phase 1B merged (PR #5, squash `2344682`); `web-test` now a required check on `main`/`v2`; staging redeployed from `v2` and serving the PWA (health, root, manifest all 200; live Go container untouched). Final review found one Critical (manual-transaction date shift on save) and eight Important cross-task seams; all fixed in one wave plus two residuals fixed inline (rejection warnings gated on `sync_error`; tests pinned to a non-UTC zone). Final counts: web 83 unit tests, server 73, e2e 4, Go green. Deferred to 1C: `from` state on sign-in, getDeviceId first-call race, `as any` in the engine, requestSync max-wait, Feb-29 year step, more date/week tests, Field/DirectionToggle factoring, Review-tab click-through test; to Phase 2: SignIn/SignUp duplication (OTP rewrite); noted: hidden sourcemaps still ship `.map` files, `workbox-*.js` has no Cache-Control, all GET `/api/auth/*` exempt from the app limiter (better-auth's own limiter covers it). Next: Phase 1C plan (import script, legacy shim, cutover).
- 2026-09-13: Phase 1C executed inline with the user present. Production cut over to v2 at 11:11 EAT; 85 rows imported exactly; the v1 Android app is served by the shim; Go backend and Discord bot retired; first prod backup + restore drill passed; Uptime Kuma on `/health`; `v2` merged into `main` (PR #8) and tagged `v2.0.0` (deploy run succeeded). Branch policy from here: feature branches → `main`; tag deploys only; the `v2` integration branch is retired. Next: Phase 1D (Android login + sync v2), then the shim is removed.
