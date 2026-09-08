package com.ngigi.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronLeft
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.NamedTotal
import com.ngigi.wallet.data.Totals
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.ui.theme.LocalWalletPalette
import com.ngigi.wallet.ui.theme.categoryEmoji
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

internal fun comparisonPercent(current: Double, previous: Double): String {
    if (previous <= 0.0) return "new"
    val pct = Math.round((current - previous) / previous * 100).toInt()
    val arrow = if (pct >= 0) "↑" else "↓"
    return "$arrow${kotlin.math.abs(pct)}%"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsScreen(
    dao: TransactionDao,
    showMessage: (String) -> Unit,
    hidden: Boolean,
    onToggleHidden: () -> Unit,
) {
    var period by remember { mutableStateOf(Period.MONTH) }
    var ref by remember { mutableStateOf(LocalDate.now()) }
    var totals by remember { mutableStateOf(Totals(0.0, 0.0)) }
    var prevTotals by remember { mutableStateOf(Totals(0.0, 0.0)) }
    var cats by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var days by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var biggest by remember { mutableStateOf(emptyList<TransactionEntity>()) }
    var people by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var loading by remember { mutableStateOf(true) }
    var refreshTick by remember { mutableIntStateOf(0) }
    var showJumpSheet by remember { mutableStateOf(false) }
    var earliest by remember { mutableStateOf<LocalDate?>(null) }
    val palette = LocalWalletPalette.current
    val now = System.currentTimeMillis()

    LaunchedEffect(Unit) {
        earliest = dao.earliestTransactionDate()
            ?.let { Instant.ofEpochMilli(it).atZone(ZoneId.systemDefault()).toLocalDate() }
    }

    val (refreshing, refresh) = rememberServerRefresh { msg ->
        refreshTick++
        showMessage(msg)
    }

    LaunchedEffect(period, ref, refreshTick) {
        loading = true
        val (from, to) = range(period, ref, ZoneId.systemDefault())
        totals = dao.totals(from, to)
        val (prevFrom, prevTo) = range(period, step(period, ref, -1), ZoneId.systemDefault())
        prevTotals = dao.totals(prevFrom, prevTo)
        cats = dao.categoryTotals(from, to)
        days = dao.topDays(from, to)
        biggest = dao.biggestExpenses(from, to)
        people = dao.topCounterparties(from, to)
        loading = false
    }
    val empty = !loading && totals.moneyIn == 0.0 && totals.moneyOut == 0.0 &&
        cats.isEmpty() && biggest.isEmpty()
    val net = totals.moneyIn - totals.moneyOut

    Column(Modifier.fillMaxSize()) {
        Canopy {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        label(period, ref),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onHeroDim,
                        modifier = Modifier.clickable { showJumpSheet = true },
                    )
                    Text(
                        Format.kes(net, hidden),
                        style = MaterialTheme.typography.displaySmall,
                        color = if (net >= 0 || hidden) palette.onHero else palette.onHeroOut,
                    )
                    Text(
                        if (hidden) "net" else "net " + (if (net >= 0) "saved" else "spent"),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onHeroDim,
                    )
                    if (!hidden) {
                        val cmp = comparisonPercent(totals.moneyOut, prevTotals.moneyOut)
                        Text(
                            if (cmp == "new") "new vs last ${period.name.lowercase()}" else "$cmp vs last ${period.name.lowercase()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (cmp.startsWith("↑")) palette.onHeroOut else palette.onHeroIn,
                        )
                    }
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    HeroStat("in", Format.kes(totals.moneyIn, hidden), palette.onHeroIn)
                    HeroStat("out", Format.kes(totals.moneyOut, hidden), palette.onHeroOut)
                }
                HideAmountsButton(hidden, onToggleHidden)
            }
        }

        PullToRefreshBox(isRefreshing = refreshing, onRefresh = refresh, modifier = Modifier.weight(1f)) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
                        Period.entries.forEachIndexed { i, p ->
                            SegmentedButton(
                                selected = period == p,
                                onClick = { period = p; ref = LocalDate.now() },
                                shape = SegmentedButtonDefaults.itemShape(index = i, count = Period.entries.size),
                            ) {
                                Text(p.name.lowercase().replaceFirstChar { it.uppercase() })
                            }
                        }
                    }
                    IconButton({ ref = step(period, ref, -1) }) {
                        Icon(Icons.Rounded.ChevronLeft, contentDescription = "Earlier ${period.name.lowercase()}")
                    }
                    IconButton({ ref = step(period, ref, 1) }) {
                        Icon(Icons.Rounded.ChevronRight, contentDescription = "Later ${period.name.lowercase()}")
                    }
                }

                when {
                    loading -> Box(Modifier.fillMaxWidth().padding(vertical = 48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }

                    empty -> EmptyState(
                        emoji = "🍃",
                        title = "Nothing here yet",
                        body = "No transactions in this period.",
                        hint = "Tag messages from the Inbox, or pull down to sync your history from the server.",
                    )

                    else -> {
                        if (cats.isNotEmpty()) {
                            SectionCard("Where it went") {
                                val totalOut = cats.sumOf { it.total }.coerceAtLeast(1.0)
                                cats.forEach { c ->
                                    CategoryBarRow(
                                        emoji = categoryEmoji(c.name),
                                        name = c.name,
                                        amount = c.total,
                                        fraction = (c.total / totalOut).toFloat(),
                                        color = palette.category(c.name),
                                    )
                                }
                            }
                        }
                        if (days.isNotEmpty()) {
                            SectionCard("Top spending days") {
                                days.forEach { d -> PlainStatRow(Format.dayLabel(d.name), Format.kes(d.total)) }
                            }
                        }
                        if (biggest.isNotEmpty()) {
                            SectionCard("Biggest expenses") {
                                biggest.forEach { TransactionRow(it, now) }
                            }
                        }
                        if (people.isNotEmpty()) {
                            SectionCard("Top counterparties") {
                                people.forEach { p -> PlainStatRow(p.name, Format.kes(p.total)) }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }
            }
        }
    }

    if (showJumpSheet) {
        PeriodJumpSheet(
            period = period,
            periods = periodsInRange(period, earliest ?: LocalDate.now()),
            onSelect = { ref = it; showJumpSheet = false },
            onDismiss = { showJumpSheet = false },
        )
    }
}

@Composable
private fun HeroStat(label: String, value: String, tint: Color) {
    Column(horizontalAlignment = Alignment.End) {
        Text(value, style = MaterialTheme.typography.titleSmall, color = tint)
        Text(label, style = MaterialTheme.typography.labelSmall, color = LocalWalletPalette.current.onHeroDim)
    }
}

@Composable
private fun PlainStatRow(name: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
        Text(value, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
private fun CategoryBarRow(emoji: String, name: String, amount: Double, fraction: Float, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, Modifier.width(28.dp))
            Text(name, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
            Text(Format.kes(amount), style = MaterialTheme.typography.titleSmall)
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(8.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp)),
        ) {
            Box(
                Modifier
                    .fillMaxWidth(fraction.coerceIn(0.02f, 1f))
                    .height(8.dp)
                    .background(color, RoundedCornerShape(4.dp)),
            )
        }
    }
}
