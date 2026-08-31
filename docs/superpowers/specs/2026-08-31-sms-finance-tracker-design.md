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
| Monitored senders | `MPESA`, `airtelmoney`/`AirtelMoney` — matched case-insensitively (confirmed from the user's inbox; `AIRTEL`/`Airtel`/`REVERSAL` carry only promos/status notices) |
| Target device | CPH2799, Android 16 / API 36 (verified via ADB) — minSdk 26 stands |

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
limits). Filters case-insensitively on sender ID ∈ {`MPESA`,
`airtelmoney`} (Airtel uses both `airtelmoney` and `AirtelMoney`). Routing:

- Body matches a transaction pattern → parse → insert row → notify.
- Body is clearly non-transactional (promos from the same sender IDs) →
  ignore. Heuristic: no `Confirmed` token and no amount pattern.
- Looks transactional but parsing fails → insert row with `PARSE_FAILED`
  and the raw body; surfaces in the inbox for manual entry. Never dropped.

### 4.2 TransactionParser
Port of `internal/mpesa/parser.go` regex and normalizations, extended to the
full variant inventory confirmed from the user's actual inbox (573 M-PESA +
165 Airtel messages surveyed via ADB on 2026-08-31):

**M-PESA outgoing** (direction = out):
- "sent to" (312 msgs) and "paid to" (177 msgs) — the existing Go pattern.
- Agent withdrawal (2 msgs): `<ID> Confirmed.on <date> at <time>Withdraw
  Ksh<amt> from <agent> New M-PESA balance is …` — date *precedes* the verb,
  often with no space before "Withdraw"; has transaction cost.

**M-PESA incoming** (direction = in):
- `<ID> Confirmed.You have received Ksh<amt> from <name> on <date> at
  <time> New M-PESA balance is …` — quirks seen in real data: lowercase
  `confirmed`, no space after `Confirmed.`, optional `in FR via EQT` after
  the name, masked phone (`0711***155`) in the name, `New business balance`
  variant, **no transaction cost**, trailing marketing text.

**Inter-wallet transfer** (direction = transfer, 36 msgs): `<ID> Confirmed,
Ksh<amt> has been moved from your M-PESA account to your Pochi account …`
(and the reverse). Auto-tagged `transfer` with **no prompt** — purpose is
self-evident — synced immediately, and excluded from spend/income totals in
stats. This fixes the inter-wallet miscategorization the blog complained
about.

**Airtel Money outgoing** (direction = out) — two formats, and the *same
transaction can arrive as both* (dedup by txn ID handles it):
- `<ID>. Ksh <amt> paid to <name> account <acc> on DD/MM/YYYY HH:MM. Fee
  Ksh <f>. Bal:Ksh <b>. MPESA ID:<ref>` — 24-hour time, 4-digit year.
- `<ID>. Ksh <amt> sent to <name> <phone> on DD/MM/YY at HH:MM AM/PM. Fee:
  Ksh <f>. Bal: Ksh <b>.` — 12-hour time, 2-digit year, colon spacing
  differs. No `Confirmed` token in either format.

**Airtel Money incoming:** no genuine sample exists in the inbox (all
"received" hits are bonus-wallet promos). Unknown transactional formats fall
into `PARSE_FAILED` and are captured for manual entry; the regex is added
when a real sample arrives.

**Ignorable, from the same sender IDs** (no txn ID + amount + action
pattern): "Transaction failed…" notices, Fuliza registration nags,
Pochi join notices, bonus/cashback promos. Transactional-looking heuristic:
M-PESA — contains `confirmed` (any case); Airtel — starts with an
alphanumeric txn ID followed by `. Ksh`.

Existing Go test cases ported as JVM unit tests; every variant above gets a
sample-backed test using **anonymized** copies of the real messages (raw
samples live outside the repo — it is public and they contain personal
data).

Output: txn ID, amount, direction (in/out/transfer), counterparty, datetime,
balance, cost, source (mpesa/airtel).

### 4.3 Room schema
```
transactions(
  id            PK autoincrement,
  txn_id        TEXT UNIQUE,
  amount        REAL,
  direction     TEXT,      -- 'in' | 'out' | 'transfer'
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

Both in and out get the same prompt and category list. `transfer` rows skip
the prompt entirely (auto-tagged `transfer`, synced immediately).

### 4.5 Untagged inbox (home screen)
List of `UNTAGGED` and `PARSE_FAILED` rows, newest first, badge count.
Tap → TagActivity. `PARSE_FAILED` rows show the raw SMS and a manual-entry
form (amount, direction, counterparty, category, reason). Daily reminder
notification (WorkManager periodic) while the inbox is non-empty.

### 4.6 Stats screen
Computed locally from Room with SQL aggregations; works offline.

- Period tabs Week / Month / Year with ◀ ▶ navigation.
- Totals bar: money in, money out, net for the period (`transfer` rows
  excluded from all totals; transaction costs/fees count as spend).
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

`direction` ∈ `in | out | transfer`; `source` ∈ `mpesa | airtel`.

Responses: `201` created · `200` duplicate `transaction_id` (idempotent
retries) · `400` malformed · `401` bad/missing token.

`GET /api/transactions` — same auth; returns all rows as an array of the
same shape (personal scale, no pagination). Used only for hydration.

### 5.3 Schema
Add `Direction` and `Source` columns to `storage.Transaction` via GORM
automigrate. `counterparty` in the API maps to the existing `Recipient`
column (no rename). Existing rows get empty direction/source; **all
pre-existing rows are treated as direction = `out`** (confirmed by the user:
everything currently in the system is outgoing).

### 5.4 Transport security
Port 8080 is currently plain HTTP. The bearer token and financial data must
not cross the internet unencrypted. **Decision: nginx reverse proxy with
Let's Encrypt on the existing host** (set up as part of implementation);
8080 stops being exposed publicly and only nginx terminates TLS.

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

## 9. Open items — all resolved 2026-08-31

1. ~~Airtel samples + sender ID~~ → gathered via wireless ADB (§4.2);
   senders are `airtelmoney`/`AirtelMoney`. Airtel *money-in* format still
   unseen; handled by the `PARSE_FAILED` safety net until a sample exists.
2. ~~M-PESA money-in samples~~ → gathered (§4.2).
3. ~~TLS approach~~ → nginx + Let's Encrypt (§5.4).
4. ~~Android version~~ → Android 16 / API 36, device CPH2799.

Raw SMS dumps live in the session scratchpad only — never committed (public
repo, personal data). Parser tests use anonymized copies.
