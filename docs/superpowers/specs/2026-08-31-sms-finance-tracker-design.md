# SMS Finance Tracker — Design

**Date:** 2026-08-31
**Status:** Approved design, pending implementation plan

## 1. Problem

Three previous tracking attempts (M-PESA app categories, spreadsheet, Discord bot)
all failed on the same axis: they depend on human willpower at recording time.
The Discord bot (this repo) requires copy-pasting each SMS plus metadata into a
channel — more steps than the spreadsheet it replaced.

**Goal:** make capture fully passive. The phone intercepts M-PESA / Airtel Money
transaction SMS the moment they arrive, prompts for a category with one tap, and
ships the structured transaction to the existing Go backend. The only human act
left is choosing a category — and even that can be deferred without data loss.

## 2. Decisions (settled with the user)

| Decision | Choice |
|---|---|
| Topology | Phone captures + tags, existing Go backend stores (canonical) |
| Prompt UX | High-priority heads-up notification with category action buttons |
| Read side | Discord `!summary` stays; app additionally gets a Stats screen |
| SMS backfill | Forward-only; no `READ_SMS`, no inbox import |
| History hydration | One-time pull of already-tagged server history on first launch |
| Local storage | Full replica kept on phone (no pruning) so stats work offline |
| Stack | Kotlin + Jetpack Compose, native Android, sideloaded APK |
| Categories (v1) | Hardcoded: food, travel, savings, church, investments, income |

Play Store SMS-permission policy is irrelevant: personal sideloaded APK.

## 3. Architecture

```
M-PESA / AirtelMoney SMS
      │
      ▼
SmsReceiver (manifest-registered BroadcastReceiver, sender-ID filter)
      │
      ▼
TransactionParser (Kotlin port of internal/mpesa/parser.go + new variants)
      │
      ▼
Room DB  — row saved BEFORE any UI, status = UNTAGGED
      │
      ▼
Heads-up notification  [Top-cat] [2nd-cat] [More…]
  category tap → TAGGED in the shade · More…/body tap → TagActivity
      │
      ▼
SyncWorker (WorkManager, network-constrained, exponential backoff)
      │
      ▼
POST /api/transactions  (Bearer token)  →  Go server  →  same SQLite
table the Discord bot writes to → Discord !summary keeps working
```

Properties:

- **Server is canonical; phone Room DB is a write-queue plus full read replica.**
  Row lifecycle on phone: `UNTAGGED → TAGGED → SYNCED` (plus `PARSE_FAILED`).
- **Nothing is silently lost.** Persisted before the notification is shown;
  dismissed/missed prompts sit in the untagged inbox; a once-daily reminder
  fires while the inbox is non-empty.

## 4. Android app

Single module, Kotlin, Jetpack Compose, Room, WorkManager.
Permissions: `RECEIVE_SMS`, `POST_NOTIFICATIONS`, `INTERNET`. minSdk 26.

