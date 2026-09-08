package com.ngigi.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.ui.theme.LocalWalletPalette
import java.time.LocalDate
import java.time.ZoneId

enum class StatsTab { PERIOD, REVIEW }

data class TrendPoint(val label: String, val ref: LocalDate, val moneyOut: Double, val savingsRate: Float?)

internal fun savingsRate(moneyIn: Double, moneyOut: Double): Float? =
    if (moneyIn <= 0.0) null else ((moneyIn - moneyOut) / moneyIn).toFloat()

internal suspend fun trendSeries(dao: TransactionDao, period: Period, ref: LocalDate, count: Int, zone: ZoneId): List<TrendPoint> {
    val points = mutableListOf<TrendPoint>()
    var cursor = ref
    repeat(count) {
        val (from, to) = range(period, cursor, zone)
        val t = dao.totals(from, to)
        points.add(TrendPoint(label(period, cursor), cursor, t.moneyOut, savingsRate(t.moneyIn, t.moneyOut)))
        cursor = step(period, cursor, -1)
    }
    return points.reversed()
}

@Composable
fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit) {
    var series by remember { mutableStateOf<List<TrendPoint>>(emptyList()) }
    LaunchedEffect(period, ref) { series = trendSeries(dao, period, ref, count = 10, zone = zone) }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (series.all { it.moneyOut == 0.0 }) {
            EmptyState(
                emoji = "📈",
                title = "Nothing to review yet",
                body = "Once you've tagged a few transactions, trends and insights show up here.",
            )
        } else {
            SectionCard("Spend trend") {
                val max = series.maxOf { it.moneyOut }.coerceAtLeast(1.0)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    series.forEach { p ->
                        Column(Modifier.weight(1f).clickable { onRefChange(p.ref) }, horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height((60 * (p.moneyOut / max)).dp.coerceAtLeast(2.dp))
                                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(2.dp)),
                            )
                        }
                    }
                }
            }
            SectionCard("Savings rate") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    series.forEach { p ->
                        val rate = p.savingsRate
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .height(if (rate == null) 2.dp else (40 * kotlin.math.abs(rate)).dp.coerceIn(2.dp, 40.dp))
                                    .background(
                                        if (rate != null && rate < 0) MaterialTheme.colorScheme.error else LocalWalletPalette.current.moneyIn,
                                        RoundedCornerShape(2.dp),
                                    ),
                            )
                        }
                    }
                }
            }
        }
    }
}
