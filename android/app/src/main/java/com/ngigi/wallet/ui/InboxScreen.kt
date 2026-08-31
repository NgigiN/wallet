package com.ngigi.wallet.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InboxScreen(dao: TransactionDao, onOpen: (Long) -> Unit) {
    val rows by dao.inbox().collectAsStateWithLifecycle(initialValue = emptyList())
    val fmt = SimpleDateFormat("d MMM, h:mm a", Locale.ENGLISH)

    if (rows.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("All caught up 🎉")
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(rows, key = { it.id }) { row ->
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
