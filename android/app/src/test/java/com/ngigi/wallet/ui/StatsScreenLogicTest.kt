package com.ngigi.wallet.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class StatsScreenLogicTest {

    @Test
    fun comparisonPercentShowsUpArrowWhenSpendIncreased() {
        assertEquals("↑8%", comparisonPercent(1080.0, 1000.0))
    }

    @Test
    fun comparisonPercentShowsDownArrowWhenSpendDecreased() {
        assertEquals("↓8%", comparisonPercent(920.0, 1000.0))
    }

    @Test
    fun comparisonPercentIsNewWhenPreviousPeriodHadNoSpend() {
        assertEquals("new", comparisonPercent(500.0, 0.0))
        assertEquals("new", comparisonPercent(0.0, 0.0))
    }
}
