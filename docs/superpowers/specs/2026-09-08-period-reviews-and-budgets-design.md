# Period reviews, category budgets, and calendar heatmap — design

Status: approved by user, ready for implementation planning.
Date: 2026-09-08

## Goal

The existing Stats screen (`android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`)
shows one period (week/month/year) at a time, stepped with chevrons. This
spec extends it — and the Discord bot, which shares the same data — so the
user can:

- Jump straight to any month, ISO week ("week 37"), or year, not just step
  one at a time, with correct empty states when a period has no data.
- See the same period breakdown from Discord via `!week`/`!month` commands,
  matching what `!summary` already does but scoped to a period and mirroring
  the app's sections.
- See trend-based insights that a single-period view structurally can't show
  (trajectory over time, category movers, pace, a spend calendar).
- Set per-category monthly budgets and get a near-limit notification, with
  category bars reflecting budget progress instead of just share-of-spend.

## Non-goals (explicit backlog, not built now)

- A narrative digest paragraph, and a scheduled Discord auto-post of it.
- Recurring-payment / subscription detection.
- Server-side or Discord-shared budgets (budgets are Android-local only).
- Discord-visible heatmap or budget lines.
- Weekly budgets (monthly cadence only).

## Architecture overview

Two independent surfaces read the same data, so this is two parallel but
separate implementations, not a shared library:

- **Android**: local Room DB (`AppDb`, `TransactionDao`) already has
  `totals()` and `categoryTotals()` scoped by a `[from, to)` millis range.
  Every new Android feature below is built by calling these (plus a couple
  of new narrow queries) across different ranges — no new complex SQL.
- **Go backend**: `internal/storage.Database` wraps the same SQLite schema
  (minus Android-only fields like `status`) via GORM. The Discord bot and
  the ingest API share one `*storage.Database`, so a new `internal/storage/reports.go`
  gives the bot the same kind of range-scoped queries GORM-side.

Budgets are Android-only (Room table, no API/Discord surface) — the one
piece of writable config this feature introduces.

---

## Part 1 — Android: Stats screen, "Period" tab (existing view, enhanced)

File: `StatsScreen.kt`. The existing `Period` enum, `range()`, `label()`,
`step()` functions are reused; extended as follows.

### 1a. ISO week labeling

`label(Period.WEEK, ref)` changes from `"Week of 8 Sep"` to
`"Week 37 · Sep 8–14"`, computed via
`ref.get(java.time.temporal.WeekFields.ISO.weekOfWeekBasedYear())`. When
`ref`'s week is the current calendar week, append `" (so far)"`.

### 1b. Jump-to list

Tapping the period label in the `Canopy` header opens a `ModalBottomSheet`
listing periods for the currently selected `Period` type, newest first,
each row just the label (reusing `label()`); tapping a row sets `ref` and
dismisses the sheet. Chevron stepping stays as-is for quick single steps.

The list is bounded, not infinite: a new DAO query

```kotlin
@Query("SELECT MIN(date_time) FROM transactions WHERE status != '${Status.PARSE_FAILED}'")
suspend fun earliestTransactionDate(): Long?
```

gives the floor. The list runs from the period containing that date up to
the current period. If `earliestTransactionDate()` is null (empty DB), the
sheet shows just the current period.

### 1c. Comparison line vs. previous period

Under the net figure in the `Canopy` header, a small line:
`"↑8% vs last week"` / `"↓3% vs last month"`, colored via
`palette.onHeroOut`/`onHeroIn`-style tokens (red for more spend, green for
less). Computed from a second `dao.totals()` call over
`range(period, step(period, ref, -1), zone)`. Comparison is on `moneyOut`
(spend), not net — `"more/less"` framing about spend is what "vs last
week" naturally means. If the previous period's `moneyOut` is `0`, show
`"new"` instead of a percentage (avoid divide-by-zero).

### 1d. Budget-progress category bars

In the existing "Where it went" section, `CategoryBarRow` currently draws
`fraction = category total / total spend`. When a budget exists for that
category (see Part 3) **and** `period == Period.MONTH`, the bar switches to
budget-progress mode instead:

- `fraction = min(spent / budget, 1f)`, with the amount label changing to
  `"Ksh 3,200 / 5,000"`.
- Bar color: `palette.moneyIn`-ish green below 80%, amber at 80–99%, red at
  ≥100% (new fixed colors, not category hue, while in this mode — the color
  itself is now carrying budget-status meaning).
- If `spent > budget`, show `"120%"` as a small trailing label past the
  full bar.

Categories without a configured budget, or when `period != MONTH`, keep
today's share-of-spend behavior unchanged.

---

## Part 2 — Android: Stats screen, "Review" tab (new segment, same screen)

A second segmented option next to the existing WEEK/MONTH/YEAR row —
`"Period" | "Review"` — added above it. Selecting "Review" keeps the same
WEEK/MONTH/YEAR + jump-to controls (trend/movers/pace are all relative to
whichever granularity is selected) but swaps the body content for:

