package com.ngigi.wallet.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class PeriodNavTest {

    @Test
    fun weekLabelShowsIsoWeekNumberAndDateRange() {
        // 2026-09-08 is a Tuesday in ISO week 37 (Mon Sep 7 - Sun Sep 13).
        val ref = LocalDate.of(2026, 9, 8)
        assertEquals(
            "Week 37 · Sep 7–13",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 20)),
        )
    }

    @Test
    fun weekLabelMarksTheCurrentWeekAsSoFar() {
        val ref = LocalDate.of(2026, 9, 8)
        assertEquals(
            "Week 37 · Sep 7–13 (so far)",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 8)),
        )
    }

    @Test
    fun weekLabelSpanningTwoMonths() {
        // 2026-08-31 is a Monday, its ISO week runs Aug 31 - Sep 6.
        val ref = LocalDate.of(2026, 8, 31)
        assertEquals(
            "Week 36 · Aug 31–Sep 6",
            label(Period.WEEK, ref, today = LocalDate.of(2026, 9, 20)),
        )
    }

    @Test
    fun monthAndYearLabelsUnchanged() {
        assertEquals("September 2026", label(Period.MONTH, LocalDate.of(2026, 9, 8)))
        assertEquals("2026", label(Period.YEAR, LocalDate.of(2026, 9, 8)))
    }

    @Test
    fun periodsInRangeStopsAtTheEarliestTransactionsMonth() {
        val months = periodsInRange(
            Period.MONTH,
            earliest = LocalDate.of(2026, 7, 15),
            today = LocalDate.of(2026, 9, 8),
        )
        assertEquals(listOf(9, 8, 7), months.map { it.monthValue })
    }

    @Test
    fun periodsInRangeReturnsJustTodayWhenEarliestIsInTheFuture() {
        val months = periodsInRange(
            Period.MONTH,
            earliest = LocalDate.of(2027, 1, 1),
            today = LocalDate.of(2026, 9, 8),
        )
        assertEquals(listOf(LocalDate.of(2026, 9, 8)), months)
    }
}
