package com.ngigi.wallet.ui

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
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