### 2a. Trend strip

A row of ~10 small bars, one per period, walking backwards from `ref` via
the existing `step()`. Each bar's value is `moneyOut` for that period
(N sequential `dao.totals()` calls — local SQLite, cheap). Bar height is
relative to the max in the visible window. Tapping a bar jumps `ref` to
that period (reuses the same navigation as chevron stepping).

### 2b. Savings-rate trend

A second, thinner strip paired with 2a, same N periods, plotting
`(moneyIn - moneyOut) / moneyIn` as a percentage per period from the *same*
`totals()` calls already fetched for 2a — no extra queries. Periods where
`moneyIn == 0` render as a gap/dash, not 0% or a crash.

### 2c. Category movers

Two `categoryTotals()` calls — current range and previous range (same
`step()` pattern as 1c) — diffed in Kotlin by category name, sorted by
`abs(percent change)` descending, top 3 shown:
`"Food ↑75% · Ksh 2,000 → 3,500"`. A category present now but absent last
period shows `"new"`; a category present last period but zero now shows
`"↓100%"`. If either period has zero categories entirely, show a small
"not enough history yet" line instead of the list.

### 2d. Pace projection

Only rendered when `ref`'s period is the one currently in progress
(`range(period, ref, zone)` contains `System.currentTimeMillis()`).
`projected = spentSoFar / elapsedFraction`, where `elapsedFraction =
(now - periodStart) / (periodEnd - periodStart)`. Rendered as
`"At this rate, ~Ksh 18,000 by month end"`. Omitted for completed past
periods — there's nothing to project.

### 2e. Spend calendar heatmap

Independent of the WEEK/MONTH/YEAR selector — always the trailing 365
days, GitHub-contributions style (7 rows × ~53 columns, oldest to newest).
New DAO query:

```kotlin
@Query("""SELECT strftime('%Y-%m-%d', date_time / 1000, 'unixepoch', 'localtime') AS name,
                 SUM(amount + cost) AS total FROM transactions
          WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
          GROUP BY name""")
suspend fun dailyTotals(from: Long, to: Long): List<NamedTotal>
```

(Same shape as the existing `topDays`, minus `ORDER BY`/`LIMIT`.) Cell
color intensity is bucketed into quartiles of the fetched values (0 spend =
neutral/empty cell); palette follows the `dataviz` skill's sequential-scale
guidance and the existing light/dark tokens in `Theme.kt`. Tapping a cell
shows that day's total in a small tooltip/snackbar (reuse `showMessage`).

### Review-tab empty state

If every bucket in the trend strip (2a) is zero **and** the heatmap (2e)
has no non-zero days, show the existing `EmptyState` composable, reworded
for Review (e.g. "Nothing to review yet").

---

## Part 3 — Android: category budgets

### 3a. Storage

New Room entity, added to `AppDb`'s `entities` list (bumps `version = 2`,
with a `Migration(1, 2)` that runs
`CREATE TABLE budgets (category TEXT PRIMARY KEY NOT NULL, monthly_limit REAL NOT NULL, last_alert_level INTEGER NOT NULL DEFAULT 0, last_alert_month TEXT)` —
`fallbackToDestructiveMigration` is not used; existing inbox/tagged rows in
`transactions` must survive the upgrade):

```kotlin
@Entity(tableName = "budgets")
data class BudgetEntity(
    @PrimaryKey val category: String,
    val monthlyLimit: Double,
    val lastAlertLevel: Int = 0,   // 0 = none, 1 = 80% fired, 2 = 100% fired
    val lastAlertMonth: String? = null, // "2026-09", to reset lastAlertLevel on month change
)
```

New DAO (or added to `TransactionDao`, whichever the implementer finds
cleaner — likely a separate `BudgetDao` given it's a different entity):
`upsert(budget)`, `all(): Flow<List<BudgetEntity>>`, `get(category): BudgetEntity?`.

### 3b. Settings UI

New `SectionCard("Budgets")` in `SettingsScreen.kt`, one row per category in
`Categories.ALL` minus `income`/`transfer` (budgets only make sense for
spend categories), each an `OutlinedTextField` for the monthly limit
(empty = no budget set), saved on blur/a Save button consistent with the
existing "Server connection" section's pattern.

### 3c. Real-time near-limit alert

Hooked into `TagActivity.kt`'s existing tagging flow, right after
`dao.tag(...)`/`dao.completeManual(...)` succeeds and before `finish()`:

1. Look up the tagged row's category's `BudgetEntity`. If none, or
   `monthlyLimit <= 0`, skip.
2. Compute month-to-date spend for that category (existing
   `categoryTotals()` scoped to the current calendar month, filtered to
   the one category — or a new single-category `Query`, implementer's
   choice).
3. Determine level: `2` if `spend >= monthlyLimit`, `1` if
   `spend >= 0.8 * monthlyLimit`, else `0`. Reset `lastAlertLevel` to `0`
   whenever `lastAlertMonth` doesn't match the current `"yyyy-MM"` (new
   month, clean slate).
