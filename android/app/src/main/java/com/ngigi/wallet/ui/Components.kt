package com.ngigi.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.settings.Prefs
import com.ngigi.wallet.sync.Hydrate
import com.ngigi.wallet.sync.Sync
import com.ngigi.wallet.ui.theme.LocalWalletPalette
import com.ngigi.wallet.ui.theme.categoryEmoji
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

/** Canopy eye toggle for the shoulder-surfing guard: amounts start hidden, tap to reveal. */
@Composable
fun HideAmountsButton(hidden: Boolean, onToggle: () -> Unit) {
    val palette = LocalWalletPalette.current
    IconButton(onClick = onToggle) {
        Icon(
            if (hidden) Icons.Rounded.Visibility else Icons.Rounded.VisibilityOff,
            contentDescription = if (hidden) "Show amounts" else "Hide amounts",
            tint = palette.onHeroDim,
        )
    }
}

/** The deep-green header block that owns the status-bar area on every screen. */
@Composable
fun Canopy(content: @Composable ColumnScope.() -> Unit) {
    val palette = LocalWalletPalette.current
    Column(
        Modifier
            .fillMaxWidth()
            .background(
                palette.heroBrush,
                shape = RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp),
            )
            .statusBarsPadding()
            .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 22.dp),
        content = content,
    )
}

@Composable
fun SectionCard(
    title: String? = null,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            title?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
            content()
        }
    }
}

@Composable
fun EmojiAvatar(emoji: String, tint: Color, size: Int = 42) {
    Box(
        Modifier
            .size(size.dp)
            .background(tint.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(emoji, fontSize = (size * 0.45).sp)
    }
}

/** Quiet list row for a tagged/synced transaction. */
@Composable
fun TransactionRow(row: TransactionEntity, now: Long, onClick: (() -> Unit)? = null) {
    val palette = LocalWalletPalette.current
    val color = palette.category(row.category)
    Row(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        EmojiAvatar(categoryEmoji(row.category), color)
        Column(Modifier.weight(1f)) {
            Text(
                row.counterparty,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
            )
            Text(
                listOfNotNull(row.category, Format.timeAgo(row.dateTime, now)).joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            when (row.direction) {
                "in" -> "+" + Format.kes(row.amount)
                "transfer" -> Format.kes(row.amount)
                else -> "−" + Format.kes(row.amount)
            },
            style = MaterialTheme.typography.titleSmall,
            color = when (row.direction) {
                "in" -> palette.moneyIn
                "transfer" -> MaterialTheme.colorScheme.onSurfaceVariant
                else -> MaterialTheme.colorScheme.onSurface
            },
        )
    }
}

@Composable
fun EmptyState(emoji: String, title: String, body: String, hint: String? = null) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(emoji, fontSize = 44.sp)
        Text(title, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        hint?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/**
 * Pull-to-refresh backing state: kicks a server pull + push, spins while the
 * work runs, and reports the outcome once through [showMessage].
 */
@Composable
fun rememberServerRefresh(showMessage: (String) -> Unit): Pair<Boolean, () -> Unit> {
    val ctx = LocalContext.current
    val wm = remember { WorkManager.getInstance(ctx) }
    val hydrateInfos by wm.getWorkInfosForUniqueWorkFlow(Hydrate.WORK_NAME)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val syncInfos by wm.getWorkInfosForUniqueWorkFlow(Sync.WORK_NAME)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    var attempted by remember { mutableStateOf(false) }

    fun active(i: WorkInfo?) =
        i != null && (i.state == WorkInfo.State.RUNNING || i.state == WorkInfo.State.ENQUEUED)
    val busy = active(hydrateInfos.firstOrNull()) || active(syncInfos.firstOrNull())
    val latestBusy = rememberUpdatedState(busy)
    val latestHydrate = rememberUpdatedState(hydrateInfos.firstOrNull())
    val latestShow = rememberUpdatedState(showMessage)

    LaunchedEffect(attempted) {
        if (!attempted) return@LaunchedEffect
        delay(600) // let WorkManager pick the request up before watching it settle
        val finished = withTimeoutOrNull(25_000) {
            snapshotFlow { latestBusy.value }.first { !it }
        } != null
        val h = latestHydrate.value
        val msg = when {
            !finished -> "Still syncing in the background — check back in a moment."
            h?.state == WorkInfo.State.FAILED ->
                h.outputData.getString(Hydrate.KEY_ERROR) ?: "Sync failed — check Settings."
            h?.state == WorkInfo.State.SUCCEEDED -> {
                val n = h.outputData.getInt(Hydrate.KEY_INSERTED, 0)
                if (n > 0) "Pulled $n new transaction${if (n == 1) "" else "s"} from the server."
                else "Up to date with the server."
            }
            else -> "Up to date with the server."
        }
        attempted = false
        latestShow.value(msg)
    }

    val refresh = {
        if (Prefs(ctx).isConfigured) {
            attempted = true
            Hydrate.request(ctx)
            Sync.requestSync(ctx)
        } else {
            showMessage("Set the server URL and API token in Settings first.")
        }
    }
    return attempted to refresh
}
