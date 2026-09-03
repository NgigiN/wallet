package com.ngigi.wallet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.sync.Sync
import com.ngigi.wallet.ui.TagScreen
import com.ngigi.wallet.ui.theme.WalletTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class TagActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val rowId = intent.getLongExtra("row_id", -1)
        if (rowId == -1L) { finish(); return }
        val dao = AppDb.get(this).dao()

        setContent {
            var row by remember { mutableStateOf<TransactionEntity?>(null) }
            LaunchedEffect(rowId) { row = dao.byId(rowId) }
            WalletTheme {
                Surface(
                    Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background,
                ) {
                    Box(Modifier.systemBarsPadding().imePadding()) {
                        if (row == null) {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        }
                        row?.let { r ->
                            TagScreen(r) { amount, direction, counterparty, category, reason ->
                                lifecycleScope.launch(Dispatchers.IO) {
                                    if (r.status == Status.PARSE_FAILED) {
                                        dao.completeManual(r.id, amount, direction, counterparty, category, reason)
                                    } else {
                                        dao.tag(r.id, category, reason)
                                    }
                                    Sync.requestSync(applicationContext)
                                    finish()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
