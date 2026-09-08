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
import androidx.compose.material3.Text
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

data class CategoryMover(val category: String, val current: Double, val previous: Double, val percentChange: Int?, val isNew: Boolean)

internal suspend fun categoryMovers(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, limit: Int = 3): List<CategoryMover> {
    val (from, to) = range(period, ref, zone)
    val (prevFrom, prevTo) = range(period, step(period, ref, -1), zone)
    val current = dao.categoryTotals(from, to).associate { it.name to it.total }
    val previous = dao.categoryTotals(prevFrom, prevTo).associate { it.name to it.total }
    val categories = current.keys + previous.keys
    return categories.map { cat ->
        val cur = current[cat] ?: 0.0
        val prev = previous[cat] ?: 0.0
        val isNew = prev == 0.0 && cur > 0.0
        val pct = if (prev > 0.0) Math.round((cur - prev) / prev * 100).toInt() else null
        CategoryMover(cat, cur, prev, pct, isNew)
    }.sortedByDescending { it.percentChange?.let { p -> kotlin.math.abs(p) } ?: Int.MAX_VALUE }
        .take(limit)
}

internal fun paceProjection(spentSoFar: Double, periodStart: Long, periodEnd: Long, now: Long): Double? {
    if (now < periodStart || now >= periodEnd) return null
    val elapsedFraction = (now - periodStart).toDouble() / (periodEnd - periodStart).toDouble()
    if (elapsedFraction <= 0.0) return null
    return spentSoFar / elapsedFraction
}

@Composable
fun ReviewContent(dao: TransactionDao, period: Period, ref: LocalDate, zone: ZoneId, onRefChange: (LocalDate) -> Unit) {
    var series by remember { mutableStateOf<List<TrendPoint>>(emptyList()) }
    var movers by remember { mutableStateOf<List<CategoryMover>>(emptyList()) }
    LaunchedEffect(period, ref) {
        series = trendSeries(dao, period, ref, count = 10, zone = zone)
        movers = categoryMovers(dao, period, ref, zone)
    }
    val pace = remember(period, ref, series) {
        val (from, to) = range(period, ref, zone)
        val now = System.currentTimeMillis()
        val spentSoFar = series.lastOrNull { it.ref == ref }?.moneyOut
        if (spentSoFar != null) paceProjection(spentSoFar, from, to, now) else null
    }

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
            if (movers.isNotEmpty()) {
                SectionCard("Category movers") {
                    movers.forEach { m ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(m.category.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodyMedium)
                            Text(
                                if (m.isNew) "new" else "${if ((m.percentChange ?: 0) >= 0) "↑" else "↓"}${kotlin.math.abs(m.percentChange ?: 0)}%",
                                style = MaterialTheme.typography.titleSmall,
                            )
                        }
                    }
                }
            }
            pace?.let {
                SectionCard("Pace") {
                    Text(
                        "At this rate, ${Format.kes(it)} by the end of this ${period.name.lowercase()}",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }
    }
}
