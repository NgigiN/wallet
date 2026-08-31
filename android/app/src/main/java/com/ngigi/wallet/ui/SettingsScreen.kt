package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.settings.Prefs

@Composable
fun SettingsScreen(prefs: Prefs, onSaved: () -> Unit, onHydrate: () -> Unit) {
    var url by remember { mutableStateOf(prefs.baseUrl ?: "") }
    var token by remember { mutableStateOf(prefs.apiToken ?: "") }
    var savedMsg by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(url, { url = it }, label = { Text("Server URL (https://…)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(token, { token = it }, label = { Text("API token") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            prefs.baseUrl = url; prefs.apiToken = token
            savedMsg = "Saved"; onSaved()
        }, enabled = url.isNotBlank() && token.isNotBlank()) { Text("Save") }
        HorizontalDivider()
        Button(onClick = onHydrate, enabled = prefs.isConfigured) { Text("Sync history from server") }
        savedMsg?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}
