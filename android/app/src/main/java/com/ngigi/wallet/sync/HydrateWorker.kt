package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.settings.Prefs
import java.io.IOException

object Hydrate {
    fun request(context: Context) {
        val work = OneTimeWorkRequestBuilder<HydrateWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("hydrate", ExistingWorkPolicy.KEEP, work)
    }

    /** Pulls the full server history; inserts unseen rows as SYNCED. Returns inserted count. */
    suspend fun pull(dao: TransactionDao, client: ApiClient): Int {
        var inserted = 0
        for (tx in client.getAll()) {
            if (dao.insert(Wire.toEntity(tx)) != -1L) inserted++
        }
        return inserted
    }
}

class HydrateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()
        return try {
            Hydrate.pull(AppDb.get(applicationContext).dao(), ApiClient(prefs.baseUrl!!, prefs.apiToken!!))
            Result.success()
        } catch (e: IOException) {
            Result.retry()
        }
    }
}
