package com.ngigi.wallet.data

import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.SupportSQLiteOpenHelper
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BudgetMigrationTest {

    @Test
    fun migration1To2PreservesTransactionsAndAddsBudgetsTable() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val helper = FrameworkSQLiteOpenHelperFactory().create(
            SupportSQLiteOpenHelper.Configuration.builder(context)
                .name("budget-migration-test.db")
                .callback(object : SupportSQLiteOpenHelper.Callback(1) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL(
                            """CREATE TABLE transactions (
                                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                txn_id TEXT NOT NULL, amount REAL NOT NULL, direction TEXT NOT NULL,
                                source TEXT NOT NULL, counterparty TEXT NOT NULL, date_time INTEGER NOT NULL,
                                balance REAL, cost REAL NOT NULL, category TEXT, reason TEXT,
                                status TEXT NOT NULL, sync_error TEXT, raw_body TEXT NOT NULL, created_at INTEGER NOT NULL)""",
                        )
                        db.execSQL(
                            """INSERT INTO transactions (id, txn_id, amount, direction, source, counterparty,
                                date_time, balance, cost, category, reason, status, sync_error, raw_body, created_at)
                                VALUES (1, 'T1', 100.0, 'out', 'mpesa', 'Shop', 0, NULL, 0.0, 'food', NULL, 'SYNCED', NULL, '', 0)""",
                        )
                    }
                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build(),
        )
        val db = helper.writableDatabase
        AppDb.MIGRATION_1_2.migrate(db)

        val txnCursor = db.query("SELECT txn_id FROM transactions")
        assertTrue(txnCursor.moveToFirst())
        assertEquals("T1", txnCursor.getString(0))
        txnCursor.close()

        val budgetsTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'")
        assertTrue(budgetsTable.moveToFirst())
        budgetsTable.close()
        helper.close()
    }
}
