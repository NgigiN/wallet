package com.ngigi.wallet.sync

import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = ApiClient(server.url("/").toString().trimEnd('/'), "tok123")
    }

    @After
    fun tearDown() = server.shutdown()

    private val entity = TransactionEntity(
        id = 1, txnId = "TID100", amount = 300.0, direction = "out", source = "mpesa",
        counterparty = "Jane Doe", dateTime = 1756617840000L, balance = 1761.18, cost = 7.0,
        category = "food", reason = "lunch", status = Status.TAGGED, rawBody = "raw", createdAt = 0,
    )

    @Test
    fun postSendsWireFormatAndAuthHeader() {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"created":true}"""))
        val result = client.post(Wire.toApi(entity))
        assertEquals(PostResult.CREATED, result)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/transactions", req.path)
        assertEquals("Bearer tok123", req.getHeader("Authorization"))
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"transaction_id\":\"TID100\""))
        assertTrue(body.contains("\"counterparty\":\"Jane Doe\""))
        assertTrue(body.contains("\"date_time\":"))
    }

    @Test
    fun postMapsStatusCodes() {
        for ((code, expected) in mapOf(200 to PostResult.DUPLICATE, 400 to PostResult.CLIENT_ERROR,
                401 to PostResult.CLIENT_ERROR, 500 to PostResult.SERVER_ERROR)) {
            server.enqueue(MockResponse().setResponseCode(code).setBody("{}"))
            assertEquals("code $code", expected, client.post(Wire.toApi(entity)))
        }
    }

    @Test
    fun getAllParsesArrayAndRoundTripsToEntity() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """[{"transaction_id":"L1","amount":100.0,"direction":"out","source":"mpesa",
                "counterparty":"Old Shop","date_time":"2026-08-31T10:00:00+03:00","balance":50.0,
                "cost":0.0,"category":"food","reason":""}]""".trimIndent()
        ))
        val all = client.getAll()
        assertEquals(1, all.size)
        val e = Wire.toEntity(all[0])
        assertEquals("L1", e.txnId)
        assertEquals(Status.SYNCED, e.status)
        assertTrue(e.dateTime > 0)
    }
}
