package com.ngigi.wallet.sms

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.notify.Notifier
import com.ngigi.wallet.parser.ParseResult
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
class SmsHandlerTest {
    private lateinit var db: AppDb
    private val notified = mutableListOf<String>()
    private var syncRequests = 0

    private val fakeNotifier = object : Notifier {
        override fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>) {
            notified.add("tx:$rowId")
        }
        override fun notifyParseFailed(rowId: Long) { notified.add("failed:$rowId") }
    }

    private lateinit var handler: SmsHandler

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        handler = SmsHandler(db.dao(), fakeNotifier) { syncRequests++ }
    }

    @After
    fun tearDown() = db.close()

    private val sentBody = "TID60759AQ Confirmed. Ksh300.00 sent to Jane Wanjiku on 13/9/26 at 9:24 AM. " +
        "New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00."

    @Test
    fun storesUntaggedAndNotifies() = runBlocking {
        handler.handle("MPESA", sentBody)
        val row = db.dao().byId(1L)!!
        assertEquals(Status.UNTAGGED, row.status)
        assertEquals("TID60759AQ", row.txnId)
        assertEquals(sentBody, row.rawBody)
        assertEquals(listOf("tx:1"), notified)
        assertEquals(0, syncRequests)
    }

    @Test
    fun duplicateSmsDoesNotDoubleStoreOrNotify() = runBlocking {
        handler.handle("MPESA", sentBody)
        handler.handle("MPESA", sentBody)
        assertEquals(1, db.dao().count())
        assertEquals(1, notified.size)
    }

    @Test
    fun transferIsAutoTaggedAndSyncRequested() = runBlocking {
        handler.handle(
            "MPESA",
            "UHUDS4XKO7 Confirmed, Ksh8,000.00 has been moved from your M-PESA account to your Pochi account " +
                "on 30/8/26 at 6:29 PM.. New Pochi balance is Ksh8,016.00. New M-PESA balance is Ksh1,494.18. Transaction cost, Ksh0.00."
        )
        val row = db.dao().byId(1L)!!
        assertEquals(Status.TAGGED, row.status)
        assertEquals(Categories.TRANSFER, row.category)
        assertEquals(0, notified.size)
        assertEquals(1, syncRequests)
    }

    @Test
    fun parseFailureStoresRawBodyAndNotifies() = runBlocking {
        handler.handle("MPESA", "UXXXX1 Confirmed. Ksh50.00 teleported to Nowhere on 1/1/26 at 1:00 PM.")
        val row = db.dao().byId(1L)!!
        assertEquals(Status.PARSE_FAILED, row.status)
        assertEquals(listOf("failed:1"), notified)
    }

    @Test
    fun promoIsFullyIgnored() = runBlocking {
        handler.handle("MPESA", "Insufficient funds in your M-PESA account for this transaction, to register for Fuliza M-PESA service, Dial *334#OK")
        assertEquals(0, db.dao().count())
        assertEquals(0, notified.size)
    }
}
