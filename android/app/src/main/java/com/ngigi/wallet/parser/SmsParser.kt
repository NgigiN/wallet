package com.ngigi.wallet.parser

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object SmsParser {
    private const val MONEY = """Ksh[\d,]+(?:\.\d+)?"""

    private val mpesaOut = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*($MONEY)\s+(?:sent|paid)\s+to\s+(.*?)\s*\.?\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*New\s+(?:M-PESA|business)\s+balance\s+is\s+($MONEY)\.\s*Transaction\s+cost,?\s*($MONEY)""",
        RegexOption.IGNORE_CASE
    )

    private val mpesaIn = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*You have received\s+($MONEY)\s+from\s+(.+?)\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*New\s+(?:M-PESA|business)\s+balance\s+is\s+($MONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaWithdraw = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*Withdraw\s+($MONEY)\s+from\s+(.+?)\s+New\s+M-PESA\s+balance\s+is\s+($MONEY)\.?\s*Transaction\s+cost,?\s*($MONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaTransfer = Regex(
        """^(\w+)\s+Confirmed[.,]?\s*($MONEY)\s+has been moved from your (?:M-PESA|Pochi) account to your (M-PESA|Pochi) account on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaBalance = Regex("""New\s+M-PESA\s+balance\s+is\s+($MONEY)""", RegexOption.IGNORE_CASE)
    private val mpesaCost = Regex("""Transaction\s+cost,?\s*($MONEY)""", RegexOption.IGNORE_CASE)

    private val mpesaDateTime = DateTimeFormatter.ofPattern("d/M/uu h:mm a", Locale.ENGLISH)

    fun parse(sender: String, body: String, zone: ZoneId = ZoneId.systemDefault()): ParseResult {
        return when (sender.lowercase()) {
            "mpesa" -> parseMpesa(body.trim(), zone)
            "airtelmoney" -> parseAirtel(body.trim(), zone)
            else -> ParseResult.Ignore
        }
    }

    private fun parseMpesa(body: String, zone: ZoneId): ParseResult {
        mpesaOut.find(body)?.let { m ->
            val (id, amount, who, date, time, balance, cost) = m.destructured
            return ParseResult.Tx(
                txnId = id,
                amount = money(amount),
                direction = Direction.OUT,
                source = Source.MPESA,
                counterparty = cleanName(who),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(),
                balance = money(balance),
                cost = money(cost),
            )
        }
        mpesaIn.find(body)?.let { m ->
            val (id, amount, who, date, time, balance) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.IN,
                source = Source.MPESA, counterparty = cleanName(who),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(),
                balance = money(balance), cost = 0.0,
            )
        }
        mpesaWithdraw.find(body)?.let { m ->
            val (id, date, time, amount, agent, balance, cost) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.OUT,
                source = Source.MPESA, counterparty = cleanName(agent),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(),
                balance = money(balance), cost = money(cost),
            )
        }
        mpesaTransfer.find(body)?.let { m ->
            val (id, amount, target, date, time) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.TRANSFER,
                source = Source.MPESA, counterparty = "Pochi transfer ($target)",
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(),
                balance = mpesaBalance.find(body)?.groupValues?.get(1)?.let(::money),
                cost = mpesaCost.find(body)?.groupValues?.get(1)?.let(::money) ?: 0.0,
            )
        }
        return classifyUnmatchedMpesa(body)
    }

    private fun classifyUnmatchedMpesa(body: String): ParseResult =
        if (body.contains("confirmed", ignoreCase = true)) {
            ParseResult.Failed("unrecognized M-PESA transaction format")
        } else {
            ParseResult.Ignore
        }

    // Implemented in a later task.
    private fun parseAirtel(body: String, zone: ZoneId): ParseResult = ParseResult.Ignore

    internal fun money(raw: String): Double =
        raw.replace("Ksh", "", ignoreCase = true).replace(",", "").trim().toDouble()

    internal fun cleanName(raw: String): String = raw
        .replace(Regex("""\s+in\s+\w+\s+via\s+\w+$""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""\s+\d{2,4}\*+\d{2,4}$"""), "")
        .trim().trimEnd('.')
        .replace(Regex("""\s+"""), " ")

    internal fun mpesaMillis(date: String, time: String, zone: ZoneId): Long? = try {
        val t = time.uppercase(Locale.ENGLISH).replace(Regex("""(\d)([AP]M)"""), "$1 $2")
        LocalDateTime.parse("$date $t", mpesaDateTime).atZone(zone).toInstant().toEpochMilli()
    } catch (e: Exception) {
        null
    }

    private fun failedDate() = ParseResult.Failed("unparseable date/time")
}
