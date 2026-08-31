package com.ngigi.wallet.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InboxScreen(dao: TransactionDao, onOpen: (Long) -> Unit) {
    // null = still loading from Room; emptyList = genuinely nothing to tag.
    val rows by dao.inbox().collectAsStateWithLifecycle(initialValue = null as List<TransactionEntity>?)
    val fmt = SimpleDateFormat("d MMM, h:mm a", Locale.ENGLISH)

    when {
        rows == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        rows!!.isEmpty() -> Column(
            Modifier.fillMaxSize().padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("All caught up 🎉", style = MaterialTheme.typography.titleLarge)
            Text(
                "New M-PESA and AirtelMoney messages appear here automatically — " +
                    "the app keeps listening even when it's closed.",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                "Not seeing transactions? Check that the SMS permission is granted " +
                    "and battery optimization is off for Wallet.",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        else -> LazyColumn(Modifier.fillMaxSize()) {
            items(rows!!, key = { it.id }) { row ->
                ListItem(
                    modifier = Modifier.clickable { onOpen(row.id) },
                    headlineContent = {
                        Text(
                            when (row.status) {
                                Status.PARSE_FAILED -> "Unreadable SMS — tap to enter"
                                else -> "Ksh %,.2f %s %s".format(row.amount, if (row.direction == "in") "from" else "to", row.counterparty)
                            }
                        )
                    },
                    supportingContent = {
                        val err = row.syncError?.let { " · ⚠ $it" } ?: ""
                        Text("${row.source.uppercase()} · ${fmt.format(Date(row.dateTime))}$err")
                    },
                )
                HorizontalDivider()
            }
        }
    }
}
