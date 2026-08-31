package com.ngigi.wallet.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

data class CategoryCount(val category: String, val n: Int)
data class Totals(val moneyIn: Double, val moneyOut: Double)
data class NamedTotal(val name: String, val total: Double)

@Dao
interface TransactionDao {
    /** Returns -1 when a row with the same txn_id already exists. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(t: TransactionEntity): Long

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun byId(id: Long): TransactionEntity?

    @Query("UPDATE transactions SET category = :category, reason = :reason, status = '${Status.TAGGED}', sync_error = NULL WHERE id = :id")
    suspend fun tag(id: Long, category: String, reason: String?)

    @Query("""UPDATE transactions SET amount = :amount, direction = :direction, counterparty = :counterparty,
              category = :category, reason = :reason, status = '${Status.TAGGED}', sync_error = NULL WHERE id = :id""")
    suspend fun completeManual(id: Long, amount: Double, direction: String, counterparty: String, category: String, reason: String?)

    @Query("""SELECT * FROM transactions
              WHERE status IN ('${Status.UNTAGGED}', '${Status.PARSE_FAILED}') OR sync_error IS NOT NULL
              ORDER BY date_time DESC""")
    fun inbox(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions WHERE status IN ('${Status.UNTAGGED}', '${Status.PARSE_FAILED}')")
    suspend fun inboxCount(): Int

    @Query("SELECT * FROM transactions WHERE status = '${Status.TAGGED}'")
    suspend fun unsynced(): List<TransactionEntity>

    @Query("UPDATE transactions SET status = '${Status.SYNCED}' WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("UPDATE transactions SET sync_error = :error WHERE id = :id")
    suspend fun setSyncError(id: Long, error: String)

    @Query("SELECT COUNT(*) FROM transactions")
    suspend fun count(): Int

    @Query("""SELECT category, COUNT(*) AS n FROM transactions
              WHERE category IS NOT NULL AND category != '${Categories.TRANSFER}'
              GROUP BY category ORDER BY n DESC LIMIT 2""")
    suspend fun topCategories(): List<CategoryCount>

    @Query("""SELECT
                COALESCE(SUM(CASE WHEN direction = 'in' THEN amount END), 0) AS moneyIn,
                COALESCE(SUM(CASE WHEN direction = 'out' THEN amount + cost END), 0) AS moneyOut
              FROM transactions
              WHERE date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'""")
    suspend fun totals(from: Long, to: Long): Totals

    @Query("""SELECT category AS name, SUM(amount + cost) AS total FROM transactions
              WHERE direction = 'out' AND category IS NOT NULL
                AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY category ORDER BY total DESC""")
    suspend fun categoryTotals(from: Long, to: Long): List<NamedTotal>

    @Query("""SELECT strftime('%Y-%m-%d', date_time / 1000, 'unixepoch', 'localtime') AS name,
                     SUM(amount + cost) AS total FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY name ORDER BY total DESC LIMIT 5""")
    suspend fun topDays(from: Long, to: Long): List<NamedTotal>

    @Query("""SELECT * FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              ORDER BY amount DESC LIMIT 5""")
    suspend fun biggestExpenses(from: Long, to: Long): List<TransactionEntity>

    @Query("""SELECT counterparty AS name, SUM(amount) AS total FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY counterparty ORDER BY total DESC LIMIT 5""")
    suspend fun topCounterparties(from: Long, to: Long): List<NamedTotal>
}
