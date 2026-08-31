package com.ngigi.wallet.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.ngigi.wallet.TagActivity
import com.ngigi.wallet.parser.Direction
import com.ngigi.wallet.parser.ParseResult

interface Notifier {
    fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>)
    fun notifyParseFailed(rowId: Long)
}

class AndroidNotifier(private val context: Context) : Notifier {
    companion object {
        const val CHANNEL_TX = "transactions"
        fun ensureChannels(context: Context) {
            val mgr = context.getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_TX, "Transactions", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    override fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>) {
        ensureChannels(context)
        val dirLabel = if (tx.direction == Direction.IN) "Money IN" else "Money OUT"
        val builder = NotificationCompat.Builder(context, CHANNEL_TX)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Ksh %,.0f %s %s".format(tx.amount, if (tx.direction == Direction.IN) "←" else "→", tx.counterparty))
            .setContentText("$dirLabel · ${tx.source.wire.uppercase()} · tap for details")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tagActivityIntent(rowId))

        topCategories.take(2).forEachIndexed { i, cat ->
            val intent = Intent(context, TagActionReceiver::class.java)
                .putExtra("row_id", rowId).putExtra("category", cat)
            val pi = PendingIntent.getBroadcast(
                context, (rowId * 10 + i).toInt(), intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            builder.addAction(0, cat.replaceFirstChar { it.uppercase() }, pi)
        }
        builder.addAction(0, "More…", tagActivityIntent(rowId))
        notify(rowId, builder)
    }

    override fun notifyParseFailed(rowId: Long) {
        ensureChannels(context)
        val builder = NotificationCompat.Builder(context, CHANNEL_TX)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("Couldn't read a money SMS")
            .setContentText("Tap to enter it manually")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tagActivityIntent(rowId))
        notify(rowId, builder)
    }

    private fun tagActivityIntent(rowId: Long): PendingIntent =
        PendingIntent.getActivity(
            context, rowId.toInt(),
            Intent(context, TagActivity::class.java)
                .putExtra("row_id", rowId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun notify(rowId: Long, builder: NotificationCompat.Builder) {
        try {
            NotificationManagerCompat.from(context).notify(rowId.toInt(), builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted; row still sits safely in the inbox.
        }
    }
}
