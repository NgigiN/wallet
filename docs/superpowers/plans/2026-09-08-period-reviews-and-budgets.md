# Period Reviews, Budgets, and Calendar Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user browse any month/ISO-week/year (not just step one at a time), see trend/budget/heatmap insights the single-period Stats screen can't show, and get the same period breakdown from Discord via `!week`/`!month` commands.

**Architecture:** Two independent surfaces reading the same kind of data via two separate implementations — Android's Room DAO gets a few new range-scoped queries reused across the Period tab, a new Review tab, and a new local-only Budgets feature; the Go backend gets a parallel `reports.go` so the Discord bot can answer `!week`/`!month` from the same shared SQLite DB the ingest API already writes to. No new network surface — budgets are Android-local, Discord reads existing transaction data only.

**Tech Stack:** Kotlin/Compose (Material3), Room 2.6.1, Robolectric+JUnit for Android tests; Go, GORM/SQLite, discordgo, stdlib `testing`.

**Spec:** `docs/superpowers/specs/2026-09-08-period-reviews-and-budgets-design.md`

## Global Constraints

- No new Gradle or Go module dependencies — everything is built on Room 2.6.1, Compose Material3 (already `@OptIn(ExperimentalMaterial3Api::class)` in `StatsScreen.kt`), and Go stdlib/GORM already in `go.mod`.
- minSdk 26 / compileSdk 35 (`android/app/build.gradle.kts`) — `java.time` is already used unguarded elsewhere in this module (desugaring is already configured), so new code may use it freely.
- This codebase has no Compose UI test harness — existing tests only cover DAO/Room logic (Robolectric, `@Config(sdk = [34])`), pure formatting logic (plain JUnit, see `FormatTest.kt`), and Go storage/parser logic (temp-file SQLite, see `db_test.go`). Follow that split: pure/DAO logic gets a real test; Compose wiring steps are verified by a successful build only (`./gradlew :app:compileDebugKotlin` or `assembleDebug`), consistent with how this project already verifies UI changes.
- Where a top-level function needs to be unit-testable from a different file in the same module, use `internal` visibility (not `public`) — matches Kotlin's existing `private` top-level style in `StatsScreen.kt` while allowing same-module test access.
- Go SQLite storage: `internal/storage/db.go` already stores `time.Time` via GORM/mattn `gorm.io/driver/sqlite`. Do not use SQL `strftime`/date functions for day-level grouping — group in Go instead (see Task 21) to sidestep any text-format mismatch between rows written by the Discord bot vs. the Android sync API.
- **Never add AI/Claude attribution (co-author lines, "Generated with Claude Code" footers, session links, etc.) to any commit message or PR description in this repo.** This is a standing, permanent instruction from the repo owner.
- Every `git commit` step below is illustrative of *what* to stage and the message's substance — write the actual message on your own words consistent with this repo's existing commit style (`git log --oneline`), not a copy-paste of the plan text.

---

