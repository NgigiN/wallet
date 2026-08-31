package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** onSave(amount, direction, counterparty, category, reason) — amount/direction/counterparty
 *  only differ from the row for PARSE_FAILED manual entry. */
@Composable
fun TagScreen(row: TransactionEntity, onSave: (Double, String, String, String, String?) -> Unit) {
    val manual = row.status == Status.PARSE_FAILED
    var amount by remember { mutableStateOf(if (manual) "" else row.amount.toString()) }
    var direction by remember { mutableStateOf(row.direction) }
    var counterparty by remember { mutableStateOf(row.counterparty) }
    var category by remember { mutableStateOf(row.category ?: "") }
    var reason by remember { mutableStateOf(row.reason ?: "") }
    val fmt = remember { SimpleDateFormat("EEE d MMM, h:mm a", Locale.ENGLISH) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (manual) {
            Text("Couldn't parse this SMS — enter it manually:", style = MaterialTheme.typography.titleMedium)
            Text(row.rawBody, style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(amount, { amount = it }, label = { Text("Amount (Ksh)") })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("out", "in", "transfer").forEach { d ->
                    FilterChip(selected = direction == d, onClick = { direction = d }, label = { Text(d) })
                }
            }
            OutlinedTextField(counterparty, { counterparty = it }, label = { Text("Counterparty") })
        } else {
            Text(
                "Ksh %,.2f %s %s".format(row.amount, if (row.direction == "in") "from" else "to", row.counterparty),
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                "${if (row.direction == "in") "Money IN" else "Money OUT"} · ${row.source.uppercase()} · ${fmt.format(Date(row.dateTime))}",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Text("Category", style = MaterialTheme.typography.titleMedium)
        LazyVerticalGrid(
            columns = GridCells.Fixed(3), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(120.dp)
        ) {
            items(Categories.ALL) { cat ->
                FilterChip(selected = category == cat, onClick = { category = cat },
                    label = { Text(cat, Modifier.fillMaxWidth(), maxLines = 1) })
            }
        }

        OutlinedTextField(reason, { reason = it }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth())

        Button(
            onClick = {
                onSave(amount.toDoubleOrNull() ?: row.amount, direction, counterparty,
                    category, reason.ifBlank { null })
            },
            enabled = category.isNotBlank() && (!manual || amount.toDoubleOrNull() != null),
            modifier = Modifier.align(Alignment.End)
        ) { Text("Save") }
    }
}