4. If `level > lastAlertLevel`, fire a notification via a new
   `Notifier.notifyBudgetAlert(category, spend, limit, level)` method
   (new `CHANNEL_BUDGET` channel, `IMPORTANCE_DEFAULT` — less urgent than
   the existing high-priority transaction channel) and persist the new
   `lastAlertLevel`/`lastAlertMonth` on the `BudgetEntity`.

This runs on the existing `Dispatchers.IO` coroutine already wrapping the
tag call, so no new threading concerns.

---

## Part 4 — Go backend: `internal/storage/reports.go`

New file, mirroring the Kotlin DAO's aggregate queries via GORM, scoped by
`[from, to time.Time)`:

```go
func (d *Database) PeriodTotals(from, to time.Time) (moneyIn, moneyOut float64, err error)
func (d *Database) CategoryTotals(from, to time.Time) ([]NamedTotal, error)
func (d *Database) TopDays(from, to time.Time, limit int) ([]NamedTotal, error)
func (d *Database) BiggestExpenses(from, to time.Time, limit int) ([]Transaction, error)
func (d *Database) TopCounterparties(from, to time.Time, limit int) ([]NamedTotal, error)
```

`NamedTotal{Name string; Total float64}` is a new small type alongside
these. Direction/exclusion filtering mirrors the Android queries
(`direction = 'out'` for spend-side aggregates, `direction = 'in'` for
income). Date-boundary math uses `from`/`to` as given, with **no timezone
conversion** — `mpesa.ParseMPesaMessage` already stores the SMS's Nairobi
wall-clock time via `time.Parse` with no location, so the stored value's
calendar components already represent local time; converting again would
shift the boundary incorrectly.

## Part 5 — Discord bot commands

`internal/discord/bot.go` gains a command dispatch table alongside the
existing `!summary` handling:

- `!week` — current ISO week, Monday through now.
- `!week 37` — ISO week 37 of the current year (`time.Time.ISOWeek()`
  gives the reverse; computing the *forward* Monday-of-week-N needs
  `time.Date(year, 1, 1, ...)` walked to the target ISO week — standard
  Go stdlib pattern, no new dependency).
- `!month` — current calendar month.
- `!month august` / `!month 8` — named or numbered month, current year
  (case-insensitive; accepts full names and 3-letter abbreviations).
- `!lastweek`, `!lastmonth` — shorthand for the previous period.

Each responds with a plain-text message (consistent with the existing
`!summary` style — no embeds) containing: net/in/out for the period, the
comparison line vs. the previous period (same `moneyOut`-based % as 1c,
"new" guard included), a savings-rate line (reusing the already-fetched
`moneyIn`/`moneyOut`), then category totals, top days, biggest expenses,
and top counterparties — using the new `reports.go` queries.

Invalid input (bad month name, week number outside 1–53) replies with a
usage hint, matching the existing `"Invalid category: ... Use: ..."` style
in `handleSummaryCommand`.

---

## Part 6 — README rewrite

Current `README.md` documents only the Discord-bot half circa its original
single-purpose build. Rewrite to cover:

- Both subsystems: Go backend (Discord bot + `internal/api` ingest/read API)
  and the Android capture app (`android/`), matching what
  `docs/superpowers/specs/2026-08-31-sms-finance-tracker-design.md`
  actually shipped.
- Real deploy path — `start_app.sh` → `docker run`, no docker-compose
  (removed in `ba57fa5`).
- Current category list — `food, travel, savings, church, investments,
  income, transfer` (README still lists the original 5).
- Full Discord command reference: `!summary`, `!week[, N]`,
  `!month[, name|number]`, `!lastweek`, `!lastmonth`.
- Health endpoint, API auth (bearer token), and a short note on the
  Android app's own features (Stats/Review, budgets, shoulder-surfing
  guard) so the README reflects the product as a whole, not just the bot.

---

## Testing

- **Kotlin**: unit tests for `label()`'s ISO week formatting, the
  comparison-% math (including the `moneyOut == 0` "new" guard), pace
  projection math, and the budget-alert level transition logic (0→1→2,
  and the month-rollover reset) — following the existing
  `FormatTest.kt`/`StatsDaoTest.kt` style (in-memory Room DB for DAO-level
  tests).
- **Go**: unit tests for the new `reports.go` queries (period boundaries,
  empty-range results) and the Discord command argument parsing (month
  name/number resolution, week-number bounds, invalid input), following
  the existing `db_test.go`/`parser_test.go` style (temp SQLite file).

## Suggested implementation phase order

For the implementation plan: (1) Android DAO additions + Period-tab
enhancements (1a–1d minus budget bars, since budgets don't exist yet) →
(2) Budgets (3a–3c) → (3) go back and wire 1d once budgets exist →
(4) Review tab (2a–2e) → (5) Go `reports.go` + Discord commands →
(6) README rewrite. Each phase should leave the app/bot in a working,
demoable state.