### 4.1 SmsReceiver
Manifest-registered receiver for `android.provider.Telephony.SMS_RECEIVED`
(fires even when the app process is dead; exempt from implicit-broadcast
limits). Filters on sender ID ∈ {`MPESA`, Airtel Money's exact sender ID —
**to be confirmed from the user's inbox**}. Routing:

- Body matches a transaction pattern → parse → insert row → notify.
- Body is clearly non-transactional (promos from the same sender IDs) →
  ignore. Heuristic: no `Confirmed` token and no amount pattern.
- Looks transactional but parsing fails → insert row with `PARSE_FAILED`
  and the raw body; surfaces in the inbox for manual entry. Never dropped.

### 4.2 TransactionParser
Port of `internal/mpesa/parser.go` regex and normalizations, plus:

- **Money-in variants** ("received from", "You have received…"). Note: the
  current Go parser only matches outgoing (`sent|paid to`) despite the README
  claiming otherwise — the Kotlin parser is the superset and becomes the only
  parser that matters, since the server now ingests structured JSON.
- **Airtel Money formats** — requires real sample messages from the user
  (amounts/names may be redacted; structure must be verbatim).
- Existing Go test cases ported as JVM unit tests; every new variant gets a
  sample-backed test.

Output: txn ID, amount, direction (in/out), counterparty, datetime, balance,
cost, source (mpesa/airtel).

### 4.3 Room schema
```
transactions(
  id            PK autoincrement,
  txn_id        TEXT UNIQUE,
  amount        REAL,
  direction     TEXT,      -- 'in' | 'out'
  source        TEXT,      -- 'mpesa' | 'airtel'
  counterparty  TEXT,
  date_time     INTEGER,   -- epoch millis
  balance       REAL,
  cost          REAL,
  category      TEXT NULL,
  reason        TEXT NULL,
  status        TEXT,      -- UNTAGGED | TAGGED | SYNCED | PARSE_FAILED
  raw_body      TEXT,      -- original SMS, kept for re-parse/debug
  created_at    INTEGER
)
```

### 4.4 Tag notification + TagActivity
Android caps notification actions at 3: show the **2 most-frequently-used
categories** (from local usage counts; defaults food, travel) + **More…**.

- Category button tap → row updated to `TAGGED` (no reason), notification
  cancelled, sync enqueued. Reason stays optional, addable later via inbox.
- More…/body tap → `TagActivity`: one Compose screen — details header
  (amount, direction, counterparty, time, source), category grid, optional
  reason field, Save.

Both directions (in and out) get the same prompt and category list.

### 4.5 Untagged inbox (home screen)
List of `UNTAGGED` and `PARSE_FAILED` rows, newest first, badge count.
Tap → TagActivity. `PARSE_FAILED` rows show the raw SMS and a manual-entry
form (amount, direction, counterparty, category, reason). Daily reminder
notification (WorkManager periodic) while the inbox is non-empty.

### 4.6 Stats screen
Computed locally from Room with SQL aggregations; works offline.

- Period tabs Week / Month / Year with ◀ ▶ navigation.
- Totals bar: money in, money out, net for the period.
- Category table: spend per category, sorted desc, with % share.
- Top spending days in the period.
- Top 5 largest single expenses.
- Top counterparties by total paid.

v1 renders tables/lists only — no charting library.

### 4.7 SyncWorker
- Triggered on every tag + periodic safety-net run.
- Sends `TAGGED` rows via `POST /api/transactions`; on 2xx (including
  duplicate-as-success) marks `SYNCED`. WorkManager provides retries with
  exponential backoff under a network constraint.
- Server 4xx → row stays local, error badge in inbox (duplicates are 200s
  and never reach this path).

### 4.8 First-launch hydration
`GET /api/transactions` once; upsert by `txn_id` as `SYNCED`. Re-runnable
manually from Settings ("Re-sync from server"). Makes Month/Year stats
meaningful from day one using Discord-era history.

### 4.9 Settings
Backend base URL + API token. Nothing else in v1.

## 5. Go backend

### 5.1 Targeted refactor
Extract the HTTP server out of `internal/discord/bot.go` (currently
`http.HandleFunc("/health", …)` + `ListenAndServe(":8080")` on the default
mux) into a new `internal/api` package owning the mux, started from
`cmd/main.go`. `/health` moves there unchanged; Discord bot code otherwise
untouched.

### 5.2 Endpoints
`POST /api/transactions` — auth: `Authorization: Bearer <API_TOKEN>`
(`API_TOKEN` in `.env`).

```json
{
  "transaction_id": "TID60759AQ",
  "amount": 300.0,
  "direction": "out",
  "source": "mpesa",
  "counterparty": "Margaret Njuguna",
  "date_time": "2026-08-31T09:24:00+03:00",
  "balance": 1761.18,
  "cost": 7.0,
  "category": "food",
  "reason": "at home"
}
```

Responses: `201` created · `200` duplicate `transaction_id` (idempotent
retries) · `400` malformed · `401` bad/missing token.

`GET /api/transactions` — same auth; returns all rows as an array of the
same shape (personal scale, no pagination). Used only for hydration.

### 5.3 Schema
Add `Direction` and `Source` columns to `storage.Transaction` via GORM
automigrate. `counterparty` in the API maps to the existing `Recipient`
column (no rename). Existing rows get empty direction/source; the Stats
screen treats missing direction as `out` (all Discord-era rows were
outgoing).

### 5.4 Transport security
Port 8080 is currently plain HTTP. The bearer token and financial data must
not cross the internet unencrypted. Options, chosen at implementation time:

1. **Tailscale** (recommended for a personal setup): phone and server on one
   tailnet; server stays unexposed publicly.
2. Reverse proxy (Caddy/nginx) with Let's Encrypt on the existing host.

## 6. Error handling summary

| Failure | Behavior |
|---|---|
| No network at tag time | Row queued locally; WorkManager retries |
| Server down | Same — retry with backoff, nothing lost |
| Duplicate SMS delivery | Deduped by `txn_id` unique index (phone and server) |
| Unparseable transactional SMS | `PARSE_FAILED` row + raw body, manual entry in inbox |
| Promo SMS from MPESA sender | Ignored (no transaction pattern) |
| Server 400/401 | Row stays local with error badge; not retried blindly |
| Prompt dismissed / missed | Sits in untagged inbox; daily reminder |

## 7. Testing

- **Parser (highest value):** JVM unit tests — port all cases from
  `parser_test.go`, add money-in and Airtel samples.
- **Sync:** unit tests against MockWebServer (2xx, duplicate, 4xx, offline).
- **Receiver → notification:** manual/instrumented on emulator via
  `adb emu sms send MPESA "<body>"`; early test on the user's real phone for
  OEM battery-manager behavior.
- **Backend:** `httptest` coverage for both endpoints (auth, create,
  duplicate, malformed); existing Go tests keep passing.

## 8. Out of scope (v1) / doors left open

- SMS inbox backfill (`READ_SMS` import) — inbox design doesn't preclude it.
- Editing a transaction after it has synced (fix via server/Discord for now).
- Category management UI (edit the hardcoded list in code).
- Charts/graphs on Stats (tables first).
- M-PESA variants with no sample message (Fuliza, withdrawals, paybill
  wording differences) — added as samples arrive; unknown formats fall into
  `PARSE_FAILED`, so they are captured either way.
- Multi-device, multi-user, Play Store distribution.

## 9. Needed from the user before/at implementation

1. Real Airtel Money transaction SMS samples (structure verbatim) + the
   exact sender ID string.
2. Sample money-in M-PESA messages (received, deposit) to lock the regexes.
3. Choice of Tailscale vs reverse-proxy TLS for the server.
4. Android version of the target phone (to sanity-check minSdk).
