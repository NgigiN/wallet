package com.ngigi.wallet.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

object Status {
    const val UNTAGGED = "UNTAGGED"
    const val TAGGED = "TAGGED"
    const val SYNCED = "SYNCED"
    const val PARSE_FAILED = "PARSE_FAILED"
}

@Entity(tableName = "transactions", indices = [Index(value = ["txn_id"], unique = true)])
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "txn_id") val txnId: String,
    val amount: Double,
    val direction: String,      // "in" | "out" | "transfer"
    val source: String,         // "mpesa" | "airtel"
    val counterparty: String,
    @ColumnInfo(name = "date_time") val dateTime: Long,   // epoch millis
    val balance: Double?,
    val cost: Double,
    val category: String?,
    val reason: String?,
    val status: String,
    @ColumnInfo(name = "sync_error") val syncError: String? = null,
    @ColumnInfo(name = "raw_body") val rawBody: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
