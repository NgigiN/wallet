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
| Back up `transaction.db` from the VPS to local disk | todo |
| Record row count and per-direction sums from the VPS copy | done 2026-09-11 (74 rows; out 9027.00; in 2400.00; 2026-08-31 → 2026-09-11) |
| Create backup bucket and `rclone` remote on the VPS (D0.2) | blocked (needs bucket credentials) |
| Generate `age` keypair; user stores private key outside repo | todo |
| Upload the SQLite backup to the bucket | blocked (bucket) |

Verification
- cmd (VPS): `sqlite3 /home/deploy/opt/wallet/data/transaction.db "select count(*), sum(case when direction in ('','out') then amount else 0 end), sum(case when direction='in' then amount else 0 end) from transactions where deleted_at is null;"` → record: ____
- cmd (local): same query on the copied file → check: identical
- cmd (VPS): `rclone ls wallet-backups:` → check: the `.db.age` file is listed with non-zero size

### Stage 0.2 Branching and CI
| Step | Status |
|---|---|
| `v2` branch created | done 2026-09-11 |
| Branch protection on `main` and `v2` (PR required, CI required, no force-push) | todo (user or `gh api`) |
| Remove push-to-main deploy from `.github/workflows/deploy.yml`; make it tag-triggered | todo |
| Add `.github/workflows/ci.yml`: Go tests + Android unit tests on PR | todo |
| Fix `.gitignore` (`migrations/`, `public`, `dist`, `build/` scoped; `docs/` reviewed) | todo |

Verification
- check: open a throwaway PR with a failing Go test → merge button disabled
- cmd: `cd android && ./gradlew testDebugUnitTest` passes in CI → record run URL: ____
- cmd: `git check-ignore -v server/drizzle/0000_x.sql web/public/manifest.json` → check: not ignored

### Stage 0.3 Accounts and approvals
| Step | Status |
|---|---|
| Sentry projects created (server, web, android); DSNs received | blocked (user) |
| Spec reviewed and approved by user | doing |
| Phase 1 implementation plan written (writing-plans skill) | todo |

Verification
- check: `docs/superpowers/plans/2026-09-XX-wallet-v2-phase-1.md` exists and user has read it

---

## Phase 1 — Identity, spaces, Postgres, sync v2 (target 2026-09-18 → 2026-10-09)

### Stage 1A Backend
| Step | Status |
|---|---|
| D1A.1 `server/` scaffold: Hono, Drizzle schema, migrations, BetterAuth (email+password, bearer, organization), personal-space hook | todo |
| D1A.2 Membership middleware, client-version middleware (426), auth rate limit | todo |
| D1A.3 Sync pull/push with merge rules (spec §7) | todo |
| D1A.4 Category seeding on space creation | todo |
| D1A.5 `server/Dockerfile`, `deploy/compose.yml`, backup sidecar, staging overlay; staging up on VPS :8082 | todo |
| Decide: BetterAuth org plugin vs own spaces tables (spec §20) | todo |

Verification
- cmd: `cd server && npm test` → record: N tests, 0 failures
- cmd: `cd server && npm run typecheck` → clean
- check: integration test "member of space A requesting space B → 403" exists and passes
- check: integration test "two users push same receipt code, opposite directions → two rows; same direction → one row" passes
- check: unit tests cover every row of spec §7.2 (create, dedupe-as-edit, immutable reject, LWW newer wins, LWW older unchanged, soft delete, bad_category)
- cmd (VPS): `curl -s http://127.0.0.1:8082/health` → `{"status":"healthy","db":"ok",...}`
- check: a `wallet-*.dump.age` file appears in the bucket the morning after staging goes up → record filename: ____

### Stage 1B Web PWA
| Step | Status |
|---|---|
| D1B.1 Scaffold, theme tokens, manifest/service worker, install hint | todo |
| D1B.2 Auth screens, session, 426 screen | todo |
| D1B.3 Dexie store + sync client | todo |
| D1B.4 Inbox, tag, manual add, delete | todo |
| D1B.5 Categories + budgets screens | todo |
| D1B.6 Stats + Review | todo |
| D1B.7 Settings, devices, privacy page | todo |

Verification
- cmd: `cd web && npm run typecheck && npm run build` → clean
- cmd: `cd web && npm run test` → record: N tests
- cmd: `cd web && npx playwright test` → record: N e2e passed (sign-up, add, tag, stats, offline-edit-reconnect)
- check: Lighthouse "installable" passes on the staging URL → record score: ____
- check: on an iPhone, Share → Add to Home Screen opens standalone with no Safari chrome → record device/iOS version: ____
- check: Stats month totals on web equal Android Stats for the same month on imported data → record month + both numbers: ____

### Stage 1C Import and cutover
| Step | Status |
|---|---|
| D1C.1 Legacy shim (`/api/transactions` with `LEGACY_API_TOKEN`) | todo |
| D1C.2 Import script + fixture SQLite test | todo |
| Import rehearsal on staging with the real dump | todo |
| Cutover per spec §12.3 | todo |
| Delete Go code, Dockerfile, start_app.sh, Discord bot; merge `v2` → `main`; tag `v2.0.0` | todo |
| Revoke Discord bot token | todo |
| D1C.4 Restore drill on first production dump | todo |

Verification
- check: integration test posts the exact JSON `android/.../sync/ApiClient.kt` sends → 201 then 200 on repeat
- cmd: `npm run import -- --db ./fixtures/sample.db --email test@x` → record: read/inserted/updated/skipped counts
- record (staging, real dump): SQLite count ____ vs Postgres count ____; out-sum ____ vs ____; in-sum ____ vs ____ (must be equal)
- cmd (VPS after cutover): `curl -s https://wallet.samtama.lol/health` → new stack version string
- check: Android pull-to-refresh succeeds; a new SMS on the phone appears in web inbox → record time: ____
- check: `docker ps` shows `financial-tracker-bot` stopped, `wallet2-api-1` up
- record: restore drill date ____, dump filename ____, restored count ____ vs prod ____

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
| D4.4 Uptime monitor, Sentry on all surfaces, `npm audit` in CI | blocked (monitor account) |
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
| Backup bucket credentials (R2/B2) + `age` public key | Phase 0 | pending |
| Branch protection enabled on `main`/`v2` (or allow `gh api` to do it) | Phase 0 | pending |
| Android keystore + secrets in GitHub | Phase 1D | pending |
| Sentry DSNs (server, web, android) | Phase 1A | pending |
| VPS sudo session for staging nginx vhost | Phase 1A | pending |
| Resend API key + verified sender | Phase 2 | pending |
| Firebase: service account JSON, `google-services.json`, web config + VAPID key | Phase 3 | pending |
| Uptime monitor account | Phase 4 | pending |

## Changelog

- 2026-09-11: spec drafted, `v2` branch created, tracker created. Awaiting spec review.
- 2026-09-11: VPS survey. `sync.samtama.lol` is already taken (Obsidian CouchDB, port 5984), so the API cannot use it. `wallet.samtama.lol` proxies only the Go container with an API-only CSP. Uptime Kuma already runs at `status.samtama.lol` (Phase 4 monitor need is covered). Host PostgreSQL 16.15 is installed natively on 127.0.0.1:5432. Root disk is plain ext4, no LUKS (spec §15.5 gap confirmed). Live SQLite holds 74 rows dated 2026-08-31 onward; pre-Aug-31 Discord history is not in the file.
