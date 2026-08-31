package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.settings.Prefs
import kotlinx.serialization.SerializationException
import java.io.IOException
import java.net.UnknownHostException

object Hydrate {
    const val WORK_NAME = "hydrate"
    const val KEY_INSERTED = "inserted"
    const val KEY_ERROR = "error"

    fun request(context: Context) {
        val work = OneTimeWorkRequestBuilder<HydrateWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        // REPLACE: each tap is a fresh attempt with the current settings —
        // never silently swallowed by an older pending run.
        WorkManager.getInstance(context)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.REPLACE, work)
    }

    /** Pulls the full server history; inserts unseen rows as SYNCED. Returns inserted count. */
    suspend fun pull(dao: TransactionDao, client: ApiClient): Int {
        var inserted = 0
        for (tx in client.getAll()) {
            if (dao.insert(Wire.toEntity(tx)) != -1L) inserted++
        }
        return inserted
    }

    /** Maps a sync failure to a message the user can act on. */
    fun errorMessage(e: Exception): String = when {
        e is HttpException && (e.code == 401 || e.code == 403) ->
            "The server rejected the API token — check it and try again."
        e is HttpException ->
            "Unexpected response from the server (HTTP ${e.code}) — is the URL right?"
        e is UnknownHostException ->
            "Server not found — check the URL."
        e is SerializationException ->
            "That URL didn't return transaction data — is it pointing at the wallet server?"
        e is IllegalArgumentException ->
            "The URL looks invalid — it should start with https://"
        e is IOException ->
            "Couldn't reach the server — check your connection and try again."
        else -> "Sync failed: ${e.message ?: e.javaClass.simpleName}"
    }
}

class HydrateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) {
            return Result.failure(workDataOf(Hydrate.KEY_ERROR to "Set the server URL and API token first."))
        }
        return try {
            val inserted = Hydrate.pull(
                AppDb.get(applicationContext).dao(),
                ApiClient(prefs.baseUrl!!, prefs.apiToken!!)
            )
            Result.success(workDataOf(Hydrate.KEY_INSERTED to inserted))
        } catch (e: Exception) {
            // User-initiated action: fail fast with a specific message instead
            // of retrying in the background — the user can simply tap again.
            Result.failure(workDataOf(Hydrate.KEY_ERROR to Hydrate.errorMessage(e)))
        }
    }
}
