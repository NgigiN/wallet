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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.ui.theme.LocalWalletPalette
import com.ngigi.wallet.ui.theme.categoryEmoji
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
    val palette = LocalWalletPalette.current

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (manual) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                DirectionBadge("Unreadable SMS", MaterialTheme.colorScheme.error)
                Text("Enter it by hand", style = MaterialTheme.typography.headlineSmall)
                Surface(
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        row.rawBody,
                        Modifier.padding(14.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                OutlinedTextField(
                    amount, { amount = it },
                    label = { Text("Amount (Ksh)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("out", "in", "transfer").forEach { d ->
                        FilterChip(selected = direction == d, onClick = { direction = d }, label = { Text(d) })
                    }
                }
                OutlinedTextField(
                    counterparty, { counterparty = it },
                    label = { Text("Counterparty") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                )
            }
        } else {
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Spacer(Modifier.height(4.dp))
                if (row.direction == "in") DirectionBadge("Money in", palette.moneyIn)
                else DirectionBadge("Money out", palette.moneyOut)
                Text(
                    Format.kes(row.amount),
                    style = MaterialTheme.typography.displayMedium,
                    textAlign = TextAlign.Center,
                )
                Text(
                    (if (row.direction == "in") "from " else "to ") + row.counterparty,
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                )
                Text(
                    row.source.uppercase() + " · " + fmt.format(Date(row.dateTime)) +
                        (if (row.cost > 0) " · fee " + Format.kes(row.cost) else ""),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }

        Text("What was this for?", style = MaterialTheme.typography.titleMedium)
        CategoryGrid(selected = category, onSelect = { category = it })

        OutlinedTextField(
            reason, { reason = it },
            label = { Text("Reason (optional)") },
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.small,
        )

        Button(
            onClick = {
                onSave(
                    amount.toDoubleOrNull() ?: row.amount, direction, counterparty,
                    category, reason.ifBlank { null },
                )
            },
            enabled = category.isNotBlank() && (!manual || amount.toDoubleOrNull() != null),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text("Save", style = MaterialTheme.typography.titleMedium) }
    }
}

@Composable
private fun DirectionBadge(text: String, tint: Color) {
    Surface(shape = RoundedCornerShape(50), color = tint.copy(alpha = 0.14f)) {
        Text(
            text,
            Modifier.padding(horizontal = 14.dp, vertical = 5.dp),
            style = MaterialTheme.typography.labelLarge,
            color = tint,
        )
    }
}

@Composable
private fun CategoryGrid(selected: String, onSelect: (String) -> Unit) {
    val palette = LocalWalletPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Categories.ALL.chunked(3).forEach { rowCats ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                rowCats.forEach { cat ->
                    val color = palette.category(cat)
                    val isSelected = selected == cat
                    Surface(
                        shape = MaterialTheme.shapes.medium,
                        color = if (isSelected) color.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                        border = if (isSelected) androidx.compose.foundation.BorderStroke(1.5.dp, color) else null,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onSelect(cat) },
                    ) {
                        Column(
                            Modifier.padding(vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(categoryEmoji(cat), fontSize = 22.sp)
                            Text(
                                cat,
                                style = MaterialTheme.typography.labelMedium,
                                color = if (isSelected) color else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                repeat(3 - rowCats.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}
