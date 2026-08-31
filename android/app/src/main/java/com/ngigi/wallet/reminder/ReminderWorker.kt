package com.ngigi.wallet.reminder

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ngigi.wallet.MainActivity
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        const val NOTIFICATION_ID = -1000
        fun delayToNext8pmMillis(now: LocalDateTime = LocalDateTime.now()): Long {
            var next = now.toLocalDate().atTime(LocalTime.of(20, 0))
            if (!next.isAfter(now)) next = next.plusDays(1)
            return Duration.between(now, next).toMillis()
        }
    }

    override suspend fun doWork(): Result {
        val count = AppDb.get(applicationContext).dao().inboxCount()
        if (count > 0) {
            AndroidNotifier.ensureChannels(applicationContext)
            val pi = PendingIntent.getActivity(
                applicationContext, NOTIFICATION_ID,
                Intent(applicationContext, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE
            )
            val n = NotificationCompat.Builder(applicationContext, AndroidNotifier.CHANNEL_TX)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle("$count untagged transaction${if (count > 1) "s" else ""}")
                .setContentText("Tap to categorize them")
                .setContentIntent(pi).setAutoCancel(true).build()
            try {
                NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, n)
            } catch (e: SecurityException) {
                // notifications permission revoked; the inbox badge still shows the backlog
            }
        }
        return Result.success()
    }
}
