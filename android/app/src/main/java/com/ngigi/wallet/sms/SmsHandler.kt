package com.ngigi.wallet.sms

import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.notify.Notifier
import com.ngigi.wallet.parser.Direction
import com.ngigi.wallet.parser.ParseResult
import com.ngigi.wallet.parser.SmsParser

fun interface SyncRequester { fun requestSync() }

class SmsHandler(
    private val dao: TransactionDao,
    private val notifier: Notifier,
    private val sync: SyncRequester,
) {
    suspend fun handle(sender: String, body: String) {
        when (val result = SmsParser.parse(sender, body)) {
            is ParseResult.Ignore -> return
            is ParseResult.Tx -> {
                val isTransfer = result.direction == Direction.TRANSFER
                val rowId = dao.insert(
                    TransactionEntity(
                        txnId = result.txnId, amount = result.amount,
                        direction = result.direction.wire, source = result.source.wire,
                        counterparty = result.counterparty, dateTime = result.dateTimeMillis,
                        balance = result.balance, cost = result.cost,
                        category = if (isTransfer) Categories.TRANSFER else null,
                        reason = null,
                        status = if (isTransfer) Status.TAGGED else Status.UNTAGGED,
                        rawBody = body, createdAt = System.currentTimeMillis(),
                    )
                )
                if (rowId == -1L) return // duplicate delivery
                if (isTransfer) {
                    sync.requestSync()
                } else {
                    // Two most-used categories, padded with defaults until usage data exists.
                    val top = (dao.topCategories().map { it.category } + listOf("food", "travel"))
                        .distinct().take(2)
                    notifier.notifyNewTransaction(rowId, result, top)
                }
            }
            is ParseResult.Failed -> {
                val rowId = dao.insert(
                    TransactionEntity(
                        txnId = "raw-" + body.hashCode().toUInt().toString(16),
                        amount = 0.0, direction = Direction.OUT.wire,
                        source = if (sender.lowercase() == "mpesa") "mpesa" else "airtel",
                        counterparty = "", dateTime = System.currentTimeMillis(),
                        balance = null, cost = 0.0, category = null, reason = null,
                        status = Status.PARSE_FAILED, rawBody = body,
                        createdAt = System.currentTimeMillis(),
                    )
                )
                if (rowId != -1L) notifier.notifyParseFailed(rowId)
            }
        }
    }
}
