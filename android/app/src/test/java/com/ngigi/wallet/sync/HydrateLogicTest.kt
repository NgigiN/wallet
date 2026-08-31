package com.ngigi.wallet.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HydrateLogicTest {
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

    @Test
    fun pullInsertsAsSyncedAndSkipsExisting() = runBlocking {
        val body = """[
            {"transaction_id":"L1","amount":100.0,"direction":"out","source":"mpesa","counterparty":"A",
             "date_time":"2026-08-31T10:00:00+03:00","balance":0.0,"cost":0.0,"category":"food","reason":""},
            {"transaction_id":"L2","amount":50.0,"direction":"out","source":"mpesa","counterparty":"B",
             "date_time":"2026-08-30T10:00:00+03:00","balance":0.0,"cost":0.0,"category":"travel","reason":""}
        ]"""
        server.enqueue(MockResponse().setResponseCode(200).setBody(body))
        server.enqueue(MockResponse().setResponseCode(200).setBody(body))
        val client = ApiClient(server.url("/").toString().trimEnd('/'), "tok")
        val dao = db.dao()

        assertEquals(2, Hydrate.pull(dao, client))
        assertEquals(0, Hydrate.pull(dao, client)) // second pull: all duplicates
        assertEquals(2, dao.count())
        assertEquals(0, dao.inboxCount())
        assertEquals(Status.SYNCED, dao.byId(1L)!!.status)
    }
}
