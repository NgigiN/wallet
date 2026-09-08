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

    @Test
    fun budgetBarStateUnderBudget() {
        val s = budgetBarState(spent = 3200.0, limit = 5000.0)
        assertEquals(0.64f, s.fraction, 0.001f)
        assertEquals(null, s.overflowLabel)
        assertEquals(0, s.level)
    }

    @Test
    fun budgetBarStateNearLimit() {
        val s = budgetBarState(spent = 4200.0, limit = 5000.0)
        assertEquals(1, s.level)
    }

    @Test
    fun budgetBarStateOverBudgetCapsFractionAndShowsOverflow() {
        val s = budgetBarState(spent = 6000.0, limit = 5000.0)
        assertEquals(1f, s.fraction, 0.001f)
        assertEquals("120%", s.overflowLabel)
        assertEquals(2, s.level)
    }
}
