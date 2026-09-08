package com.ngigi.wallet.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [TransactionEntity::class, BudgetEntity::class], version = 2)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): TransactionDao
    abstract fun budgetDao(): BudgetDao

    companion object {
        @Volatile private var instance: AppDb? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """CREATE TABLE IF NOT EXISTS budgets (
                        category TEXT NOT NULL PRIMARY KEY,
                        monthly_limit REAL NOT NULL,
                        last_alert_level INTEGER NOT NULL DEFAULT 0,
                        last_alert_month TEXT)""",
                )
            }
        }

        fun get(context: Context): AppDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDb::class.java, "wallet.db")
                .addMigrations(MIGRATION_1_2)
                .build().also { instance = it }
        }
    }
}
