package com.ngigi.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BudgetAlertTest {

    @Test
    fun crossing80PercentNotifiesAndRecordsLevel1() {
        val d = BudgetAlert.evaluate(spend = 4500.0, limit = 5000.0, prevLevel = 0, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(1, d.newLevel)
        assertTrue(d.shouldNotify)
    }

    @Test
    fun crossing100PercentAfterAlreadyAt80NotifiesAgainAtLevel2() {
        val d = BudgetAlert.evaluate(spend = 5200.0, limit = 5000.0, prevLevel = 1, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(2, d.newLevel)
        assertTrue(d.shouldNotify)
    }

    @Test
    fun stayingOverLimitDoesNotReNotify() {
        val d = BudgetAlert.evaluate(spend = 5300.0, limit = 5000.0, prevLevel = 2, prevMonth = "2026-09", currentMonth = "2026-09")
        assertEquals(2, d.newLevel)
        assertFalse(d.shouldNotify)
    }

    @Test
    fun newMonthResetsLevelWithoutSpuriousNotify() {
        val d = BudgetAlert.evaluate(spend = 1000.0, limit = 5000.0, prevLevel = 2, prevMonth = "2026-08", currentMonth = "2026-09")
        assertEquals(0, d.newLevel)
        assertFalse(d.shouldNotify)
    }

    @Test
    fun noBudgetSetNeverNotifies() {
        val d = BudgetAlert.evaluate(spend = 1000.0, limit = 0.0, prevLevel = 0, prevMonth = null, currentMonth = "2026-09")
        assertEquals(0, d.newLevel)
        assertFalse(d.shouldNotify)
    }
}
