package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DaoTest {
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

    private fun entity(txnId: String, status: String = Status.UNTAGGED, category: String? = null) =
        TransactionEntity(
            txnId = txnId, amount = 100.0, direction = "out", source = "mpesa",
            counterparty = "Shop", dateTime = 1000L, balance = 500.0, cost = 0.0,
            category = category, reason = null, status = status,
            rawBody = "raw", createdAt = 1000L,
        )

    @Test
    fun insertIgnoresDuplicateTxnId() = runBlocking {
        val first = dao.insert(entity("T1"))
        val dup = dao.insert(entity("T1"))
        assertEquals(true, first > 0)
        assertEquals(-1L, dup)
        assertEquals(1, dao.count())
    }

    @Test
    fun tagMovesRowOutOfInbox() = runBlocking {
        val id = dao.insert(entity("T1"))
        assertEquals(1, dao.inbox().first().size)
        dao.tag(id, "food", "lunch")
        assertEquals(0, dao.inbox().first().size)
        val row = dao.byId(id)!!
        assertEquals(Status.TAGGED, row.status)
        assertEquals("food", row.category)
        assertEquals(listOf(row.id), dao.unsynced().map { it.id })
    }

    @Test
    fun parseFailedAndSyncErrorRowsAppearInInbox() = runBlocking {
        dao.insert(entity("T1", status = Status.PARSE_FAILED))
        val id2 = dao.insert(entity("T2", status = Status.TAGGED, category = "food"))
        dao.setSyncError(id2, "rejected by server")
        assertEquals(2, dao.inbox().first().size)
        assertEquals(1, dao.inboxCount()) // sync-error row is TAGGED, not counted as untagged
    }

    @Test
    fun markSyncedClearsFromUnsynced() = runBlocking {
        val id = dao.insert(entity("T1", status = Status.TAGGED, category = "food"))
        dao.markSynced(id)
        assertEquals(0, dao.unsynced().size)
        assertNull(dao.byId(id)!!.syncError)
    }

    @Test
    fun topCategoriesExcludesTransferAndOrdersByCount() = runBlocking {
        dao.insert(entity("A", status = Status.SYNCED, category = "food"))
        dao.insert(entity("B", status = Status.SYNCED, category = "food"))
        dao.insert(entity("C", status = Status.SYNCED, category = "travel"))
        dao.insert(entity("D", status = Status.SYNCED, category = Categories.TRANSFER))
        val top = dao.topCategories()
        assertEquals(listOf("food", "travel"), top.map { it.category })
    }
}
