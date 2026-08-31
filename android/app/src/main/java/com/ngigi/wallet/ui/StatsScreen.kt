package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.NamedTotal
import com.ngigi.wallet.data.Totals
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class Period { WEEK, MONTH, YEAR }

private fun range(period: Period, ref: LocalDate, zone: ZoneId): Pair<Long, Long> {
    val (start, end) = when (period) {
        Period.WEEK -> ref.with(DayOfWeek.MONDAY).let { it to it.plusDays(7) }
        Period.MONTH -> ref.withDayOfMonth(1).let { it to it.plusMonths(1) }
        Period.YEAR -> ref.withDayOfYear(1).let { it to it.plusYears(1) }
    }
    return start.atStartOfDay(zone).toInstant().toEpochMilli() to
        end.atStartOfDay(zone).toInstant().toEpochMilli() - 1
}

private fun label(period: Period, ref: LocalDate): String = when (period) {
    Period.WEEK -> "Week of " + ref.with(DayOfWeek.MONDAY).format(DateTimeFormatter.ofPattern("d MMM uuuu"))
    Period.MONTH -> ref.format(DateTimeFormatter.ofPattern("MMMM uuuu"))
    Period.YEAR -> ref.year.toString()
}

private fun step(period: Period, ref: LocalDate, dir: Long): LocalDate = when (period) {
    Period.WEEK -> ref.plusWeeks(dir)
    Period.MONTH -> ref.plusMonths(dir)
    Period.YEAR -> ref.plusYears(dir)
}

@Composable
fun StatsScreen(dao: TransactionDao) {
    var period by remember { mutableStateOf(Period.MONTH) }
    var ref by remember { mutableStateOf(LocalDate.now()) }
    var totals by remember { mutableStateOf(Totals(0.0, 0.0)) }
    var cats by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var days by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var biggest by remember { mutableStateOf(emptyList<TransactionEntity>()) }
    var people by remember { mutableStateOf(emptyList<NamedTotal>()) }

    LaunchedEffect(period, ref) {
        val (from, to) = range(period, ref, ZoneId.systemDefault())
        totals = dao.totals(from, to)
        cats = dao.categoryTotals(from, to)
        days = dao.topDays(from, to)
        biggest = dao.biggestExpenses(from, to)
        people = dao.topCounterparties(from, to)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        TabRow(selectedTabIndex = period.ordinal) {
            Period.entries.forEach { p ->
                Tab(selected = period == p, onClick = { period = p; ref = LocalDate.now() },
                    text = { Text(p.name.lowercase().replaceFirstChar { it.uppercase() }) })
            }
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            TextButton({ ref = step(period, ref, -1) }) { Text("◀") }
            Text(label(period, ref), style = MaterialTheme.typography.titleMedium)
            TextButton({ ref = step(period, ref, 1) }) { Text("▶") }
        }
        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            StatCell("In", totals.moneyIn)
            StatCell("Out", totals.moneyOut)
            StatCell("Net", totals.moneyIn - totals.moneyOut)
        }
        Section("By category", cats.map { it.name to it.total })
        Section("Top spending days", days.map { it.name to it.total })
        Section("Biggest expenses", biggest.map { "${it.counterparty} (${it.category ?: "?"})" to it.amount })
        Section("Top counterparties", people.map { it.name to it.total })
    }
}

@Composable
private fun StatCell(label: String, value: Double) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text("Ksh %,.0f".format(value), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun Section(title: String, rows: List<Pair<String, Double>>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (rows.isEmpty()) Text("No data", style = MaterialTheme.typography.bodySmall)
        rows.forEach { (name, total) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(name, Modifier.weight(1f), maxLines = 1)
                Text("Ksh %,.0f".format(total))
            }
        }
    }
}
