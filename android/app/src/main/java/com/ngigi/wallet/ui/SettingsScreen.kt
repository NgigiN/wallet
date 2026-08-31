package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.ngigi.wallet.settings.Prefs
import com.ngigi.wallet.sync.Hydrate

@Composable
fun SettingsScreen(prefs: Prefs, onSaved: () -> Unit, onHydrate: () -> Unit) {
    var url by remember { mutableStateOf(prefs.baseUrl ?: "") }
    var token by remember { mutableStateOf(prefs.apiToken ?: "") }
    var showToken by remember { mutableStateOf(false) }
    var savedMsg by remember { mutableStateOf<String?>(null) }
    // Only show sync results for a sync the user started from this screen —
    // never a stale verdict from a previous session.
    var attempted by remember { mutableStateOf(false) }

    val ctx = LocalContext.current
    val hydrateInfos by WorkManager.getInstance(ctx)
        .getWorkInfosForUniqueWorkFlow(Hydrate.WORK_NAME)
        .collectAsStateWithLifecycle(initialValue = emptyList())
    val hydrate = hydrateInfos.firstOrNull()
    val syncing = hydrate?.state == WorkInfo.State.RUNNING || hydrate?.state == WorkInfo.State.ENQUEUED

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(url, { url = it }, label = { Text("Server URL (https://…)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            token, { token = it },
            label = { Text("API token") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                TextButton({ showToken = !showToken }) { Text(if (showToken) "Hide" else "Show") }
            },
        )
        Button(onClick = {
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://$url"
            prefs.baseUrl = url; prefs.apiToken = token
            savedMsg = "Saved"; onSaved()
        }, enabled = url.isNotBlank() && token.isNotBlank()) { Text("Save") }
        savedMsg?.let { Text(it, style = MaterialTheme.typography.bodySmall) }

        HorizontalDivider()

        Button(onClick = { attempted = true; onHydrate() }, enabled = prefs.isConfigured && !syncing) {
            if (syncing) {
                CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("Syncing…")
            } else {
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
}
