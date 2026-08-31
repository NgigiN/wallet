package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDateTime
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StatsDaoTest {
    private lateinit var db: AppDb
    private lateinit var dao: TransactionDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        dao = db.dao()
    }

    @After
    fun tearDown() = db.close()

    private fun ms(day: Int, hour: Int) =
        LocalDateTime.of(2026, 8, day, hour, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun row(txnId: String, amount: Double, direction: String, category: String?,
                    counterparty: String, at: Long, cost: Double = 0.0) = TransactionEntity(
        txnId = txnId, amount = amount, direction = direction, source = "mpesa",
        counterparty = counterparty, dateTime = at, balance = null, cost = cost,
        category = category, reason = null, status = Status.SYNCED, rawBody = "", createdAt = 0,
    )

    @Test
    fun totalsExcludeTransfersAndCountFees() = runBlocking {
        dao.insert(row("A", 1000.0, "out", "food", "Shop", ms(10, 9), cost = 30.0))
        dao.insert(row("B", 500.0, "in", "income", "Boss", ms(11, 9)))
        dao.insert(row("C", 8000.0, "transfer", Categories.TRANSFER, "Pochi", ms(12, 9)))
        val t = dao.totals(ms(1, 0), ms(30, 23))
        assertEquals(500.0, t.moneyIn, 0.001)
        assertEquals(1030.0, t.moneyOut, 0.001)   // amount + fee, transfer excluded
    }

    @Test
    fun categoryTotalsSortedDesc() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "S1", ms(10, 9)))
        dao.insert(row("B", 900.0, "out", "travel", "S2", ms(10, 10)))
        dao.insert(row("C", 200.0, "out", "food", "S3", ms(10, 11)))
        val cats = dao.categoryTotals(ms(1, 0), ms(30, 23))
        assertEquals(listOf("travel", "food"), cats.map { it.name })
        assertEquals(900.0, cats[0].total, 0.001)
        assertEquals(300.0, cats[1].total, 0.001)
    }

    @Test
    fun topDaysGroupsByLocalDate() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "S", ms(10, 9)))
        dao.insert(row("B", 400.0, "out", "food", "S", ms(10, 18)))
        dao.insert(row("C", 50.0, "out", "food", "S", ms(11, 9)))
        val days = dao.topDays(ms(1, 0), ms(30, 23))
        assertEquals("2026-08-10", days[0].name)
        assertEquals(500.0, days[0].total, 0.001)
    }

    @Test
    fun biggestAndCounterparties() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "Alice", ms(10, 9)))
        dao.insert(row("B", 900.0, "out", "travel", "Bob", ms(10, 10)))
        dao.insert(row("C", 200.0, "out", "food", "Bob", ms(10, 11)))
        assertEquals("B", dao.biggestExpenses(ms(1, 0), ms(30, 23)).first().txnId)
        val cp = dao.topCounterparties(ms(1, 0), ms(30, 23))
        assertEquals("Bob", cp[0].name)
        assertEquals(1100.0, cp[0].total, 0.001)
    }
}
