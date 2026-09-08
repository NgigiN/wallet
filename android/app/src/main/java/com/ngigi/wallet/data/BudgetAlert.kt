package com.ngigi.wallet.data

data class BudgetAlertDecision(val newLevel: Int, val shouldNotify: Boolean)

/** 0 = under 80%, 1 = crossed 80%, 2 = crossed 100%. */
object BudgetAlert {
    fun evaluate(spend: Double, limit: Double, prevLevel: Int, prevMonth: String?, currentMonth: String): BudgetAlertDecision {
        val baseline = if (prevMonth == currentMonth) prevLevel else 0
        val reached = when {
            limit <= 0.0 -> 0
            spend >= limit -> 2
            spend >= 0.8 * limit -> 1
            else -> 0
        }
        val newLevel = maxOf(baseline, reached)
        return BudgetAlertDecision(newLevel = newLevel, shouldNotify = reached > baseline)
    }
}
