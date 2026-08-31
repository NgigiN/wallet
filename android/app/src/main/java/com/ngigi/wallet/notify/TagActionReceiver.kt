package com.ngigi.wallet.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.sync.Sync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class TagActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val rowId = intent.getLongExtra("row_id", -1)
        val category = intent.getStringExtra("category") ?: return
        if (rowId == -1L) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext
                AppDb.get(app).dao().tag(rowId, category, null)
                NotificationManagerCompat.from(app).cancel(rowId.toInt())
                Sync.requestSync(app)
            } finally {
                pending.finish()
            }
        }
    }
}