## Task 1: `earliestTransactionDate()` DAO query

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt`

**Interfaces:**
- Produces: `suspend fun TransactionDao.earliestTransactionDate(): Long?`

- [ ] **Step 1: Write the failing test**

Add to `StatsDaoTest.kt`:

```kotlin
    @Test
    fun earliestTransactionDateIgnoresParseFailedRows() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "Shop", ms(20, 9)))
        dao.insert(row("B", 50.0, "out", "food", "Shop", ms(10, 9)))
        dao.insert(
            row("C", 10.0, "out", null, "Shop", ms(1, 9)).copy(status = Status.PARSE_FAILED),
        )
        assertEquals(ms(10, 9), dao.earliestTransactionDate())
    }

    @Test
    fun earliestTransactionDateNullWhenEmpty() = runBlocking {
        assertEquals(null, dao.earliestTransactionDate())
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: FAIL — `earliestTransactionDate` is unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `TransactionDao.kt`, alongside the other aggregate queries:

```kotlin
    @Query("SELECT MIN(date_time) FROM transactions WHERE status != '${Status.PARSE_FAILED}'")
    suspend fun earliestTransactionDate(): Long?
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt \
        android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt
git commit -m "feat(android): add earliestTransactionDate query"
```

---

## Task 2: `PeriodNav.kt` — ISO week label, jump-list bounds

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/PeriodNav.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt:1-76` (remove `Period`/`range`/`label`/`step`, now in `PeriodNav.kt`)
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/PeriodNavTest.kt` (create)

**Interfaces:**
- Produces: `enum class Period { WEEK, MONTH, YEAR }`, `internal fun range(period: Period, ref: LocalDate, zone: ZoneId): Pair<Long, Long>`, `internal fun step(period: Period, ref: LocalDate, dir: Long): LocalDate`, `internal fun label(period: Period, ref: LocalDate, today: LocalDate = LocalDate.now()): String`, `internal fun isCurrentWeek(ref: LocalDate, today: LocalDate = LocalDate.now()): Boolean`, `internal fun periodsInRange(period: Period, earliest: LocalDate, today: LocalDate = LocalDate.now()): List<LocalDate>`

- [ ] **Step 1: Write the failing test**

Create `PeriodNavTest.kt`:

```kotlin
package com.ngigi.wallet.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class PeriodNavTest {

    @Test
    fun weekLabelShowsIsoWeekNumberAndDateRange() {
        // 2026-09-08 is a Tuesday in ISO week 37 (Mon Sep 7 - Sun Sep 13).
        val ref = LocalDate.of(2026, 9, 8)
        assertEquals(
            "Week 37 · Sep 7–13",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 20)),
        )
    }

    @Test
    fun weekLabelMarksTheCurrentWeekAsSoFar() {
        val ref = LocalDate.of(2026, 9, 8)
        assertEquals(
            "Week 37 · Sep 7–13 (so far)",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 8)),
        )
    }

    @Test
    fun weekLabelSpanningTwoMonths() {
        // 2026-08-31 is a Monday, its ISO week runs Aug 31 - Sep 6.
        val ref = LocalDate.of(2026, 8, 31)
        assertEquals(
            "Week 36 · Aug 31–Sep 6",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 20)),
        )
    }

    @Test
    fun monthAndYearLabelsUnchanged() {
        assertEquals("September 2026", label(Period.MONTH, LocalDate.of(2026, 9, 8)))
        assertEquals("2026", label(Period.YEAR, LocalDate.of(2026, 9, 8)))
    }

    @Test
    fun periodsInRangeStopsAtTheEarliestTransactionsMonth() {
        val months = periodsInRange(
            Period.MONTH,
            earliest = LocalDate.of(2026, 7, 15),
            today = LocalDate.of(2026, 9, 8),
        )
        assertEquals(listOf(9, 8, 7), months.map { it.monthValue })
    }

    @Test
    fun periodsInRangeReturnsJustTodayWhenEarliestIsInTheFuture() {
        val months = periodsInRange(
            Period.MONTH,
            earliest = LocalDate.of(2027, 1, 1),
            today = LocalDate.of(2026, 9, 8),
        )
        assertEquals(listOf(LocalDate.of(2026, 9, 8)), months)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.PeriodNavTest"`
Expected: FAIL — `PeriodNav.kt` / its functions don't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `PeriodNav.kt`:

```kotlin
package com.ngigi.wallet.ui

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

enum class Period { WEEK, MONTH, YEAR }

internal fun range(period: Period, ref: LocalDate, zone: ZoneId): Pair<Long, Long> {
    val (start, end) = when (period) {
        Period.WEEK -> ref.with(DayOfWeek.MONDAY).let { it to it.plusDays(7) }
        Period.MONTH -> ref.withDayOfMonth(1).let { it to it.plusMonths(1) }
        Period.YEAR -> ref.withDayOfYear(1).let { it to it.plusYears(1) }
    }
    return start.atStartOfDay(zone).toInstant().toEpochMilli() to
        end.atStartOfDay(zone).toInstant().toEpochMilli() - 1
}

internal fun step(period: Period, ref: LocalDate, dir: Long): LocalDate = when (period) {
    Period.WEEK -> ref.plusWeeks(dir)
    Period.MONTH -> ref.plusMonths(dir)
    Period.YEAR -> ref.plusYears(dir)
}

private val monthDay = DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH)

internal fun isCurrentWeek(ref: LocalDate, today: LocalDate = LocalDate.now()): Boolean =
    ref.get(WeekFields.ISO.weekBasedYear()) == today.get(WeekFields.ISO.weekBasedYear()) &&
        ref.get(WeekFields.ISO.weekOfWeekBasedYear()) == today.get(WeekFields.ISO.weekOfWeekBasedYear())

internal fun label(period: Period, ref: LocalDate, today: LocalDate = LocalDate.now()): String = when (period) {
    Period.WEEK -> {
        val week = ref.get(WeekFields.ISO.weekOfWeekBasedYear())
        val monday = ref.with(DayOfWeek.MONDAY)
        val sunday = monday.plusDays(6)
        val dateRange = if (monday.month == sunday.month) {
            "${monday.format(monthDay)}–${sunday.dayOfMonth}"
        } else {
            "${monday.format(monthDay)}–${sunday.format(monthDay)}"
        }
        val suffix = if (isCurrentWeek(ref, today)) " (so far)" else ""
        "Week $week · $dateRange$suffix"
    }
    Period.MONTH -> ref.format(DateTimeFormatter.ofPattern("MMMM uuuu", Locale.ENGLISH))
    Period.YEAR -> ref.year.toString()
}

/** Newest-first reference dates for [period], from today back to the period containing [earliest]. */
internal fun periodsInRange(period: Period, earliest: LocalDate, today: LocalDate = LocalDate.now()): List<LocalDate> {
    if (earliest.isAfter(today)) return listOf(today)
    val result = mutableListOf<LocalDate>()
    var cursor = today
    while (true) {
        result.add(cursor)
        val boundaryStart = when (period) {
            Period.WEEK -> cursor.with(DayOfWeek.MONDAY)
            Period.MONTH -> cursor.withDayOfMonth(1)
            Period.YEAR -> cursor.withDayOfYear(1)
        }
        if (!boundaryStart.isAfter(earliest)) break
        cursor = step(period, cursor, -1)
    }
    return result
}
```

Then in `StatsScreen.kt`, delete lines 54-76 (the old `enum class Period`, `range()`, `label()`, `step()`) — they now live in `PeriodNav.kt` in the same package, so no import changes are needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.PeriodNavTest" && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.StatsScreenTest"`

Also run the full existing test suite to make sure removing the old code from `StatsScreen.kt` didn't break anything: `./gradlew :app:testDebugUnitTest`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/PeriodNav.kt \
        android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/PeriodNavTest.kt
git commit -m "feat(android): ISO week labels and bounded period list"
```

---

## Task 3: Jump-to bottom sheet wired into the Stats screen

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/PeriodNav.kt` (add `PeriodJumpSheet`)
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`

**Interfaces:**
- Consumes: `Period`, `label()`, `periodsInRange()` from Task 2; `TransactionDao.earliestTransactionDate()` from Task 1.
- Produces: `@Composable fun PeriodJumpSheet(period: Period, periods: List<LocalDate>, onSelect: (LocalDate) -> Unit, onDismiss: () -> Unit)`

- [ ] **Step 1: Add the composable**

Append to `PeriodNav.kt`:

```kotlin
@androidx.compose.material3.ExperimentalMaterial3Api
@androidx.compose.runtime.Composable
fun PeriodJumpSheet(
    period: Period,
    periods: List<LocalDate>,
    onSelect: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onDismiss) {
        androidx.compose.foundation.lazy.LazyColumn(
            androidx.compose.ui.Modifier
                .fillMaxWidth()
                .padding(bottom = androidx.compose.ui.unit.dp(24)),
        ) {
            items(periods) { d ->
                androidx.compose.material3.Text(
                    label(period, d),
                    modifier = androidx.compose.ui.Modifier
                        .fillMaxWidth()
                        .clickable { onSelect(d) }
                        .padding(horizontal = 24.dp, vertical = 14.dp),
                    style = androidx.compose.material3.MaterialTheme.typography.bodyLarge,
                )
            }
        }
    }
}
```

(Fully-qualified names above are illustrative to avoid guessing an import block by hand — when writing the real file, add proper `import` lines instead, following the same import style already used at the top of `StatsScreen.kt`: `ModalBottomSheet`, `LazyColumn`, `items` from `androidx.compose.foundation.lazy.LazyColumn`/`androidx.compose.foundation.lazy.items`, `clickable` from `androidx.compose.foundation.clickable`, `fillMaxWidth`/`padding` already imported patterns, `dp` from `androidx.compose.ui.unit.dp`.)

- [ ] **Step 2: Wire into `StatsScreen.kt`**

In the `StatsScreen` composable, add state and hook up the tap target:

```kotlin
    var showJumpSheet by remember { mutableStateOf(false) }
    var earliest by remember { mutableStateOf<LocalDate?>(null) }
    LaunchedEffect(Unit) {
        earliest = dao.earliestTransactionDate()
            ?.let { java.time.Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() }
    }
```

Change the period-label `Text` inside the `Canopy` `Row` (currently `Text(label(period, ref), ...)`) to be clickable and open the sheet:

```kotlin
                    Text(
                        label(period, ref),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onHeroDim,
                        modifier = Modifier.clickable { showJumpSheet = true },
                    )
```

And, after the existing `Column(Modifier.fillMaxSize())` content, add:

```kotlin
    if (showJumpSheet) {
        PeriodJumpSheet(
            period = period,
            periods = periodsInRange(period, earliest ?: LocalDate.now()),
            onSelect = { ref = it; showJumpSheet = false },
            onDismiss = { showJumpSheet = false },
        )
    }
```

Add the `clickable` import (`androidx.compose.foundation.clickable`) to `StatsScreen.kt`'s import block.

- [ ] **Step 3: Verify it builds**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Manual check**

Run: `cd android && ./gradlew :app:installDebug` and open the app — tap the period label on the Stats screen's header, confirm a bottom sheet lists periods newest-first and tapping one navigates there.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/PeriodNav.kt \
        android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt
git commit -m "feat(android): tap the Stats period label to jump to any period"
```

---

## Task 4: Comparison line vs. previous period

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/StatsScreenLogicTest.kt` (create)

**Interfaces:**
- Produces: `internal fun comparisonPercent(current: Double, previous: Double): String`

- [ ] **Step 1: Write the failing test**

Create `StatsScreenLogicTest.kt`:

```kotlin
package com.ngigi.wallet.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class StatsScreenLogicTest {

    @Test
    fun comparisonPercentShowsUpArrowWhenSpendIncreased() {
        assertEquals("↑8%", comparisonPercent(1080.0, 1000.0))
    }

    @Test
    fun comparisonPercentShowsDownArrowWhenSpendDecreased() {
        assertEquals("↓8%", comparisonPercent(920.0, 1000.0))
    }

    @Test
    fun comparisonPercentIsNewWhenPreviousPeriodHadNoSpend() {
        assertEquals("new", comparisonPercent(500.0, 0.0))
        assertEquals("new", comparisonPercent(0.0, 0.0))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.StatsScreenLogicTest"`
Expected: FAIL — `comparisonPercent` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `StatsScreen.kt` near the other private helpers:

```kotlin
internal fun comparisonPercent(current: Double, previous: Double): String {
    if (previous <= 0.0) return "new"
    val pct = Math.round((current - previous) / previous * 100).toInt()
    val arrow = if (pct >= 0) "↑" else "↓"
    return "$arrow${kotlin.math.abs(pct)}%"
}
```

Then inside the `StatsScreen` composable's `LaunchedEffect(period, ref, refreshTick)`, fetch the previous period's totals and expose them as state:

```kotlin
    var prevTotals by remember { mutableStateOf(Totals(0.0, 0.0)) }
```

```kotlin
        val (prevFrom, prevTo) = range(period, step(period, ref, -1), ZoneId.systemDefault())
        prevTotals = dao.totals(prevFrom, prevTo)
```

(add this line alongside the existing `totals = dao.totals(from, to)` line inside the same `LaunchedEffect`).

Render it under the net figure in the `Canopy` header — after the existing `Text(if (hidden) "net" else ...)` line, add:

```kotlin
                    if (!hidden) {
                        val cmp = comparisonPercent(totals.moneyOut, prevTotals.moneyOut)
                        Text(
                            if (cmp == "new") "new vs last ${period.name.lowercase()}" else "$cmp vs last ${period.name.lowercase()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (cmp.startsWith("↑")) palette.onHeroOut else palette.onHeroIn,
                        )
                    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.StatsScreenLogicTest"`
Expected: PASS

- [ ] **Step 5: Verify the screen still builds and commit**

Run: `cd android && ./gradlew :app:compileDebugKotlin`

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/StatsScreenLogicTest.kt
git commit -m "feat(android): show spend comparison vs previous period"
```

---

## Task 5: Budget data layer — `BudgetEntity`, `BudgetDao`, migration

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/data/BudgetEntity.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/data/BudgetDao.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/data/AppDb.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/BudgetMigrationTest.kt` (create)
- Test: `android/app/src/test/java/com/ngigi/wallet/data/BudgetDaoTest.kt` (create)

**Interfaces:**
- Produces: `data class BudgetEntity(category: String, monthlyLimit: Double, lastAlertLevel: Int = 0, lastAlertMonth: String? = null)`, `interface BudgetDao { fun all(): Flow<List<BudgetEntity>>; suspend fun get(category: String): BudgetEntity?; suspend fun upsert(budget: BudgetEntity) }`, `val MIGRATION_1_2: Migration` in `AppDb`, `AppDb.budgetDao(): BudgetDao`

- [ ] **Step 1: Write the failing tests**

Create `BudgetEntity.kt`:

```kotlin
package com.ngigi.wallet.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "budgets")
data class BudgetEntity(
    @PrimaryKey val category: String,
    @ColumnInfo(name = "monthly_limit") val monthlyLimit: Double,
    @ColumnInfo(name = "last_alert_level") val lastAlertLevel: Int = 0,
    @ColumnInfo(name = "last_alert_month") val lastAlertMonth: String? = null,
)
```

Create `BudgetDao.kt`:

```kotlin
package com.ngigi.wallet.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface BudgetDao {
    @Query("SELECT * FROM budgets")
    fun all(): Flow<List<BudgetEntity>>

    @Query("SELECT * FROM budgets WHERE category = :category")
    suspend fun get(category: String): BudgetEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(budget: BudgetEntity)
}
```

Create `BudgetDaoTest.kt` (this also fails right now since `AppDb` doesn't wire `BudgetDao` in yet):

```kotlin
package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BudgetDaoTest {
    private lateinit var db: AppDb
    private lateinit var budgetDao: BudgetDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        budgetDao = db.budgetDao()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun upsertReplacesExistingBudgetForSameCategory() = runBlocking {
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 5000.0))
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 6000.0, lastAlertLevel = 1, lastAlertMonth = "2026-09"))
        val stored = budgetDao.get("food")
        assertEquals(6000.0, stored?.monthlyLimit)
        assertEquals(1, stored?.lastAlertLevel)
    }

    @Test
    fun getReturnsNullWhenNoBudgetSet() = runBlocking {
        assertEquals(null, budgetDao.get("travel"))
    }

    @Test
    fun allReturnsEveryBudget() = runBlocking {
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 5000.0))
        budgetDao.upsert(BudgetEntity(category = "travel", monthlyLimit = 2000.0))
        assertEquals(2, budgetDao.all().first().size)
    }
}
```

Create `BudgetMigrationTest.kt` — this directly exercises the real `MIGRATION_1_2` object against a hand-built v1 `transactions` table, proving existing rows survive and the new table appears, without needing Room's schema-export/`MigrationTestHelper` machinery (not set up in this project):

```kotlin
package com.ngigi.wallet.data

import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BudgetMigrationTest {

    @Test
    fun migration1To2PreservesTransactionsAndAddsBudgetsTable() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name("budget-migration-test.db")
                .callback(object : SupportSQLiteOpenHelper.Callback(1) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL(
                            """CREATE TABLE transactions (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                txn_id TEXT NOT NULL, amount REAL NOT NULL, direction TEXT NOT NULL,
                                source TEXT NOT NULL, counterparty TEXT NOT NULL, date_time INTEGER NOT NULL,
                                balance REAL, cost REAL NOT NULL, category TEXT, reason TEXT,
                                status TEXT NOT NULL, sync_error TEXT, raw_body TEXT NOT NULL, created_at INTEGER NOT NULL)""",
                        )
                        db.execSQL(
                            """INSERT INTO transactions (id, txn_id, amount, direction, source, counterparty,
                                date_time, balance, cost, category, reason, status, sync_error, raw_body, created_at)
                                VALUES (1, 'T1', 100.0, 'out', 'mpesa', 'Shop', 0, NULL, 0.0, 'food', NULL, 'SYNCED', NULL, '', 0)""",
                        )
                    }
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build(),
        )
        val db = helper.writableDatabase
        AppDb.MIGRATION_1_2.migrate(db)

        val txnCursor = db.query("SELECT txn_id FROM transactions")
        assertTrue(txnCursor.moveToFirst())
        assertEquals("T1", txnCursor.getString(0))
        txnCursor.close()

        val budgetsTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'")
        assertTrue(budgetsTable.moveToFirst())
        budgetsTable.close()
        helper.close()
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.BudgetDaoTest" --tests "com.ngigi.wallet.data.BudgetMigrationTest"`
Expected: FAIL — `AppDb.budgetDao()` and `AppDb.MIGRATION_1_2` don't exist yet.

- [ ] **Step 3: Write minimal implementation**

Replace `AppDb.kt` with:

```kotlin
package com.ngigi.wallet.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [TransactionEntity::class, BudgetEntity::class], version = 2)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): TransactionDao
    abstract fun budgetDao(): BudgetDao

    companion object {
        @Volatile private var instance: AppDb? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS budgets (
                        category TEXT NOT NULL PRIMARY KEY,
                        monthly_limit REAL NOT NULL,
                        last_alert_level INTEGER NOT NULL DEFAULT 0,
                        last_alert_month TEXT)""",
                )
            }
        }

        fun get(context: Context): AppDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDb::class.java, "wallet.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.BudgetDaoTest" --tests "com.ngigi.wallet.data.BudgetMigrationTest"`
Expected: PASS. Also run `./gradlew :app:testDebugUnitTest` in full to confirm nothing else regressed from the `AppDb.kt` rewrite.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/BudgetEntity.kt \
        android/app/src/main/java/com/ngigi/wallet/data/BudgetDao.kt \
        android/app/src/main/java/com/ngigi/wallet/data/AppDb.kt \
        android/app/src/test/java/com/ngigi/wallet/data/BudgetDaoTest.kt \
        android/app/src/test/java/com/ngigi/wallet/data/BudgetMigrationTest.kt
git commit -m "feat(android): add local-only budgets table and v1->v2 migration"
```

---

## Task 6: Month-to-date category spend query

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt`

**Interfaces:**
- Produces: `suspend fun TransactionDao.categorySpend(category: String, from: Long, to: Long): Double`

- [ ] **Step 1: Write the failing test**

Add to `StatsDaoTest.kt`:

```kotlin
    @Test
    fun categorySpendSumsAmountAndCostForOneCategory() = runBlocking {
        dao.insert(row("A", 1000.0, "out", "food", "S1", ms(10, 9), cost = 30.0))
        dao.insert(row("B", 500.0, "out", "food", "S2", ms(11, 9)))
        dao.insert(row("C", 900.0, "out", "travel", "S3", ms(10, 10)))
        assertEquals(1530.0, dao.categorySpend("food", ms(1, 0), ms(30, 23)), 0.001)
    }

    @Test
    fun categorySpendZeroWhenNoMatchingRows() = runBlocking {
        assertEquals(0.0, dao.categorySpend("food", ms(1, 0), ms(30, 23)), 0.001)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: FAIL — `categorySpend` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `TransactionDao.kt`:

```kotlin
    @Query("""SELECT COALESCE(SUM(amount + cost), 0) FROM transactions
              WHERE direction = 'out' AND category = :category
                AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'""")
    suspend fun categorySpend(category: String, from: Long, to: Long): Double
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt \
        android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt
git commit -m "feat(android): add per-category month-to-date spend query"
```

---

## Task 7: Budget alert decision logic

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/data/BudgetAlert.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/BudgetAlertTest.kt` (create)

**Interfaces:**
- Produces: `data class BudgetAlertDecision(val newLevel: Int, val shouldNotify: Boolean)`, `object BudgetAlert { fun evaluate(spend: Double, limit: Double, prevLevel: Int, prevMonth: String?, currentMonth: String): BudgetAlertDecision }`

- [ ] **Step 1: Write the failing test**

Create `BudgetAlertTest.kt`:

```kotlin
package com.ngigi.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BudgetAlertTest {

    @Test
    fun crossing80PercentNotifiesAndRecordsLevel1() {
        val d = BudgetAlert.evaluate(spend = 4500.0, limit = 5000.0, prevLevel = 0, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(1, d.newLevel)
        assertTrue(d.shouldNotify)
    }

    @Test
    fun crossing100PercentAfterAlreadyAt80NotifiesAgainAtLevel2() {
        val d = BudgetAlert.evaluate(spend = 5200.0, limit = 5000.0, prevLevel = 1, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(2, d.newLevel)
        assertTrue(d.shouldNotify)
    }

    @Test
    fun stayingOverLimitDoesNotReNotify() {
        val d = BudgetAlert.evaluate(spend = 5300.0, limit = 5000.0, prevLevel = 2, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(2, d.newLevel)
        assertFalse(d.shouldNotify)
    }

    @Test
    fun newMonthResetsLevelWithoutSpuriousNotify() {
        val d = BudgetAlert.evaluate(spend = 1000.0, limit = 5000.0, prevLevel = 2, prevMonth = "2026-08", currentMonth = "2026-09")
        assertEquals(0, d.newLevel)
        assertFalse(d.shouldNotify)
    }

    @Test
    fun noBudgetSetNeverNotifies() {
        val d = BudgetAlert.evaluate(spend = 1000.0, limit = 0.0, prevLevel = 0, prevMonth = null, currentMonth = "2026-09")
        assertEquals(0, d.newLevel)
        assertFalse(d.shouldNotify)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.BudgetAlertTest"`
Expected: FAIL — `BudgetAlert` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

Create `BudgetAlert.kt`:

```kotlin
package com.ngigi.wallet.data

data class BudgetAlertDecision(val newLevel: Int, val shouldNotify: Boolean)

/** 0 = under 80%, 1 = crossed 80%, 2 = crossed 100%. */
object BudgetAlert {
    fun evaluate(spend: Double, limit: Double, prevLevel: Int, prevMonth: String?, currentMonth: String): BudgetAlertDecision {
        val baseline = if (prevMonth == currentMonth) prevLevel else 0
        val reached = when {
            limit <= 0.0 -> 0
            spend >= limit -> 2
            spend >= 0.8 * limit -> 1
            else -> 0
        }
        val newLevel = maxOf(baseline, reached)
        return BudgetAlertDecision(newLevel = newLevel, shouldNotify = reached > baseline)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.BudgetAlertTest"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/BudgetAlert.kt \
        android/app/src/test/java/com/ngigi/wallet/data/BudgetAlertTest.kt
git commit -m "feat(android): pure budget-alert level decision logic"
```

---

## Task 8: Wire budget alerts into the tagging flow

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/notify/Notifier.kt`
- Modify: `android/app/src/test/java/com/ngigi/wallet/sms/SmsHandlerTest.kt:26-31` (fake `Notifier` must implement the new method)
- Modify: `android/app/src/main/java/com/ngigi/wallet/TagActivity.kt`

**Interfaces:**
- Consumes: `BudgetDao.get()`/`upsert()` (Task 5), `TransactionDao.categorySpend()` (Task 6), `BudgetAlert.evaluate()` (Task 7).
- Produces: `Notifier.notifyBudgetAlert(category: String, spend: Double, limit: Double, level: Int)`

- [ ] **Step 1: Add the interface method and Android implementation**

In `Notifier.kt`, add to the `interface Notifier` block:

```kotlin
    fun notifyBudgetAlert(category: String, spend: Double, limit: Double, level: Int)
```

Add the channel constant and implementation to `AndroidNotifier`:

```kotlin
        const val CHANNEL_BUDGET = "budget_alerts"
```

(in the same `companion object` as `CHANNEL_TX`, and register it in `ensureChannels`:)

```kotlin
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_BUDGET, "Budget alerts", NotificationManager.IMPORTANCE_DEFAULT)
            )
