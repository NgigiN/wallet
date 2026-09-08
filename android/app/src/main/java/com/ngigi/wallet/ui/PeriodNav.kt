package com.ngigi.wallet.ui

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.WeekFields
import java.util.Locale

enum class Period { WEEK, MONTH, YEAR }

internal fun range(period: Period, ref: LocalDate, zone: ZoneId): Pair<Long, Long> {
    val (start, end) = when (period) {
        Period.WEEK -> ref.with(DayOfWeek.MONDAY).let { it to it.plusDays(7) }
        Period.MONTH -> ref.withDayOfMonth(1).let { it to it.plusMonths(1) }
        Period.YEAR -> ref.withDayOfYear(1).let { it to it.plusYears(1) }
    }
    return start.atStartOfDay(zone).toInstant().toEpochMilli() to
        end.atStartOfDay(zone).toInstant().toEpochMilli() - 1
}

internal fun step(period: Period, ref: LocalDate, dir: Long): LocalDate = when (period) {
    Period.WEEK -> ref.plusWeeks(dir)
    Period.MONTH -> ref.plusMonths(dir)
    Period.YEAR -> ref.plusYears(dir)
}

private val monthDay = DateTimeFormatter.ofPattern("MMM d", Locale.ENGLISH)

internal fun isCurrentWeek(ref: LocalDate, today: LocalDate = LocalDate.now()): Boolean =
    ref.get(WeekFields.ISO.weekBasedYear()) == today.get(WeekFields.ISO.weekBasedYear()) &&
        ref.get(WeekFields.ISO.weekOfWeekBasedYear()) == today.get(WeekFields.ISO.weekOfWeekBasedYear())

internal fun label(period: Period, ref: LocalDate, today: LocalDate = LocalDate.now()): String = when (period) {
    Period.WEEK -> {
        val week = ref.get(WeekFields.ISO.weekOfWeekBasedYear())
        val monday = ref.with(DayOfWeek.MONDAY)
        val sunday = monday.plusDays(6)
        val dateRange = if (monday.month == sunday.month) {
            "${monday.format(monthDay)}–${sunday.dayOfMonth}"
        } else {
            "${monday.format(monthDay)}–${sunday.format(monthDay)}"
        }
        val suffix = if (isCurrentWeek(ref, today)) " (so far)" else ""
        "Week $week · $dateRange$suffix"
    }
    Period.MONTH -> ref.format(DateTimeFormatter.ofPattern("MMMM uuuu", Locale.ENGLISH))
    Period.YEAR -> ref.year.toString()
}

/** Newest-first reference dates for [period], from today back to the period containing [earliest]. */
internal fun periodsInRange(period: Period, earliest: LocalDate, today: LocalDate = LocalDate.now()): List<LocalDate> {
    if (earliest.isAfter(today)) return listOf(today)
    val result = mutableListOf<LocalDate>()
    var cursor = today
    while (true) {
        result.add(cursor)
        val boundaryStart = when (period) {
            Period.WEEK -> cursor.with(DayOfWeek.MONDAY)
            Period.MONTH -> cursor.withDayOfMonth(1)
            Period.YEAR -> cursor.withDayOfYear(1)
        }
        if (!boundaryStart.isAfter(earliest)) break
        cursor = step(period, cursor, -1)
    }
    return result
}
