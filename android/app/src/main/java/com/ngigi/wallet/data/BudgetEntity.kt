package com.ngigi.wallet.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "budgets")
data class BudgetEntity(
    @PrimaryKey val category: String,
    @ColumnInfo(name = "monthly_limit") val monthlyLimit: Double,
    @ColumnInfo(name = "last_alert_level") val lastAlertLevel: Int = 0,
    @ColumnInfo(name = "last_alert_month") val lastAlertMonth: String? = null,
)