```

Add the method to `AndroidNotifier`:

```kotlin
    override fun notifyBudgetAlert(category: String, spend: Double, limit: Double, level: Int) {
        ensureChannels(context)
        val pct = if (limit > 0) (spend / limit * 100).toInt() else 0
        val title = if (level >= 2) "Over budget: ${category.replaceFirstChar { it.uppercase() }}"
        else "Nearing budget: ${category.replaceFirstChar { it.uppercase() }}"
        val builder = NotificationCompat.Builder(context, CHANNEL_BUDGET)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText("Ksh %,.0f of Ksh %,.0f (%d%%) this month".format(spend, limit, pct))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
        try {
            NotificationManagerCompat.from(context).notify(("budget_" + category).hashCode(), builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted; the budget bar in Stats still shows the state.
        }
    }
```

- [ ] **Step 2: Fix the fake `Notifier` in `SmsHandlerTest.kt`**

In `SmsHandlerTest.kt`, add to the `fakeNotifier` object:

```kotlin
        override fun notifyBudgetAlert(category: String, spend: Double, limit: Double, level: Int) {}
```

- [ ] **Step 3: Verify existing tests still compile and pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sms.SmsHandlerTest"`
Expected: PASS (this step has no new test of its own — it's a compile-fix plus wiring; the check is that nothing broke).

- [ ] **Step 4: Wire the check into `TagActivity.kt`**

In `TagActivity.kt`, the `TagScreen` callback currently does:

```kotlin
                            TagScreen(r) { amount, direction, counterparty, category, reason ->
                                lifecycleScope.launch(Dispatchers.IO) {
                                    if (r.status == Status.PARSE_FAILED) {
                                        dao.completeManual(r.id, amount, direction, counterparty, category, reason)
                                    } else {
                                        dao.tag(r.id, category, reason)
                                    }
                                    Sync.requestSync(applicationContext)
                                    finish()
                                }
                            }
```

Insert the budget check after tagging succeeds and before `Sync.requestSync`:

```kotlin
                                    checkBudgetAlert(applicationContext, dao, category)
```

Add the helper function (top-level, in `TagActivity.kt`) and its imports (`AppDb`, `BudgetAlert`, `AndroidNotifier`, `java.time.LocalDate`, `java.time.ZoneId`, `java.time.format.DateTimeFormatter`):

```kotlin
private suspend fun checkBudgetAlert(context: android.content.Context, dao: com.ngigi.wallet.data.TransactionDao, category: String) {
    val budgetDao = AppDb.get(context).budgetDao()
    val budget = budgetDao.get(category) ?: return
    if (budget.monthlyLimit <= 0) return

    val today = LocalDate.now()
    val zone = ZoneId.systemDefault()
    val monthStart = today.withDayOfMonth(1).atStartOfDay(zone).toInstant().toEpochMilli()
    val monthEnd = today.withDayOfMonth(1).plusMonths(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
    val spend = dao.categorySpend(category, monthStart, monthEnd)
    val currentMonth = today.format(DateTimeFormatter.ofPattern("yyyy-MM"))

    val decision = com.ngigi.wallet.data.BudgetAlert.evaluate(
        spend, budget.monthlyLimit, budget.lastAlertLevel, budget.lastAlertMonth, currentMonth,
    )
    if (decision.newLevel != budget.lastAlertLevel || budget.lastAlertMonth != currentMonth) {
        budgetDao.upsert(budget.copy(lastAlertLevel = decision.newLevel, lastAlertMonth = currentMonth))
    }
    if (decision.shouldNotify) {
        com.ngigi.wallet.notify.AndroidNotifier(context)
            .notifyBudgetAlert(category, spend, budget.monthlyLimit, decision.newLevel)
    }
}
```

- [ ] **Step 5: Verify it builds and commit**

Run: `cd android && ./gradlew :app:compileDebugKotlin`

```bash
git add android/app/src/main/java/com/ngigi/wallet/notify/Notifier.kt \
        android/app/src/test/java/com/ngigi/wallet/sms/SmsHandlerTest.kt \
        android/app/src/main/java/com/ngigi/wallet/TagActivity.kt
git commit -m "feat(android): fire a notification when a category nears/hits budget"
```

---

## Task 9: Budgets section in Settings

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/SettingsScreen.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt` (pass `BudgetDao` into `SettingsScreen`)

**Interfaces:**
- Consumes: `BudgetDao` (Task 5), `Categories.ALL`, `Categories.TRANSFER` (existing).

- [ ] **Step 1: Add the Budgets section to `SettingsScreen.kt`**

Change the signature to accept a `BudgetDao`:

```kotlin
@Composable
fun SettingsScreen(
    prefs: Prefs,
    budgetDao: com.ngigi.wallet.data.BudgetDao,
    showMessage: (String) -> Unit,
    onSaved: () -> Unit,
    onHydrate: () -> Unit,
) {
```

Add state and a new `SectionCard`, right after the `"How it works"` card (before the trailing `Spacer`):

```kotlin
            val budgetCategories = com.ngigi.wallet.data.Categories.ALL
                .filterNot { it == "income" || it == com.ngigi.wallet.data.Categories.TRANSFER }
            val budgets by budgetDao.all().collectAsStateWithLifecycle(initialValue = emptyList())
            val budgetByCategory = budgets.associateBy { it.category }
            val scope = androidx.compose.runtime.rememberCoroutineScope()

            SectionCard("Budgets") {
                Text(
                    "Set a monthly spend limit per category. You'll get a heads-up at 80% and 100%.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                budgetCategories.forEach { category ->
                    var text by remember(category, budgetByCategory[category]?.monthlyLimit) {
                        mutableStateOf(budgetByCategory[category]?.monthlyLimit?.let { "%.0f".format(it) } ?: "")
                    }
                    OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        label = { Text(category.replaceFirstChar { c -> c.uppercase() }) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = MaterialTheme.shapes.small,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        trailingIcon = {
                            IconButton(onClick = {
                                val amount = text.toDoubleOrNull() ?: 0.0
                                scope.launch {
                                    budgetDao.upsert(
                                        com.ngigi.wallet.data.BudgetEntity(
                                            category = category,
                                            monthlyLimit = amount,
                                            lastAlertLevel = budgetByCategory[category]?.lastAlertLevel ?: 0,
                                            lastAlertMonth = budgetByCategory[category]?.lastAlertMonth,
                                        ),
                                    )
                                    showMessage("Saved $category budget.")
                                }
                            }) {
                                Icon(Icons.Rounded.CloudDownload, contentDescription = "Save budget")
                            }
                        },
                    )
                }
            }
```

(The `CloudDownload` icon is reused only as a stand-in "save" glyph already imported in this file — swap for `Icons.Rounded.Check` if preferred; add that import if so.)

- [ ] **Step 2: Update the call site in `MainActivity.kt`**

Change:

```kotlin
                            else -> SettingsScreen(
                                Prefs(this@MainActivity),
                                showMessage = showMessage,
                                onSaved = { Sync.requestSync(this@MainActivity) },
                                onHydrate = { Hydrate.request(this@MainActivity) },
                            )
```

to:

```kotlin
                            else -> SettingsScreen(
                                Prefs(this@MainActivity),
                                budgetDao = dao.let { AppDb.get(this@MainActivity).budgetDao() },
                                showMessage = showMessage,
                                onSaved = { Sync.requestSync(this@MainActivity) },
                                onHydrate = { Hydrate.request(this@MainActivity) },
                            )
```

- [ ] **Step 3: Verify it builds**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Manual check**

Run: `cd android && ./gradlew :app:installDebug`, open Settings, set a budget for "food", confirm it persists after leaving and returning to the screen.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/SettingsScreen.kt \
        android/app/src/main/java/com/ngigi/wallet/MainActivity.kt
git commit -m "feat(android): add per-category budget inputs to Settings"
```

---

## Task 10: Budget-progress category bars

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/StatsScreenLogicTest.kt`

**Interfaces:**
- Produces: `internal data class BudgetBarState(val fraction: Float, val overflowLabel: String?, val level: Int)`, `internal fun budgetBarState(spent: Double, limit: Double): BudgetBarState`

- [ ] **Step 1: Write the failing test**

Add to `StatsScreenLogicTest.kt`:

```kotlin
    @Test
    fun budgetBarStateUnderBudget() {
        val s = budgetBarState(spent = 3200.0, limit = 5000.0)
        assertEquals(0.64f, s.fraction, 0.001f)
        assertEquals(null, s.overflowLabel)
        assertEquals(0, s.level)
    }

    @Test
    fun budgetBarStateNearLimit() {
        val s = budgetBarState(spent = 4200.0, limit = 5000.0)
        assertEquals(1, s.level)
    }

    @Test
    fun budgetBarStateOverBudgetCapsFractionAndShowsOverflow() {
        val s = budgetBarState(spent = 6000.0, limit = 5000.0)
        assertEquals(1f, s.fraction, 0.001f)
        assertEquals("120%", s.overflowLabel)
        assertEquals(2, s.level)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.StatsScreenLogicTest"`
Expected: FAIL — `budgetBarState` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `StatsScreen.kt`:

```kotlin
internal data class BudgetBarState(val fraction: Float, val overflowLabel: String?, val level: Int)

internal fun budgetBarState(spent: Double, limit: Double): BudgetBarState {
    val ratio = spent / limit
    val level = when {
        ratio >= 1.0 -> 2
        ratio >= 0.8 -> 1
        else -> 0
    }
    val overflow = if (ratio > 1.0) "${Math.round(ratio * 100)}%" else null
    return BudgetBarState(fraction = ratio.toFloat().coerceIn(0f, 1f), overflowLabel = overflow, level = level)
}
```

Now wire it into `CategoryBarRow`'s caller. Change the `StatsScreen` composable to fetch budgets and pass them down:

```kotlin
    val budgetDao = remember { com.ngigi.wallet.data.AppDb.get(androidx.compose.ui.platform.LocalContext.current).budgetDao() }
    val budgets by budgetDao.all().collectAsStateWithLifecycle(initialValue = emptyList())
    val budgetByCategory = budgets.associateBy { it.category }
```

In the `"Where it went"` `SectionCard`, change the loop:

```kotlin
                                cats.forEach { c ->
                                    val budget = if (period == Period.MONTH) budgetByCategory[c.name] else null
                                    if (budget != null && budget.monthlyLimit > 0) {
                                        val state = budgetBarState(c.total, budget.monthlyLimit)
                                        val barColor = when (state.level) {
                                            2 -> MaterialTheme.colorScheme.error
                                            1 -> palette.gold
                                            else -> palette.moneyIn
                                        }
                                        CategoryBarRow(
                                            emoji = categoryEmoji(c.name),
                                            name = c.name,
                                            amount = c.total,
                                            fraction = state.fraction,
                                            color = barColor,
                                            budgetLimit = budget.monthlyLimit,
                                            overflowLabel = state.overflowLabel,
                                        )
                                    } else {
                                        CategoryBarRow(
                                            emoji = categoryEmoji(c.name),
                                            name = c.name,
                                            amount = c.total,
                                            fraction = (c.total / totalOut).toFloat(),
                                            color = palette.category(c.name),
                                        )
                                    }
                                }
```

Extend `CategoryBarRow`'s signature and amount label to support the two optional new params:

```kotlin
@Composable
private fun CategoryBarRow(
    emoji: String,
    name: String,
    amount: Double,
    fraction: Float,
    color: Color,
    budgetLimit: Double? = null,
    overflowLabel: String? = null,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, Modifier.width(28.dp))
            Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(
                if (budgetLimit != null) "${Format.kes(amount)} / ${Format.kes(budgetLimit)}" else Format.kes(amount),
                style = MaterialTheme.typography.titleSmall,
            )
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                    .height(8.dp)
                    .background(color, RoundedCornerShape(4.dp)),
            )
        }
        overflowLabel?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes, then verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.StatsScreenLogicTest" && ./gradlew :app:compileDebugKotlin`
Expected: PASS / BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/StatsScreenLogicTest.kt
git commit -m "feat(android): category bars show budget progress when a budget is set"
```

---

## Task 11: Review tab scaffold — Period/Review toggle

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`

**Interfaces:**
- Produces: `@Composable fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit)` (body filled in by Tasks 12-16; this task creates it returning just an empty-state placeholder so the toggle can be wired end-to-end first)

- [ ] **Step 1: Create the scaffold file**

Create `ReviewSection.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import com.ngigi.wallet.data.TransactionDao
import java.time.LocalDate
import java.time.ZoneId

enum class StatsTab { PERIOD, REVIEW }

@Composable
fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // Trend strip, savings rate, category movers, pace projection, and the
        // calendar heatmap are added in Tasks 12-16.
        EmptyState(
            emoji = "📈",
            title = "Nothing to review yet",
            body = "Once you've tagged a few transactions, trends and insights show up here.",
        )
    }
}
```

(Note: `Modifier` needs `import androidx.compose.ui.Modifier` and `dp` needs `import androidx.compose.ui.unit.dp` — add both.)

- [ ] **Step 2: Wire the Period/Review toggle into `StatsScreen.kt`**

Add state and a second segmented row above the existing WEEK/MONTH/YEAR row:

```kotlin
    var tab by remember { mutableStateOf(StatsTab.PERIOD) }
```

Right before the existing `Row(verticalAlignment = Alignment.CenterVertically) { SingleChoiceSegmentedButtonRow(...` block, add:

```kotlin
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    StatsTab.entries.forEachIndexed { i, t ->
                        SegmentedButton(
                            selected = tab == t,
                            onClick = { tab = t },
                            shape = SegmentedButtonDefaults.itemShape(index = i, count = StatsTab.entries.size),
                        ) {
                            Text(if (t == StatsTab.PERIOD) "Period" else "Review")
                        }
                    }
                }
```

Then wrap the existing `when { loading -> ...; empty -> ...; else -> ... }` block (the Period tab's content) so it only renders `if (tab == StatsTab.PERIOD)`, and add the Review branch:

```kotlin
                if (tab == StatsTab.PERIOD) {
                    when {
                        loading -> Box(...) { CircularProgressIndicator() }
                        empty -> EmptyState(...)
                        else -> { /* existing category/day/expense/counterparty sections, unchanged */ }
                    }
                } else {
                    ReviewContent(dao, period, ref, ZoneId.systemDefault(), onRefChange = { ref = it })
                }
```

- [ ] **Step 3: Verify it builds**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Manual check**

Run: `cd android && ./gradlew :app:installDebug`, open Stats, confirm the new "Period"/"Review" toggle appears and switching to Review shows the placeholder empty state.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt \
        android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt
git commit -m "feat(android): add Review tab scaffold next to Period on Stats"
```

---

## Task 12: Trend strip and savings-rate trend

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt` (create)

**Interfaces:**
- Produces: `data class TrendPoint(val label: String, val ref: LocalDate, val moneyOut: Double, val savingsRate: Float?)`, `internal suspend fun trendSeries(dao: TransactionDao, period: Period, ref: LocalDate, count: Int, zone: ZoneId): List<TrendPoint>` (oldest first), `internal fun savingsRate(moneyIn: Double, moneyOut: Double): Float?`

- [ ] **Step 1: Write the failing test**

Create `ReviewLogicTest.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReviewLogicTest {
    private lateinit var db: AppDb
    private lateinit var dao: TransactionDao
    private val zone = ZoneOffset.UTC as ZoneId

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        dao = db.dao()
    }

    @After
    fun tearDown() = db.close()

    private fun at(y: Int, m: Int, d: Int) =
        LocalDateTime.of(y, m, d, 9, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun row(txnId: String, amount: Double, direction: String, category: String?, at: Long) = TransactionEntity(
        txnId = txnId, amount = amount, direction = direction, source = "mpesa",
        counterparty = "X", dateTime = at, balance = null, cost = 0.0,
        category = category, reason = null, status = Status.SYNCED, rawBody = "", createdAt = 0,
    )

    @Test
    fun trendSeriesWalksBackwardsThenReturnsOldestFirst() = runBlocking {
        dao.insert(row("A", 1000.0, "out", "food", at(2026, 9, 10)))
        dao.insert(row("B", 500.0, "out", "food", at(2026, 8, 10)))
        val series = trendSeries(dao, Period.MONTH, LocalDate.of(2026, 9, 10), count = 2, zone = zone)
        assertEquals(listOf(8, 9), series.map { it.ref.monthValue })
        assertEquals(500.0, series[0].moneyOut, 0.001)
        assertEquals(1000.0, series[1].moneyOut, 0.001)
    }

    @Test
    fun savingsRateNullWhenNoIncome() {
        assertEquals(null, savingsRate(moneyIn = 0.0, moneyOut = 500.0))
    }

    @Test
    fun savingsRatePositiveWhenSavingMoney() {
        assertEquals(0.3f, savingsRate(moneyIn = 1000.0, moneyOut = 700.0)!!, 0.001f)
    }

    @Test
    fun savingsRateNegativeWhenOverspending() {
        assertEquals(-0.2f, savingsRate(moneyIn = 1000.0, moneyOut = 1200.0)!!, 0.001f)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest"`
Expected: FAIL — `trendSeries`/`savingsRate`/`TrendPoint` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `ReviewSection.kt`:

```kotlin
data class TrendPoint(val label: String, val ref: LocalDate, val moneyOut: Double, val savingsRate: Float?)

internal fun savingsRate(moneyIn: Double, moneyOut: Double): Float? =
    if (moneyIn <= 0.0) null else ((moneyIn - moneyOut) / moneyIn).toFloat()

internal suspend fun trendSeries(dao: TransactionDao, period: Period, ref: LocalDate, count: Int, zone: ZoneId): List<TrendPoint> {
    val points = mutableListOf<TrendPoint>()
    var cursor = ref
    repeat(count) {
        val (from, to) = range(period, cursor, zone)
        val t = dao.totals(from, to)
        points.add(TrendPoint(label(period, cursor), cursor, t.moneyOut, savingsRate(t.moneyIn, t.moneyOut)))
        cursor = step(period, cursor, -1)
    }
    return points.reversed()
}
```

(Add `import com.ngigi.wallet.data.Totals` if the Kotlin compiler flags it as unused-but-needed — it isn't referenced by name here, so no import is actually required beyond what's already present.)

Add the Compose bars to `ReviewContent`, replacing the placeholder body — fetch the series in a `LaunchedEffect` and render two small bar rows:

```kotlin
@Composable
fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit) {
    var series by remember { mutableStateOf<List<TrendPoint>>(emptyList()) }
    LaunchedEffect(period, ref) { series = trendSeries(dao, period, ref, count = 10, zone = zone) }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (series.all { it.moneyOut == 0.0 }) {
            EmptyState(
                emoji = "📈",
                title = "Nothing to review yet",
                body = "Once you've tagged a few transactions, trends and insights show up here.",
            )
        } else {
            SectionCard("Spend trend") {
                val max = series.maxOf { it.moneyOut }.coerceAtLeast(1.0)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    series.forEach { p ->
                        Column(Modifier.weight(1f).clickable { onRefChange(p.ref) }, horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height((60 * (p.moneyOut / max)).dp.coerceAtLeast(2.dp))
                                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp)),
                            )
                        }
                    }
                }
            }
            SectionCard("Savings rate") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    series.forEach { p ->
                        val rate = p.savingsRate
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(if (rate == null) 2.dp else (40 * kotlin.math.abs(rate)).dp.coerceIn(2.dp, 40.dp))
                                    .background(
                                        if (rate != null && rate < 0) MaterialTheme.colorScheme.error else LocalWalletPalette.current.moneyIn,
                                        RoundedCornerShape(2.dp),
                                    ),
                            )
                        }
                    }
                }
            }
        }
    }
}
```

Add the needed imports to `ReviewSection.kt` (`Row`, `Box`, `Alignment`, `MaterialTheme`, `RoundedCornerShape`, `height`, `background`, `clickable`, `LaunchedEffect`, `mutableStateOf`, `remember`, `getValue`, `setValue`, `LocalWalletPalette`, `dp`) mirroring `StatsScreen.kt`'s existing import block.

- [ ] **Step 4: Run test to verify it passes, then verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest" && ./gradlew :app:compileDebugKotlin`
Expected: PASS / BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt
git commit -m "feat(android): trend strip and savings-rate strip on the Review tab"
```

---

## Task 13: Category movers

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt`

**Interfaces:**
- Consumes: `range()`, `step()` from `PeriodNav.kt`; `TransactionDao.categoryTotals()` (existing).
- Produces: `data class CategoryMover(val category: String, val current: Double, val previous: Double, val percentChange: Int?, val isNew: Boolean)`, `internal suspend fun categoryMovers(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, limit: Int = 3): List<CategoryMover>`

- [ ] **Step 1: Write the failing test**

Add to `ReviewLogicTest.kt`:

```kotlin
    @Test
    fun categoryMoversRanksByAbsolutePercentChange() = runBlocking {
        dao.insert(row("A", 3500.0, "out", "food", at(2026, 9, 10)))
        dao.insert(row("B", 2000.0, "out", "food", at(2026, 8, 10)))
        dao.insert(row("C", 1000.0, "out", "travel", at(2026, 9, 11)))
        dao.insert(row("D", 1000.0, "out", "travel", at(2026, 8, 11)))
        val movers = categoryMovers(dao, Period.MONTH, LocalDate.of(2026, 9, 10), zone)
        assertEquals("food", movers.first().category)
        assertEquals(75, movers.first().percentChange)
        assertEquals(false, movers.first().isNew)
    }

    @Test
    fun categoryMoversFlagsBrandNewCategoryAsNewNotAPercent() = runBlocking {
        dao.insert(row("A", 1000.0, "out", "savings", at(2026, 9, 10)))
        val movers = categoryMovers(dao, Period.MONTH, LocalDate.of(2026, 9, 10), zone)
        val savings = movers.first { it.category == "savings" }
        assertEquals(true, savings.isNew)
        assertEquals(null, savings.percentChange)
    }

    @Test
    fun categoryMoversEmptyWhenNoDataEitherPeriod() = runBlocking {
        assertEquals(emptyList<CategoryMover>(), categoryMovers(dao, Period.MONTH, LocalDate.of(2026, 9, 10), zone))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest"`
Expected: FAIL — `categoryMovers`/`CategoryMover` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `ReviewSection.kt`:

```kotlin
data class CategoryMover(val category: String, val current: Double, val previous: Double, val percentChange: Int?, val isNew: Boolean)

internal suspend fun categoryMovers(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, limit: Int = 3): List<CategoryMover> {
    val (from, to) = range(period, ref, zone)
    val (prevFrom, prevTo) = range(period, step(period, ref, -1), zone)
    val current = dao.categoryTotals(from, to).associate { it.name to it.total }
    val previous = dao.categoryTotals(prevFrom, prevTo).associate { it.name to it.total }
    val categories = current.keys + previous.keys
    return categories.map { cat ->
        val cur = current[cat] ?: 0.0
        val prev = previous[cat] ?: 0.0
        val isNew = prev == 0.0 && cur > 0.0
        val pct = if (prev > 0.0) Math.round((cur - prev) / prev * 100).toInt() else null
        CategoryMover(cat, cur, prev, pct, isNew)
    }.sortedByDescending { it.percentChange?.let { p -> kotlin.math.abs(p) } ?: Int.MAX_VALUE }
        .take(limit)
}
```

Add a `SectionCard("Category movers")` to `ReviewContent`, fetched alongside `series` via another `LaunchedEffect`:

```kotlin
    var movers by remember { mutableStateOf<List<CategoryMover>>(emptyList()) }
    LaunchedEffect(period, ref) { movers = categoryMovers(dao, period, ref, zone) }
```

```kotlin
            if (movers.isNotEmpty()) {
                SectionCard("Category movers") {
                    movers.forEach { m ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(m.category.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                if (m.isNew) "new" else "${if ((m.percentChange ?: 0) >= 0) "↑" else "↓"}${kotlin.math.abs(m.percentChange ?: 0)}%",
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                    }
                }
            }
```

(Place this block inside the existing `else` branch in `ReviewContent`, after the "Savings rate" `SectionCard`.)

- [ ] **Step 4: Run test to verify it passes, then verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest" && ./gradlew :app:compileDebugKotlin`
Expected: PASS / BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt
git commit -m "feat(android): category movers on the Review tab"
```

---

## Task 14: Pace projection

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt`

**Interfaces:**
- Produces: `internal fun paceProjection(spentSoFar: Double, periodStart: Long, periodEnd: Long, now: Long): Double?`

- [ ] **Step 1: Write the failing test**

Add to `ReviewLogicTest.kt` (plain, no DB needed):

```kotlin
    @Test
    fun paceProjectsLinearlyFromElapsedFraction() {
        // 50% through the period, Ksh1000 spent so far -> Ksh2000 projected.
        val projected = paceProjection(spentSoFar = 1000.0, periodStart = 0L, periodEnd = 1000L, now = 500L)
        assertEquals(2000.0, projected!!, 0.001)
    }

    @Test
    fun paceProjectionNullBeforePeriodStarts() {
        assertEquals(null, paceProjection(1000.0, periodStart = 1000L, periodEnd = 2000L, now = 500L))
    }

    @Test
    fun paceProjectionNullForACompletedPeriod() {
        assertEquals(null, paceProjection(1000.0, periodStart = 0L, periodEnd = 1000L, now = 1500L))
    }

    @Test
    fun paceProjectionNullAtTheVeryStartOfThePeriod() {
        assertEquals(null, paceProjection(0.0, periodStart = 1000L, periodEnd = 2000L, now = 1000L))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest"`
Expected: FAIL — `paceProjection` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `ReviewSection.kt`:

```kotlin
internal fun paceProjection(spentSoFar: Double, periodStart: Long, periodEnd: Long, now: Long): Double? {
    if (now < periodStart || now >= periodEnd) return null
    val elapsedFraction = (now - periodStart).toDouble() / (periodEnd - periodStart).toDouble()
    if (elapsedFraction <= 0.0) return null
    return spentSoFar / elapsedFraction
}
```

Wire it into `ReviewContent` — only meaningful when `ref`'s period contains "now":

```kotlin
    val pace = remember(period, ref, series) {
        val (from, to) = range(period, ref, zone)
        val now = System.currentTimeMillis()
        val spentSoFar = series.lastOrNull { it.ref == ref }?.moneyOut
        if (spentSoFar != null) paceProjection(spentSoFar, from, to, now) else null
    }
```

```kotlin
            pace?.let {
                SectionCard("Pace") {
                    Text(
                        "At this rate, ${Format.kes(it)} by the end of this ${period.name.lowercase()}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
```

(Place this after the "Category movers" block in `ReviewContent`'s `else` branch.)

- [ ] **Step 4: Run test to verify it passes, then verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest" && ./gradlew :app:compileDebugKotlin`
Expected: PASS / BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt
git commit -m "feat(android): pace projection for the in-progress period"
```

---

## Task 15: `dailyTotals()` DAO query

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt`

**Interfaces:**
- Produces: `suspend fun TransactionDao.dailyTotals(from: Long, to: Long): List<NamedTotal>` (all days with spend, unordered/unlimited — unlike `topDays`)

- [ ] **Step 1: Write the failing test**

Add to `StatsDaoTest.kt`:

```kotlin
    @Test
    fun dailyTotalsReturnsEveryDayNotJustTopFive() = runBlocking {
        for (day in 1..6) {
            dao.insert(row("D$day", 10.0 * day, "out", "food", "S", ms(day, 9)))
        }
        val daily = dao.dailyTotals(ms(1, 0), ms(30, 23))
        assertEquals(6, daily.size)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: FAIL — `dailyTotals` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `TransactionDao.kt`, right after `topDays`:

```kotlin
    @Query("""SELECT strftime('%Y-%m-%d', date_time / 1000, 'unixepoch', 'localtime') AS name,
                     SUM(amount + cost) AS total FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY name""")
    suspend fun dailyTotals(from: Long, to: Long): List<NamedTotal>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt \
        android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt
git commit -m "feat(android): add dailyTotals query for the spend heatmap"
```

---

## Task 16: Spend calendar heatmap

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt`

**Interfaces:**
- Consumes: `TransactionDao.dailyTotals()` (Task 15).
- Produces: `internal fun heatmapBuckets(daily: List<NamedTotal>): Map<String, Int>` (0 = no spend, 1-4 = quartile intensity)

- [ ] **Step 1: Write the failing test**

Add to `ReviewLogicTest.kt` (add `import com.ngigi.wallet.data.NamedTotal` at top):

```kotlin
    @Test
    fun heatmapBucketsAllZeroWhenNoSpend() {
        val daily = listOf(NamedTotal("2026-09-01", 0.0), NamedTotal("2026-09-02", 0.0))
        assertEquals(mapOf("2026-09-01" to 0, "2026-09-02" to 0), heatmapBuckets(daily))
    }

    @Test
    fun heatmapBucketsSpreadsAcrossQuartiles() {
        val daily = (1..8).map { NamedTotal("2026-09-0$it", it * 100.0) }
        val buckets = heatmapBuckets(daily)
        assertEquals(1, buckets["2026-09-01"])
        assertEquals(4, buckets["2026-09-08"])
    }

    @Test
    fun heatmapBucketsSingleNonZeroDayGetsANonZeroBucket() {
        val daily = listOf(NamedTotal("2026-09-01", 500.0))
        assertEquals(true, heatmapBuckets(daily)["2026-09-01"]!! in 1..4)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest"`
Expected: FAIL — `heatmapBuckets` unresolved.

- [ ] **Step 3: Write minimal implementation**

Add to `ReviewSection.kt`:

```kotlin
internal fun heatmapBuckets(daily: List<NamedTotal>): Map<String, Int> {
    val nonZero = daily.filter { it.total > 0.0 }.map { it.total }.sorted()
    if (nonZero.isEmpty()) return daily.associate { it.name to 0 }
    fun bucketFor(v: Double): Int {
        if (v <= 0.0) return 0
        val idx = nonZero.indexOfFirst { it >= v }.coerceAtLeast(0)
        val quartile = (idx * 4 / nonZero.size).coerceIn(0, 3)
        return quartile + 1
    }
    return daily.associate { it.name to bucketFor(it.total) }
}
```

Wire the heatmap into `ReviewContent` — trailing 365 days, independent of `period`/`ref`:

```kotlin
    var daily by remember { mutableStateOf<List<NamedTotal>>(emptyList()) }
    LaunchedEffect(Unit) {
        val to = System.currentTimeMillis()
        val from = to - 365L * 86_400_000
        daily = dao.dailyTotals(from, to)
    }
    val buckets = remember(daily) { heatmapBuckets(daily) }
```

```kotlin
            if (buckets.isNotEmpty()) {
                SectionCard("Spend calendar") {
                    val bucketColors = listOf(
                        MaterialTheme.colorScheme.surfaceVariant, // 0: no spend
                        LocalWalletPalette.current.moneyIn.copy(alpha = 0.3f),
                        LocalWalletPalette.current.moneyIn.copy(alpha = 0.55f),
                        LocalWalletPalette.current.moneyOut.copy(alpha = 0.7f),
                        LocalWalletPalette.current.moneyOut,
                    )
                    androidx.compose.foundation.layout.FlowRow(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        buckets.entries.sortedBy { it.key }.forEach { (day, bucket) ->
                            Box(
                                Modifier
                                    .size(10.dp)
                                    .background(bucketColors[bucket], RoundedCornerShape(2.dp))
                                    .clickable { showMessageForDay(day, daily) },
                            )
                        }
                    }
                }
            }
```

`ReviewContent` needs a `showMessage: (String) -> Unit` parameter to report a tapped day's total (threaded from `StatsScreen`, which already has one) — update its signature to `fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit, showMessage: (String) -> Unit)`, update the Task-11 call site in `StatsScreen.kt` to pass `showMessage`, and add the small helper:

```kotlin
private fun showMessageForDay(day: String, daily: List<NamedTotal>) { /* placeholder replaced below */ }
```

Replace that placeholder with an inline lambda instead (simpler — drop the helper function and call `showMessage` directly):

```kotlin
                                    .clickable {
                                        val total = daily.firstOrNull { it.name == day }?.total ?: 0.0
                                        showMessage("${Format.dayLabel(day)}: ${Format.kes(total)}")
                                    },
```

(Add the `FlowRow` import — `androidx.compose.foundation.layout.FlowRow` — and `size` — `androidx.compose.foundation.layout.size` — to `ReviewSection.kt`'s import block; `FlowRow` requires `@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)` on `ReviewContent`.)

- [ ] **Step 4: Run test to verify it passes, then verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.ui.ReviewLogicTest" && ./gradlew :app:compileDebugKotlin`
Expected: PASS / BUILD SUCCESSFUL.

- [ ] **Step 5: Manual check and commit**

Run: `cd android && ./gradlew :app:installDebug`, open Stats → Review, confirm the heatmap renders and tapping a cell shows a snackbar with that day's total.

```bash
git add android/app/src/main/java/com/ngigi/wallet/ui/ReviewSection.kt \
        android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt \
        android/app/src/test/java/com/ngigi/wallet/ui/ReviewLogicTest.kt
git commit -m "feat(android): trailing-12-month spend calendar heatmap"
```

---

## Task 17: Fix the Discord-bot Nairobi timezone bug

**Files:**
- Modify: `internal/mpesa/parser.go`
- Test: `internal/mpesa/parser_test.go`

**Interfaces:**
- Produces: package-level `var nairobi = time.FixedZone("EAT", 3*60*60)` in `internal/mpesa`; `ParsedTransaction.DateTime` now carries a real `+03:00` offset instead of a mislabeled UTC one.

- [ ] **Step 1: Write the failing test**

Add to `parser_test.go`:

```go
func TestParseUsesNairobiOffsetNotUTC(t *testing.T) {
	msg := `TIH6CSP6KA Confirmed. Ksh40.00 sent to Co-operative Bank Money Transfer for account 1082111 on 17/9/25 at 6:59 PM New M-PESA balance is Ksh679.18. Transaction cost, Ksh0.00.`
	p, err := ParseMPesaMessage(msg)
	if err != nil {
		t.Fatalf("expected parse ok, got err: %v", err)
	}
	_, offset := p.DateTime.Zone()
	if offset != 3*60*60 {
		t.Errorf("got offset %d seconds, want %d (Africa/Nairobi, no DST)", offset, 3*60*60)
	}
	if p.DateTime.Hour() != 18 || p.DateTime.Minute() != 59 {
		t.Errorf("got %02d:%02d, want 18:59 (wall-clock time from the SMS, unchanged)", p.DateTime.Hour(), p.DateTime.Minute())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/mpesa/... -run TestParseUsesNairobiOffsetNotUTC -v`
Expected: FAIL — offset is 0 (UTC), not `10800`.

- [ ] **Step 3: Write minimal implementation**

In `parser.go`, add near the top (after the `import` block):

```go
// Kenya is UTC+3 year-round (no DST), so a fixed zone is exact and needs no
// tzdata lookup.
var nairobi = time.FixedZone("EAT", 3*60*60)
```

Change line 64 from:

```go
	dateTime, err := time.Parse("2006-01-02 3:04 PM", dateTimeStr)
```

to:

```go
	dateTime, err := time.ParseInLocation("2006-01-02 3:04 PM", dateTimeStr, nairobi)
```

- [ ] **Step 4: Run test to verify it passes, and the full parser suite still passes**

Run: `go test ./internal/mpesa/... -v`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add internal/mpesa/parser.go internal/mpesa/parser_test.go
git commit -m "fix(discord): parse M-PESA timestamps with the real Nairobi offset"
```

---

## Task 18: `internal/storage/reports.go` — totals and category totals

**Files:**
- Create: `internal/storage/reports.go`
- Test: `internal/storage/reports_test.go` (create)

**Interfaces:**
- Produces: `type NamedTotal struct { Name string; Total float64 }`, `func (d *Database) PeriodTotals(from, to time.Time) (moneyIn, moneyOut float64, err error)`, `func (d *Database) CategoryTotals(from, to time.Time) ([]NamedTotal, error)`

- [ ] **Step 1: Write the failing test**

Create `reports_test.go`:

```go
package storage

import (
	"path/filepath"
	"testing"
	"time"
)

func mustSave(t *testing.T, db *Database, tx *Transaction) {
	t.Helper()
	if _, err := db.CreateTransaction(tx); err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
}

func TestPeriodTotalsAndCategoryTotals(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	base := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 1000, Recipient: "Shop", DateTime: base, Cost: 30, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 500, Recipient: "Boss", DateTime: base, Category: "income", Direction: "in", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 8000, Recipient: "Pochi", DateTime: base, Category: "transfer", Direction: "transfer", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

	in, out, err := db.PeriodTotals(from, to)
	if err != nil {
		t.Fatalf("PeriodTotals: %v", err)
	}
	if in != 500 || out != 1030 {
		t.Errorf("got in=%v out=%v, want in=500 out=1030 (transfer excluded, cost counted)", in, out)
	}

	cats, err := db.CategoryTotals(from, to)
	if err != nil {
		t.Fatalf("CategoryTotals: %v", err)
	}
	if len(cats) != 1 || cats[0].Name != "food" || cats[0].Total != 1030 {
		t.Errorf("got %+v, want [{food 1030}]", cats)
	}
}

func TestPeriodTotalsExcludesOutsideRange(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 1000, Recipient: "Shop", DateTime: time.Date(2026, 8, 31, 23, 0, 0, 0, time.UTC), Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	_, out, err := db.PeriodTotals(from, to)
	if err != nil {
		t.Fatalf("PeriodTotals: %v", err)
	}
	if out != 0 {
		t.Errorf("got out=%v, want 0 (transaction is before the range)", out)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/storage/... -run "TestPeriodTotals|TestPeriodTotalsExcludesOutsideRange" -v`
Expected: FAIL — `PeriodTotals`/`CategoryTotals`/`NamedTotal` don't exist.

- [ ] **Step 3: Write minimal implementation**

Create `reports.go`:

```go
package storage

import "time"

// NamedTotal is a generic (label, amount) pair used by the period-scoped
// report queries below.
type NamedTotal struct {
	Name  string
	Total float64
}

// PeriodTotals sums incoming and outgoing money (outgoing includes fees) for
// transactions in [from, to).
func (d *Database) PeriodTotals(from, to time.Time) (moneyIn, moneyOut float64, err error) {
	if err = d.db.Model(&Transaction{}).
		Where("direction = ? AND date_time >= ? AND date_time < ?", "in", from, to).
		Select("COALESCE(SUM(amount), 0)").Scan(&moneyIn).Error; err != nil {
		return 0, 0, err
	}
	if err = d.db.Model(&Transaction{}).
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Select("COALESCE(SUM(amount + cost), 0)").Scan(&moneyOut).Error; err != nil {
		return 0, 0, err
	}
	return moneyIn, moneyOut, nil
}

// CategoryTotals sums outgoing spend per category in [from, to), highest first.
func (d *Database) CategoryTotals(from, to time.Time) ([]NamedTotal, error) {
	var results []NamedTotal
	err := d.db.Model(&Transaction{}).
		Select("category AS name, SUM(amount + cost) AS total").
		Where("direction = ? AND category IS NOT NULL AND date_time >= ? AND date_time < ?", "out", from, to).
		Group("category").Order("total DESC").Scan(&results).Error
	return results, err
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/storage/... -v`
Expected: PASS, all green (including the pre-existing `db_test.go` tests).

- [ ] **Step 5: Commit**

```bash
git add internal/storage/reports.go internal/storage/reports_test.go
git commit -m "feat(backend): add period-scoped totals and category-totals queries"
```

---

## Task 19: `reports.go` — top days, biggest expenses, top counterparties

**Files:**
- Modify: `internal/storage/reports.go`
- Test: `internal/storage/reports_test.go`

**Interfaces:**
- Produces: `func (d *Database) TopDays(from, to time.Time, limit int) ([]NamedTotal, error)`, `func (d *Database) BiggestExpenses(from, to time.Time, limit int) ([]Transaction, error)`, `func (d *Database) TopCounterparties(from, to time.Time, limit int) ([]NamedTotal, error)`

- [ ] **Step 1: Write the failing tests**

Add to `reports_test.go`:

```go
func TestTopDaysGroupsByCalendarDayInGoNotSQL(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	day1 := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)
	day1Later := time.Date(2026, 9, 10, 18, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 9, 11, 9, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 100, Recipient: "S", DateTime: day1, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 400, Recipient: "S", DateTime: day1Later, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 50, Recipient: "S", DateTime: day2, Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	days, err := db.TopDays(from, to, 5)
	if err != nil {
		t.Fatalf("TopDays: %v", err)
	}
	if len(days) != 2 || days[0].Name != "2026-09-10" || days[0].Total != 500 {
		t.Errorf("got %+v, want first day 2026-09-10 total 500", days)
	}
}

func TestBiggestExpensesAndTopCounterparties(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	base := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 100, Recipient: "Alice", DateTime: base, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 900, Recipient: "Bob", DateTime: base, Category: "travel", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 200, Recipient: "Bob", DateTime: base, Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

	biggest, err := db.BiggestExpenses(from, to, 5)
	if err != nil || len(biggest) == 0 || biggest[0].TransactionID != "B" {
		t.Fatalf("BiggestExpenses: got %+v, err=%v, want first TransactionID=B", biggest, err)
	}

	cp, err := db.TopCounterparties(from, to, 5)
	if err != nil || len(cp) == 0 || cp[0].Name != "Bob" || cp[0].Total != 1100 {
		t.Fatalf("TopCounterparties: got %+v, err=%v, want first {Bob 1100}", cp, err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/storage/... -run "TestTopDaysGroupsByCalendarDayInGoNotSQL|TestBiggestExpensesAndTopCounterparties" -v`
Expected: FAIL — `TopDays`/`BiggestExpenses`/`TopCounterparties` don't exist.

- [ ] **Step 3: Write minimal implementation**

Append to `reports.go` (add `"sort"` to the import block):

```go
// TopCounterparties sums outgoing spend per recipient in [from, to), highest
// first, capped at limit.
func (d *Database) TopCounterparties(from, to time.Time, limit int) ([]NamedTotal, error) {
	var results []NamedTotal
	err := d.db.Model(&Transaction{}).
		Select("recipient AS name, SUM(amount) AS total").
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Group("recipient").Order("total DESC").Limit(limit).Scan(&results).Error
	return results, err
}

// BiggestExpenses returns the largest outgoing transactions in [from, to),
// capped at limit.
func (d *Database) BiggestExpenses(from, to time.Time, limit int) ([]Transaction, error) {
	var results []Transaction
	err := d.db.
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Order("amount DESC").Limit(limit).Find(&results).Error
	return results, err
}

// TopDays sums outgoing spend per calendar day in [from, to), highest first,
// capped at limit. Grouping happens in Go, not via SQL strftime — see the
// Global Constraints note on mixed date/time text formats.
func (d *Database) TopDays(from, to time.Time, limit int) ([]NamedTotal, error) {
	var rows []Transaction
	if err := d.db.
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	byDay := make(map[string]float64)
	for _, r := range rows {
		byDay[r.DateTime.Format("2006-01-02")] += r.Amount + r.Cost
	}
	results := make([]NamedTotal, 0, len(byDay))
	for day, total := range byDay {
		results = append(results, NamedTotal{Name: day, Total: total})
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Total > results[j].Total })
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/storage/... -v`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add internal/storage/reports.go internal/storage/reports_test.go
git commit -m "feat(backend): add top-days, biggest-expenses, top-counterparties queries"
```

---

## Task 20: Period resolution and formatting for Discord (`period_commands.go`)

**Files:**
- Create: `internal/discord/period_commands.go`
- Test: `internal/discord/period_commands_test.go` (create)

**Interfaces:**
- Consumes: `storage.NamedTotal`, `storage.Transaction` (Tasks 18-19).
- Produces: `func resolveWeek(args []string, now time.Time) (from, to time.Time, label string, err error)`, `func resolveMonth(args []string, now time.Time) (from, to time.Time, label string, err error)`, `func resolveLastWeek(now time.Time) (from, to time.Time, label string)`, `func resolveLastMonth(now time.Time) (from, to time.Time, label string)`, `func comparisonLine(current, previous float64) string`, `func savingsRateText(moneyIn, moneyOut float64) string`, `func formatPeriodReview(label string, moneyIn, moneyOut, prevMoneyOut float64, cats, days, counterparties []storage.NamedTotal, biggest []storage.Transaction) string`

- [ ] **Step 1: Write the failing tests**

Create `period_commands_test.go`:

```go
package discord

import (
	"testing"
	"time"
)

func TestResolveWeekDefaultsToCurrentIsoWeek(t *testing.T) {
	now := time.Date(2026, 9, 8, 15, 0, 0, 0, time.UTC) // Tuesday, ISO week 37
	from, to, label, err := resolveWeek(nil, now)
	if err != nil {
		t.Fatalf("resolveWeek: %v", err)
	}
	wantFrom := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	wantTo := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	if !from.Equal(wantFrom) || !to.Equal(wantTo) {
		t.Errorf("got [%v, %v), want [%v, %v)", from, to, wantFrom, wantTo)
	}
	if label != "Week 37 (so far)" {
		t.Errorf("got label %q, want %q", label, "Week 37 (so far)")
	}
}

func TestResolveWeekWithExplicitNumber(t *testing.T) {
	now := time.Date(2026, 9, 8, 15, 0, 0, 0, time.UTC)
	from, _, label, err := resolveWeek([]string{"36"}, now)
	if err != nil {
		t.Fatalf("resolveWeek: %v", err)
	}
	if from.Weekday() != time.Monday {
		t.Errorf("week start %v is not a Monday", from)
	}
	if label != "Week 36" {
		t.Errorf("got label %q, want %q", label, "Week 36")
	}
}

func TestResolveWeekRejectsOutOfRangeNumber(t *testing.T) {
	if _, _, _, err := resolveWeek([]string{"99"}, time.Now()); err == nil {
		t.Fatal("expected an error for week 99")
	}
}

func TestResolveMonthByNameAndByNumberAgree(t *testing.T) {
	now := time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC)
	from, to, _, err := resolveMonth([]string{"august"}, now)
	if err != nil {
		t.Fatalf("resolveMonth(august): %v", err)
	}
	if from.Month() != time.August || to.Month() != time.September {
		t.Errorf("got [%v, %v)", from, to)
	}
	from2, _, _, err := resolveMonth([]string{"8"}, now)
	if err != nil || !from2.Equal(from) {
		t.Errorf("resolveMonth(8) = %v, err=%v, want %v", from2, err, from)
	}
}

func TestResolveMonthRejectsInvalidInput(t *testing.T) {
	if _, _, _, err := resolveMonth([]string{"smarch"}, time.Now()); err == nil {
		t.Fatal("expected an error for an invalid month name")
	}
	if _, _, _, err := resolveMonth([]string{"13"}, time.Now()); err == nil {
		t.Fatal("expected an error for month 13")
	}
}

func TestResolveLastWeekAndLastMonth(t *testing.T) {
	now := time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC)
	_, _, wLabel := resolveLastWeek(now)
	if wLabel != "Week 36" {
		t.Errorf("got %q, want %q", wLabel, "Week 36")
	}
	_, _, mLabel := resolveLastMonth(now)
	if mLabel != "August 2026" {
		t.Errorf("got %q, want %q", mLabel, "August 2026")
	}
}

func TestComparisonLineAndSavingsRateText(t *testing.T) {
	if got := comparisonLine(1080, 1000); got != "↑8% vs previous period" {
		t.Errorf("got %q", got)
	}
	if got := comparisonLine(920, 1000); got != "↓8% vs previous period" {
		t.Errorf("got %q", got)
	}
	if got := comparisonLine(500, 0); got != "new — no spend last period to compare" {
		t.Errorf("got %q", got)
	}
	if got := savingsRateText(1000, 700); got != "Savings rate: 30%" {
		t.Errorf("got %q", got)
	}
	if got := savingsRateText(0, 700); got != "" {
		t.Errorf("got %q, want empty string when there was no income", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/discord/... -run "TestResolveWeek|TestResolveMonth|TestResolveLast|TestComparisonLine" -v`
Expected: FAIL — none of these functions exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `period_commands.go`:

```go
package discord

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/NgigiN/wallet/internal/storage"
)

var monthNames = map[string]time.Month{
	"jan": time.January, "january": time.January,
	"feb": time.February, "february": time.February,
	"mar": time.March, "march": time.March,
	"apr": time.April, "april": time.April,
	"may": time.May,
	"jun": time.June, "june": time.June,
	"jul": time.July, "july": time.July,
	"aug": time.August, "august": time.August,
	"sep": time.September, "sept": time.September, "september": time.September,
	"oct": time.October, "october": time.October,
	"nov": time.November, "november": time.November,
	"dec": time.December, "december": time.December,
}

// weekRange returns [Monday 00:00, next Monday 00:00) for the ISO week containing ref.
func weekRange(ref time.Time) (time.Time, time.Time) {
	wd := int(ref.Weekday())
	if wd == 0 {
		wd = 7
	}
	monday := time.Date(ref.Year(), ref.Month(), ref.Day(), 0, 0, 0, 0, ref.Location()).AddDate(0, 0, -(wd - 1))
	return monday, monday.AddDate(0, 0, 7)
}

// monthRange returns [1st 00:00, next month's 1st 00:00) for the month containing ref.
func monthRange(ref time.Time) (time.Time, time.Time) {
	start := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, ref.Location())
	return start, start.AddDate(0, 1, 0)
}

// isoWeekStart returns the Monday that begins ISO week `week` of `year`.
// ISO week 1 is, equivalently, the week containing January 4th.
func isoWeekStart(year, week int) time.Time {
	jan4 := time.Date(year, 1, 4, 0, 0, 0, 0, time.UTC)
	week1Monday, _ := weekRange(jan4)
	return week1Monday.AddDate(0, 0, (week-1)*7)
}

func isoWeekOf(t time.Time) int {
	_, week := t.ISOWeek()
	return week
}

// resolveWeek parses `!week` args (none, or a week number 1-53) into a
// [from, to) range and a display label. now is injected for testability.
func resolveWeek(args []string, now time.Time) (from, to time.Time, label string, err error) {
	if len(args) == 0 {
		from, to = weekRange(now)
		return from, to, fmt.Sprintf("Week %d (so far)", isoWeekOf(now)), nil
	}
	n, convErr := strconv.Atoi(args[0])
	if convErr != nil || n < 1 || n > 53 {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid week number %q — use 1-53", args[0])
	}
	start := isoWeekStart(now.Year(), n)
	return start, start.AddDate(0, 0, 7), fmt.Sprintf("Week %d", n), nil
}

// resolveMonth parses `!month` args (none, a name, or a number 1-12) into a
// [from, to) range and a display label.
func resolveMonth(args []string, now time.Time) (from, to time.Time, label string, err error) {
	if len(args) == 0 {
		from, to = monthRange(now)
		return from, to, now.Month().String() + " " + strconv.Itoa(now.Year()), nil
	}
	arg := strings.ToLower(args[0])
	var month time.Month
	if n, convErr := strconv.Atoi(arg); convErr == nil {
		if n < 1 || n > 12 {
			return time.Time{}, time.Time{}, "", fmt.Errorf("invalid month number %q — use 1-12", args[0])
		}
		month = time.Month(n)
	} else if m, ok := monthNames[arg]; ok {
		month = m
	} else {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid month %q — use a name (august) or a number (1-12)", args[0])
	}
	start := time.Date(now.Year(), month, 1, 0, 0, 0, 0, now.Location())
	return start, start.AddDate(0, 1, 0), month.String() + " " + strconv.Itoa(now.Year()), nil
}

func resolveLastWeek(now time.Time) (from, to time.Time, label string) {
	prevRef := now.AddDate(0, 0, -7)
	from, to = weekRange(prevRef)
	return from, to, fmt.Sprintf("Week %d", isoWeekOf(prevRef))
}

func resolveLastMonth(now time.Time) (from, to time.Time, label string) {
	prevRef := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0)
	from, to = monthRange(prevRef)
	return from, to, prevRef.Month().String() + " " + strconv.Itoa(prevRef.Year())
}

func comparisonLine(current, previous float64) string {
	if previous <= 0 {
		return "new — no spend last period to compare"
	}
	pct := int(math.Round((current - previous) / previous * 100))
	arrow := "↑"
	if pct < 0 {
		arrow = "↓"
		pct = -pct
	}
	return fmt.Sprintf("%s%d%% vs previous period", arrow, pct)
}

func savingsRateText(moneyIn, moneyOut float64) string {
	if moneyIn <= 0 {
		return ""
	}
	rate := int(math.Round((moneyIn - moneyOut) / moneyIn * 100))
	return fmt.Sprintf("Savings rate: %d%%", rate)
}

func formatPeriodReview(label string, moneyIn, moneyOut, prevMoneyOut float64, cats, days, counterparties []storage.NamedTotal, biggest []storage.Transaction) string {
	if moneyIn == 0 && moneyOut == 0 {
		return fmt.Sprintf("📊 **%s**\n\nNo transactions found for this period.", label)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "📊 **%s**\n\n", label)
	fmt.Fprintf(&b, "Net: Ksh%.2f · In: Ksh%.2f · Out: Ksh%.2f\n", moneyIn-moneyOut, moneyIn, moneyOut)
	fmt.Fprintf(&b, "%s\n", comparisonLine(moneyOut, prevMoneyOut))
	if sr := savingsRateText(moneyIn, moneyOut); sr != "" {
		fmt.Fprintf(&b, "%s\n", sr)
	}
	if len(cats) > 0 {
		b.WriteString("\n**By category**\n")
		for _, c := range cats {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", strings.Title(c.Name), c.Total)
		}
	}
	if len(days) > 0 {
		b.WriteString("\n**Top spending days**\n")
		for _, d := range days {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", d.Name, d.Total)
		}
	}
	if len(biggest) > 0 {
		b.WriteString("\n**Biggest expenses**\n")
		for _, tx := range biggest {
			fmt.Fprintf(&b, "• Ksh%.2f to %s\n", tx.Amount, tx.Recipient)
		}
	}
	if len(counterparties) > 0 {
		b.WriteString("\n**Top counterparties**\n")
		for _, c := range counterparties {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", c.Name, c.Total)
		}
	}
	return b.String()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./internal/discord/... -v`
Expected: PASS, all green.

- [ ] **Step 5: Commit**

```bash
git add internal/discord/period_commands.go internal/discord/period_commands_test.go
git commit -m "feat(discord): period resolution and review-message formatting"
```

---

## Task 21: Wire `!week`/`!month`/`!lastweek`/`!lastmonth` into the bot

**Files:**
- Modify: `internal/discord/bot.go`

**Interfaces:**
- Consumes: `resolveWeek`, `resolveMonth`, `resolveLastWeek`, `resolveLastMonth`, `formatPeriodReview` (Task 20); `db.PeriodTotals`, `db.CategoryTotals`, `db.TopDays`, `db.BiggestExpenses`, `db.TopCounterparties` (Tasks 18-19).

- [ ] **Step 1: Add the dispatch branch**

In `handleMessage`, right after the existing `!summary` block:

```go
	// Check for summary command
	if strings.HasPrefix(content, "!summary") {
		b.handleSummaryCommand(s, m)
		return
	}
```

add:

```go
	if fields := strings.Fields(content); len(fields) > 0 {
		switch fields[0] {
		case "!week", "!month", "!lastweek", "!lastmonth":
			b.handlePeriodCommand(s, m, content)
			return
		}
	}
```

- [ ] **Step 2: Add the handler**

Add to `bot.go` (needs no new imports — `time` and `strings` are already imported):

```go
func (b *Bot) handlePeriodCommand(s *discordgo.Session, m *discordgo.MessageCreate, content string) {
	fields := strings.Fields(content)
	cmd := fields[0]
	args := fields[1:]
	now := time.Now()

	var from, to time.Time
	var label string
	var err error
	switch cmd {
	case "!week":
		from, to, label, err = resolveWeek(args, now)
	case "!month":
		from, to, label, err = resolveMonth(args, now)
	case "!lastweek":
		from, to, label = resolveLastWeek(now)
	case "!lastmonth":
		from, to, label = resolveLastMonth(now)
	}
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, err.Error()+"\nUsage: !week [1-53], !month [name|1-12], !lastweek, !lastmonth")
		return
	}

	var prevFrom, prevTo time.Time
	switch cmd {
	case "!week", "!lastweek":
		prevFrom, prevTo = weekRange(from.AddDate(0, 0, -7))
	case "!month", "!lastmonth":
		prevFrom, prevTo = monthRange(from.AddDate(0, -1, 0))
	}

	moneyIn, moneyOut, err := b.db.PeriodTotals(from, to)
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to load %s: %v", label, err))
		return
	}
	_, prevMoneyOut, err := b.db.PeriodTotals(prevFrom, prevTo)
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to load the previous period for %s: %v", label, err))
		return
	}

	cats, _ := b.db.CategoryTotals(from, to)
	days, _ := b.db.TopDays(from, to, 5)
	biggest, _ := b.db.BiggestExpenses(from, to, 5)
	counterparties, _ := b.db.TopCounterparties(from, to, 5)

	s.ChannelMessageSend(m.ChannelID, formatPeriodReview(label, moneyIn, moneyOut, prevMoneyOut, cats, days, counterparties, biggest))
}
```

- [ ] **Step 3: Verify it builds and existing tests pass**

Run: `go build ./... && go test ./... -v`
Expected: BUILD SUCCESSFUL, all tests PASS.

- [ ] **Step 4: Manual check**

Run the bot against a local `.env`/test DB (`go run cmd/main.go`), and in the configured Discord channel try `!week`, `!month`, `!month august`, `!lastweek`, `!lastmonth`, and an invalid one like `!week 99` to confirm the usage-hint path.

- [ ] **Step 5: Commit**

```bash
git add internal/discord/bot.go
git commit -m "feat(discord): add !week/!month/!lastweek/!lastmonth commands"
```

---

## Task 22: README rewrite

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Rewrite the README**

Rewrite `README.md` to describe the product as it actually exists today, covering:

- **Two subsystems**: the Go backend (Discord bot + `internal/api` bearer-auth ingest/read API) and the Android capture app (`android/`, Kotlin/Compose) — both described, not just the bot.
- **Categories**: `food, travel, savings, church, investments, income, transfer` (not the original 5 — pull the authoritative list from `android/app/src/main/java/com/ngigi/wallet/data/Categories.kt` and the `isValidCategory` map in `internal/discord/bot.go`).
- **Discord commands**: `!summary [category]`, `!week [1-53]`, `!month [name|1-12]`, `!lastweek`, `!lastmonth` — one line each with an example, matching the style of the existing "Summary Commands" section.
- **Deployment**: `start_app.sh` → `docker run` directly — no docker-compose (removed in commit `ba57fa5`; drop any docker-compose instructions still in the README).
- **Android app**: a short section (it currently has none) covering what it does (SMS capture, tagging, sync, Stats/Review, budgets, shoulder-surfing guard) and how to build it (`cd android && ./gradlew :app:installDebug`).
- **Health endpoint / API auth**: keep the existing accurate sections on `/health` and the bearer-token `/api/transactions` endpoint.

Use the `docs/superpowers/specs/2026-08-31-sms-finance-tracker-design.md` and `docs/superpowers/specs/2026-09-08-period-reviews-and-budgets-design.md` spec docs, plus `git log --oneline`, as the source of truth for what's actually shipped — don't describe anything not yet merged.

- [ ] **Step 2: Proofread against the actual code**

Cross-check every command, file path, and category name mentioned in the new README against the real source (`internal/discord/bot.go`'s `isValidCategory`, `android/.../Categories.kt`, `internal/api/server.go`'s routes) — this is documentation, so "verification" here means "matches the code," not a test run.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README to cover the Android app, sync API, and new commands"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (ISO week/jump-to/comparison/budget bars) → Tasks 1-4, 10. Part 2 (Review tab) → Tasks 11-16. Part 3 (budgets) → Tasks 5-9. Part 4 (`reports.go`) → Tasks 18-19. Part 5 (Discord commands) → Tasks 20-21. Part 6 (README) → Task 22. The timezone bug found and approved mid-brainstorm → Task 17, sequenced before the Go report queries that depend on correct `date_time` values.
- **Placeholder scan:** every step above carries real code; no "TBD"/"add appropriate handling"/"similar to Task N" placeholders.
- **Type consistency:** `NamedTotal` (Kotlin, existing) vs. `storage.NamedTotal` (Go, new in Task 18) are deliberately separate types in separate languages — checked that `TopDays`/`CategoryTotals`/`TopCounterparties` (Go) and `dailyTotals`/`categoryTotals`/`topCounterparties` (Kotlin, existing) aren't confused across tasks. `BudgetEntity`, `BudgetDao`, `BudgetAlert`/`BudgetAlertDecision`, `BudgetBarState` names are used consistently from their defining task (5, 5, 7, 10) through their consuming tasks (8, 9, 10).
