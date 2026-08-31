package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.reminder.ReminderWorker
import java.io.IOException
import java.util.concurrent.TimeUnit

object Sync {
    fun requestSync(context: Context) {
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, work)
    }

    fun schedulePeriodic(context: Context) {
        val sync = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, sync)
        val reminder = PeriodicWorkRequestBuilder<ReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(ReminderWorker.delayToNext8pmMillis(), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("reminder", ExistingPeriodicWorkPolicy.KEEP, reminder)
    }

    /** Pushes all TAGGED rows. Returns false when a retry is warranted (network/5xx). */
    suspend fun pushAll(dao: TransactionDao, client: ApiClient): Boolean {
        var allDone = true
        for (row in dao.unsynced()) {
            try {
                when (client.post(Wire.toApi(row))) {
                    PostResult.CREATED, PostResult.DUPLICATE -> dao.markSynced(row.id)
                    PostResult.CLIENT_ERROR -> dao.setSyncError(row.id, "rejected by server")
                    PostResult.SERVER_ERROR -> allDone = false
                }
            } catch (e: IOException) {
                allDone = false
            }
        }
        return allDone
    }
}
