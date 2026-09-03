package com.ngigi.wallet

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.Insights
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.notify.AndroidNotifier
import com.ngigi.wallet.settings.Prefs
import com.ngigi.wallet.sync.Hydrate
import com.ngigi.wallet.sync.Sync
import com.ngigi.wallet.ui.InboxScreen
import com.ngigi.wallet.ui.SettingsScreen
import com.ngigi.wallet.ui.StatsScreen
import com.ngigi.wallet.ui.theme.WalletTheme
import kotlinx.coroutines.launch

private data class Tab(val label: String, val icon: ImageVector)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The canopy header is always deep green, so status icons stay light.
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(AndroidColor.TRANSPARENT))
        AndroidNotifier.ensureChannels(this)
        requestNeededPermissions()
        Sync.schedulePeriodic(this)
        val dao = AppDb.get(this).dao()

        setContent {
            WalletTheme {
                var tab by rememberSaveable { mutableIntStateOf(0) }
                // Shoulder-surfing guard: amounts start hidden on every open, and
                // re-hide whenever the app leaves the foreground.
                var hideAmounts by remember { mutableStateOf(true) }
                val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
                DisposableEffect(lifecycleOwner) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_STOP) hideAmounts = true
                    }
                    lifecycleOwner.lifecycle.addObserver(observer)
                    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                }
                val snackbar = remember { SnackbarHostState() }
                val scope = rememberCoroutineScope()
                val showMessage: (String) -> Unit = { msg -> scope.launch { snackbar.showSnackbar(msg) } }
                val inboxRows by dao.inbox().collectAsStateWithLifecycle(initialValue = null as List<TransactionEntity>?)
                val tabs = listOf(
                    Tab("Inbox", Icons.Rounded.Inbox),
                    Tab("Stats", Icons.Rounded.Insights),
                    Tab("Settings", Icons.Rounded.Settings),
                )

                Scaffold(
                    containerColor = MaterialTheme.colorScheme.background,
                    snackbarHost = { SnackbarHost(snackbar) },
                    bottomBar = {
                        NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                            tabs.forEachIndexed { i, t ->
                                NavigationBarItem(
                                    selected = tab == i,
                                    onClick = { tab = i },
                                    icon = {
                                        val count = if (i == 0) inboxRows?.size ?: 0 else 0
                                        if (count > 0) {
                                            BadgedBox(badge = { Badge { Text("$count") } }) {
                                                Icon(t.icon, contentDescription = t.label)
                                            }
                                        } else {
                                            Icon(t.icon, contentDescription = t.label)
                                        }
                                    },
                                    label = { Text(t.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                        selectedIconColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                        selectedTextColor = MaterialTheme.colorScheme.onSurface,
                                    ),
                                )
                            }
                        }
                    },
                ) { padding ->
                    // Only the bottom inset: each screen's canopy paints under the status bar itself.
                    androidx.compose.foundation.layout.Box(Modifier.padding(bottom = padding.calculateBottomPadding())) {
                        when (tab) {
                            0 -> InboxScreen(
                                dao, showMessage,
                                hidden = hideAmounts,
                                onToggleHidden = { hideAmounts = !hideAmounts },
                            ) { rowId ->
                                startActivity(
                                    Intent(this@MainActivity, TagActivity::class.java).putExtra("row_id", rowId),
                                )
                            }
                            1 -> StatsScreen(
                                dao, showMessage,
                                hidden = hideAmounts,
                                onToggleHidden = { hideAmounts = !hideAmounts },
                            )
                            else -> SettingsScreen(
                                Prefs(this@MainActivity),
                                showMessage = showMessage,
                                onSaved = { Sync.requestSync(this@MainActivity) },
                                onHydrate = { Hydrate.request(this@MainActivity) },
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
