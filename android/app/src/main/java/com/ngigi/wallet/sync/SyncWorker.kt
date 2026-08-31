package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.settings.Prefs

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()
        val dao = AppDb.get(applicationContext).dao()
        val client = ApiClient(prefs.baseUrl!!, prefs.apiToken!!)
        return if (Sync.pushAll(dao, client)) Result.success() else Result.retry()
    }
}
