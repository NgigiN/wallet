package com.ngigi.wallet.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [TransactionEntity::class], version = 1)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): TransactionDao

    companion object {
        @Volatile private var instance: AppDb? = null

        fun get(context: Context): AppDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDb::class.java, "wallet.db")
                .build().also { instance = it }
        }
    }
}
