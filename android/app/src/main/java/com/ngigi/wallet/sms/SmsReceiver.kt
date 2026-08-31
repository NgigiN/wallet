package com.ngigi.wallet.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import com.ngigi.wallet.sync.Sync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    private val senders = setOf("mpesa", "airtelmoney")

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        // Multipart SMS arrive as several PDUs from one sender; reassemble the body.
        val bySender = messages.filterNotNull().groupBy { it.displayOriginatingAddress ?: "" }
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext
                val handler = SmsHandler(
                    AppDb.get(app).dao(),
                    AndroidNotifier(app),
                ) { Sync.requestSync(app) }
                for ((sender, parts) in bySender) {
                    if (sender.lowercase() !in senders) continue
                    handler.handle(sender, parts.joinToString("") { it.messageBody ?: "" })
                }
            } finally {
                pending.finish()
            }
        }
    }
}
