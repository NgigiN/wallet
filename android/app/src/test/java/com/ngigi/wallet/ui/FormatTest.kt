package com.ngigi.wallet.ui

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneOffset

class FormatTest {

    @Test
    fun wholeAmountsDropDecimals() {
        assertEquals("Ksh 2,340", Format.kes(2340.0))
        assertEquals("Ksh 1,234,567", Format.kes(1234567.0))
        assertEquals("Ksh 0", Format.kes(0.0))
    }

    @Test
    fun fractionalAmountsKeepTwoDecimals() {
        assertEquals("Ksh 2,340.50", Format.kes(2340.5))
        assertEquals("Ksh 19.99", Format.kes(19.99))
    }

    @Test
    fun negativeAmountsUseMinusSign() {
        assertEquals("−Ksh 500", Format.kes(-500.0))
    }

    @Test
    fun hiddenAmountsLeakNoDigitsSignOrMagnitude() {
        assertEquals("Ksh ••••", Format.kes(2340.0, hidden = true))
        assertEquals("Ksh ••••", Format.kes(-500.0, hidden = true))
        assertEquals("Ksh ••••", Format.kes(1234567.89, hidden = true))
        assertEquals("Ksh 2,340", Format.kes(2340.0, hidden = false))
    }

    // Anchor: 2026-09-03T12:00:00Z, a Thursday.
    private val now = 1788436800000L

    @Test
    fun timeAgoWithinTheHourIsMinutes() {
        assertEquals("Just now", Format.timeAgo(now - 30_000, now, ZoneOffset.UTC))
        assertEquals("5m ago", Format.timeAgo(now - 5 * 60_000, now, ZoneOffset.UTC))
    }

    @Test
    fun timeAgoWithinTheDayIsHours() {
        assertEquals("3h ago", Format.timeAgo(now - 3 * 3_600_000, now, ZoneOffset.UTC))
    }

    @Test
    fun timeAgoWithinTheWeekIsWeekday() {
        assertEquals("Tue", Format.timeAgo(now - 2 * 86_400_000, now, ZoneOffset.UTC))
    }

    @Test
    fun timeAgoOlderIsDayAndMonth() {
        assertEquals("4 Aug", Format.timeAgo(now - 30L * 86_400_000, now, ZoneOffset.UTC))
    }

    @Test
    fun dayLabelReadsAsWeekdayDayMonth() {
        assertEquals("Tue 1 Sep", Format.dayLabel("2026-09-01"))
        assertEquals("Mon 31 Aug", Format.dayLabel("2026-08-31"))
    }

    @Test
    fun dayLabelPassesThroughUnparseableInput() {
        assertEquals("not-a-date", Format.dayLabel("not-a-date"))
    }
}
