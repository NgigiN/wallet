package com.ngigi.wallet.parser

enum class Direction(val wire: String) { IN("in"), OUT("out"), TRANSFER("transfer") }
enum class Source(val wire: String) { MPESA("mpesa"), AIRTEL("airtel") }

sealed interface ParseResult {
    data class Tx(
        val txnId: String,
        val amount: Double,
        val direction: Direction,
        val source: Source,
        val counterparty: String,
        val dateTimeMillis: Long,
        val balance: Double?,
        val cost: Double,
    ) : ParseResult

    data object Ignore : ParseResult

    data class Failed(val reason: String) : ParseResult
}
