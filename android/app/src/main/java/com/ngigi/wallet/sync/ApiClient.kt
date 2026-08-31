package com.ngigi.wallet.sync

import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Serializable
data class ApiTransaction(
    @SerialName("transaction_id") val transactionId: String,
    val amount: Double,
    val direction: String,
    val source: String,
    val counterparty: String,
    @SerialName("date_time") val dateTime: String,
    val balance: Double,
    val cost: Double,
    val category: String,
    val reason: String,
)

enum class PostResult { CREATED, DUPLICATE, CLIENT_ERROR, SERVER_ERROR }

object Wire {
    private val json = Json { ignoreUnknownKeys = true }

    fun toApi(e: TransactionEntity): ApiTransaction = ApiTransaction(
        transactionId = e.txnId, amount = e.amount, direction = e.direction, source = e.source,
        counterparty = e.counterparty,
        dateTime = OffsetDateTime.ofInstant(Instant.ofEpochMilli(e.dateTime), ZoneId.systemDefault())
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
        balance = e.balance ?: 0.0, cost = e.cost,
        category = e.category ?: "", reason = e.reason ?: "",
    )

    fun toEntity(a: ApiTransaction): TransactionEntity = TransactionEntity(
        txnId = a.transactionId, amount = a.amount, direction = a.direction, source = a.source,
        counterparty = a.counterparty,
        dateTime = OffsetDateTime.parse(a.dateTime).toInstant().toEpochMilli(),
        balance = a.balance, cost = a.cost,
        category = a.category.ifBlank { null }, reason = a.reason.ifBlank { null },
        status = Status.SYNCED, rawBody = "", createdAt = System.currentTimeMillis(),
    )

    fun encode(tx: ApiTransaction): String = json.encodeToString(ApiTransaction.serializer(), tx)

    fun decodeList(body: String): List<ApiTransaction> =
        json.decodeFromString(ListSerializer(ApiTransaction.serializer()), body)
}

class ApiClient(
    private val baseUrl: String,
    private val token: String,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val jsonType = "application/json".toMediaType()

    fun post(tx: ApiTransaction): PostResult {
        val req = Request.Builder()
            .url("$baseUrl/api/transactions")
            .header("Authorization", "Bearer $token")
            .post(Wire.encode(tx).toRequestBody(jsonType))
            .build()
        client.newCall(req).execute().use { resp ->
            return when {
                resp.code == 201 -> PostResult.CREATED
                resp.code == 200 -> PostResult.DUPLICATE
                resp.code in 400..499 -> PostResult.CLIENT_ERROR
                else -> PostResult.SERVER_ERROR
            }
        }
    }

    fun getAll(): List<ApiTransaction> {
        val req = Request.Builder()
            .url("$baseUrl/api/transactions")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("GET /api/transactions returned ${resp.code}")
            return Wire.decodeList(resp.body!!.string())
        }
    }
}
