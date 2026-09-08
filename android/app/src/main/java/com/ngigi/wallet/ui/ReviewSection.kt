package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.TransactionDao
import java.time.LocalDate
import java.time.ZoneId

enum class StatsTab { PERIOD, REVIEW }

@Composable
fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        // Trend strip, savings rate, category movers, pace projection, and the
        // calendar heatmap are added in Tasks 12-16.
        EmptyState(
            emoji = "📈",
            title = "Nothing to review yet",
            body = "Once you've tagged a few transactions, trends and insights show up here.",
        )
    }
}
