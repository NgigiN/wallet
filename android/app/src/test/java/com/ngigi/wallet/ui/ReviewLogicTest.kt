package com.ngigi.wallet.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.NamedTotal
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
}
