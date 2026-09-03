package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDownload
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.ngigi.wallet.settings.Prefs
import com.ngigi.wallet.sync.Hydrate

@Composable
fun SettingsScreen(prefs: Prefs, showMessage: (String) -> Unit, onSaved: () -> Unit, onHydrate: () -> Unit) {
    var url by remember { mutableStateOf(prefs.baseUrl ?: "") }
    var token by remember { mutableStateOf(prefs.apiToken ?: "") }
    var showToken by remember { mutableStateOf(false) }
    // Only show sync results for a sync the user started from this screen —
    // never a stale verdict from a previous session.
    var attempted by remember { mutableStateOf(false) }

    val ctx = LocalContext.current
    val hydrateInfos by WorkManager.getInstance(ctx)
        .getWorkInfosForUniqueWorkFlow(Hydrate.WORK_NAME)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val hydrate = hydrateInfos.firstOrNull()
    val syncing = hydrate?.state == WorkInfo.State.RUNNING || hydrate?.state == WorkInfo.State.ENQUEUED

    Column(Modifier.fillMaxSize()) {
        Canopy {
            val palette = com.ngigi.wallet.ui.theme.LocalWalletPalette.current
            Text("Settings", style = MaterialTheme.typography.headlineMedium, color = palette.onHero)
            Text(
                "Server & sync",
                style = MaterialTheme.typography.labelMedium,
                color = palette.onHeroDim,
            )
        }

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SectionCard("Server connection") {
                OutlinedTextField(
                    url, { url = it },
                    label = { Text("Server URL (https://…)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                )
                OutlinedTextField(
                    token, { token = it },
                    label = { Text("API token") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = MaterialTheme.shapes.small,
                    visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton({ showToken = !showToken }) {
                            Icon(
                                if (showToken) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                contentDescription = if (showToken) "Hide token" else "Show token",
                            )
                        }
                    },
                )
                Button(
                    onClick = {
                        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://$url"
                        prefs.baseUrl = url
                        prefs.apiToken = token
                        showMessage("Saved — syncing with the server.")
                        onSaved()
                    },
                    enabled = url.isNotBlank() && token.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Save") }
            }

            SectionCard("History") {
                Text(
                    "Pull every transaction the server already knows about — including the ones " +
                        "recorded before this app existed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { attempted = true; onHydrate() },
                    enabled = prefs.isConfigured && !syncing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (syncing) {
                        CircularProgressIndicator(
                            Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Spacer(Modifier.width(8.dp))
                        Text("Syncing…")
                    } else {
                        Icon(Icons.Rounded.CloudDownload, contentDescription = null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Sync history from server")
                    }
                }
                if (attempted) when (hydrate?.state) {
                    WorkInfo.State.SUCCEEDED -> {
                        val n = hydrate.outputData.getInt(Hydrate.KEY_INSERTED, 0)
                        Text(
                            if (n > 0) "Synced $n transaction${if (n > 1) "s" else ""} from the server."
                            else "Already up to date — nothing new on the server.",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    WorkInfo.State.FAILED -> Text(
                        hydrate.outputData.getString(Hydrate.KEY_ERROR)
                            ?: "Sync failed — check the URL and token, then try again.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    WorkInfo.State.ENQUEUED -> Text(
                        "Waiting for a network connection…",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    else -> {}
                }
            }

            SectionCard("How it works") {
                Text(
                    "Wallet listens for M-PESA and AirtelMoney SMS and records each transaction the " +
                        "moment it lands — even with the app closed. Tag it from the notification or the Inbox.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "If messages stop appearing, check that the SMS permission is granted and battery " +
                        "optimization is off for Wallet.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
