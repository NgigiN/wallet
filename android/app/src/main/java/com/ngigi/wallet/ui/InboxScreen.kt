package com.ngigi.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.Totals
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.ui.theme.LocalWalletPalette
import com.ngigi.wallet.ui.theme.categoryEmoji
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(
    dao: TransactionDao,
    showMessage: (String) -> Unit,
    hidden: Boolean,
    onToggleHidden: () -> Unit,
    onOpen: (Long) -> Unit,
) {
    // null = still loading from Room; emptyList = genuinely nothing to tag.
    val inbox by dao.inbox().collectAsStateWithLifecycle(initialValue = null as List<TransactionEntity>?)
    val recent by dao.recentActivity(30).collectAsStateWithLifecycle(initialValue = null as List<TransactionEntity>?)
    var monthTotals by remember { mutableStateOf<Totals?>(null) }
    val now = System.currentTimeMillis()
    val palette = LocalWalletPalette.current
    val (refreshing, refresh) = rememberServerRefresh(showMessage)

    LaunchedEffect(recent) {
        val zone = ZoneId.systemDefault()
        val start = LocalDate.now().withDayOfMonth(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val end = LocalDate.now().withDayOfMonth(1).plusMonths(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
        monthTotals = dao.totals(start, end)
    }

    Column(Modifier.fillMaxSize()) {
        Canopy {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text("Wallet", style = MaterialTheme.typography.headlineMedium, color = palette.onHero)
                    Text(
                        LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM uuuu", Locale.ENGLISH)),
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.onHeroDim,
                    )
                }
                HideAmountsButton(hidden, onToggleHidden)
            }
            monthTotals?.let { t ->
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CanopyPill("↑ " + Format.kes(t.moneyIn, hidden) + " in", palette.onHeroIn)
                    CanopyPill("↓ " + Format.kes(t.moneyOut, hidden) + " out", palette.onHeroOut)
                }
            }
        }

        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = refresh,
            modifier = Modifier.weight(1f),
        ) {
            when {
                inbox == null || recent == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                inbox!!.isEmpty() && recent!!.isEmpty() -> LazyColumn(Modifier.fillMaxSize()) {
                    item {
                        EmptyState(
                            emoji = "🌱",
                            title = "A fresh start",
                            body = "New M-PESA and AirtelMoney messages land here by themselves — " +
                                "the app keeps listening even when it's closed.",
                            hint = "Not seeing transactions? Check that the SMS permission is granted and " +
                                "battery optimization is off for Wallet. Pull down to sync with the server.",
                        )
                    }
                }

                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp),
                ) {
                    if (inbox!!.isEmpty()) {
                        item {
                            Surface(
                                shape = MaterialTheme.shapes.large,
                                color = MaterialTheme.colorScheme.primaryContainer,
                                modifier = Modifier.fillMaxWidth(),
                            ) {
                                Row(
                                    Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text("✨", fontSize = 20.sp)
                                    Text(
                                        "All caught up — nothing to tag.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    )
                                }
                            }
                        }
                    } else {
                        item {
                            SectionTitle("To tag", inbox!!.size)
                        }
                        items(inbox!!, key = { "inbox-" + it.id }) { row ->
                            InboxCard(row, now) { onOpen(row.id) }
                            Spacer(Modifier.height(10.dp))
                        }
                    }

                    if (recent!!.isNotEmpty()) {
                        item {
                            Spacer(Modifier.height(14.dp))
                            SectionTitle("Recent", null)
                        }
                        item {
                            SectionCard {
                                Column {
                                    recent!!.forEachIndexed { i, row ->
                                        TransactionRow(row, now)
                                        if (i < recent!!.lastIndex) HorizontalDivider(
                                            color = MaterialTheme.colorScheme.outlineVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, count: Int?) {
    Row(
        Modifier.padding(bottom = 10.dp, start = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        count?.let {
            Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.tertiaryContainer) {
                Text(
                    "$it",
                    Modifier.padding(horizontal = 9.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                )
            }
        }
    }
}

@Composable
private fun CanopyPill(text: String, tint: Color) {
    Surface(shape = RoundedCornerShape(50), color = Color.White.copy(alpha = 0.14f)) {
        Text(
            text,
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium,
            color = tint,
        )
    }
}

@Composable
private fun InboxCard(row: TransactionEntity, now: Long, onClick: () -> Unit) {
    val palette = LocalWalletPalette.current
    val failed = row.status == Status.PARSE_FAILED
    Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(
            Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            EmojiAvatar(
                if (failed) "❓" else if (row.syncError != null) categoryEmoji(row.category) else "🧾",
                if (failed) MaterialTheme.colorScheme.error else palette.category(row.category),
            )
            Column(Modifier.weight(1f)) {
                if (failed) {
                    Text("Unreadable SMS", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Tap to enter it by hand",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Text(
                        (if (row.direction == "in") "From " else "To ") + row.counterparty,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                    )
                    Text(
                        row.source.uppercase() + " · " + Format.timeAgo(row.dateTime, now),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                row.syncError?.let {
                    Text(
                        "⚠ " + it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
            if (!failed) {
                Text(
                    (if (row.direction == "in") "+" else "−") + Format.kes(row.amount),
                    style = MaterialTheme.typography.titleMedium,
                    color = if (row.direction == "in") palette.moneyIn else MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}
