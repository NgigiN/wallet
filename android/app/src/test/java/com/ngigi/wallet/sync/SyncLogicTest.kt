package com.ngigi.wallet.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncLogicTest {
    private lateinit var db: AppDb
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        server = MockWebServer(); server.start()
    }

    @After
    fun tearDown() { db.close(); server.shutdown() }

    private fun client() = ApiClient(server.url("/").toString().trimEnd('/'), "tok")

    private fun tagged(txnId: String) = TransactionEntity(
        txnId = txnId, amount = 10.0, direction = "out", source = "mpesa", counterparty = "X",
        dateTime = 1000L, balance = null, cost = 0.0, category = "food", reason = null,
        status = Status.TAGGED, rawBody = "", createdAt = 0,
    )

    @Test
    fun successAndDuplicateBothMarkSynced() = runBlocking {
        val dao = db.dao()
        dao.insert(tagged("A")); dao.insert(tagged("B"))
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertTrue(done)
        assertEquals(0, dao.unsynced().size)
    }

    @Test
    fun clientErrorSetsSyncErrorAndDoesNotRetry() = runBlocking {
        val dao = db.dao()
        val id = dao.insert(tagged("A"))
        server.enqueue(MockResponse().setResponseCode(400).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertTrue(done) // no retry: retrying a 400 won't help
        assertNotNull(dao.byId(id)!!.syncError)
        assertEquals(Status.TAGGED, dao.byId(id)!!.status)
    }

    @Test
    fun serverErrorRequestsRetryAndKeepsRow() = runBlocking {
        val dao = db.dao()
        dao.insert(tagged("A"))
        server.enqueue(MockResponse().setResponseCode(500).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertFalse(done)
        assertEquals(1, dao.unsynced().size)
    }
}
