package com.ngigi.wallet

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import com.ngigi.wallet.settings.Prefs
import com.ngigi.wallet.sync.Hydrate
import com.ngigi.wallet.sync.Sync
import com.ngigi.wallet.ui.InboxScreen
import com.ngigi.wallet.ui.SettingsScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidNotifier.ensureChannels(this)
        requestNeededPermissions()
        Sync.schedulePeriodic(this)
        val dao = AppDb.get(this).dao()

        setContent {
            MaterialTheme {
                var tab by remember { mutableIntStateOf(0) }
                Scaffold(bottomBar = {
                    NavigationBar {
                        listOf("Inbox", "Stats", "Settings").forEachIndexed { i, label ->
                            NavigationBarItem(selected = tab == i, onClick = { tab = i },
                                icon = {}, label = { Text(label) })
                        }
                    }
                }) { padding ->
                    Surface(Modifier.padding(padding)) {
                        when (tab) {
                            0 -> InboxScreen(dao) { rowId ->
                                startActivity(Intent(this, TagActivity::class.java).putExtra("row_id", rowId))
                            }
                            1 -> Text("Stats — coming soon")
                            else -> SettingsScreen(
                                Prefs(this),
                                onSaved = { Sync.requestSync(this) },
                                onHydrate = { Hydrate.request(this) },
                            )
                        }
                    }
                }
            }
        }
    }

    private fun requestNeededPermissions() {
        val wanted = buildList {
            add(Manifest.permission.RECEIVE_SMS)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (wanted.isNotEmpty()) {
            registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}
                .launch(wanted.toTypedArray())
        }
    }
}
