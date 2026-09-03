package com.ngigi.wallet.ui

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import kotlin.math.abs

object Format {
    /** "Ksh 2,340" for whole amounts, "Ksh 2,340.50" otherwise, "−Ksh 500" when negative. */
    fun kes(amount: Double): String {
        val a = abs(amount)
        val body = if (a % 1.0 == 0.0) "%,.0f".format(Locale.ENGLISH, a)
        else "%,.2f".format(Locale.ENGLISH, a)
        return (if (amount < 0) "−" else "") + "Ksh " + body
    }

    /** Shoulder-surfing mode: a fixed-width mask that leaks neither digits, sign, nor magnitude. */
    fun kes(amount: Double, hidden: Boolean): String = if (hidden) "Ksh ••••" else kes(amount)

    private val weekday = DateTimeFormatter.ofPattern("EEE", Locale.ENGLISH)
    private val dayMonth = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
    private val weekdayDayMonth = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)

    fun timeAgo(then: Long, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        val diff = now - then
        return when {
            diff < 60_000 -> "Just now"
            diff < 3_600_000 -> "${diff / 60_000}m ago"
            diff < 86_400_000 -> "${diff / 3_600_000}h ago"
            diff < 7 * 86_400_000 -> weekday.format(Instant.ofEpochMilli(then).atZone(zone))
            else -> dayMonth.format(Instant.ofEpochMilli(then).atZone(zone))
        }
    }

    /** "2026-09-01" → "Tue 1 Sep"; anything unparseable comes back unchanged. */
    fun dayLabel(isoDate: String): String = try {
        weekdayDayMonth.format(LocalDate.parse(isoDate))
    } catch (e: DateTimeParseException) {
        isoDate
    }
}
