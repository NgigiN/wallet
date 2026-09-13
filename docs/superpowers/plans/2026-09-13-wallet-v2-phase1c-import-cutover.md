# Wallet v2 — Phase 1C Import + Cutover Plan (inline execution)

Executed inline by the controller on 2026-09-13 at the user's request, with one whole-branch review at the end. Spec: `docs/superpowers/specs/2026-09-11-wallet-v2-multi-user-platform-design.md` §12 (and §18 D1C.1–D1C.4). Tracker: `docs/superpowers/PROGRESS.md` Stage 1C.

## Rulings
- R-1C-1: the import reads a JSON export of the SQLite file (`deploy/export-sqlite.py`, Python stdlib) instead of opening SQLite from Node, so no native SQLite driver enters the image. Cost if wrong: one extra step in the runbook.
- R-1C-2: the user creates their production account themselves in the browser after cutover; the import then targets the existing user by email (it still creates a user with a random password only when the email is unknown, per spec). Cost if wrong: none; keeps the password out of the transcript.
- R-1C-3: the production nginx vhost is replaced (the current one has an API-only CSP that blocks the PWA); this is the one sudo step of the cutover. Cost if wrong: the site serves the old CSP until fixed.
- R-1C-4: the Go `test` CI job is removed with the Go code; branch protection contexts become `android-test`, `server-test`, `web-test`.

## Tasks
1. Legacy shim `server/src/routes/legacy.ts`: `POST/GET /api/transactions` with `Authorization: Bearer $LEGACY_API_TOKEN` (constant-time compare); maps the old JSON to a v2 push in `LEGACY_SPACE_ID` as the space owner; category by name (live, case-insensitive; created as `expense` if missing); `201` applied / `200` unchanged / `400` rejected; `GET` returns the old shape. 503 `shim_unconfigured` when env is unset. Tests: exact Android JSON → 201 then 200; category auto-create; bad token 401; GET shape.
2. Importer `server/src/scripts/import-json.ts` (`npm run import -- <file.json> <email>`): ensures user + personal space, seeds categories, maps rows (`source ''→mpesa`, `direction ''→out`, category name→id / unknown→new expense / `uncategorized`→null, cents round-half-up, `id = uuidv5(space:txn:direction)`, `client_updated_at = updated_at`), one Postgres transaction, prints counts and per-direction sums. Test on a fixture built from redacted real rows: parity of count and sums; idempotent re-run.
3. `deploy/export-sqlite.py`, `deploy/env.prod.example`, `deploy/nginx-wallet.conf` (v2 vhost), `.github/workflows/deploy.yml` (tag → compose), delete Go (`cmd/`, `internal/`, `go.mod`, `go.sum`, root `Dockerfile`, `start_app.sh`), drop the Go job from `ci.yml`, `deploy/VPS_SETUP.md` cutover notes.
4. Cutover per spec §12.3 with the ordering in the tracker; restore drill; merge `v2`→`main`; tag `v2.0.0`.
