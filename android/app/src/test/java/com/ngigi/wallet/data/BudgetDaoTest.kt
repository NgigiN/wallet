package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BudgetDaoTest {
    private lateinit var db: AppDb
    private lateinit var budgetDao: BudgetDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        budgetDao = db.budgetDao()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun upsertReplacesExistingBudgetForSameCategory() = runBlocking {
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 5000.0))
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 6000.0, lastAlertLevel = 1, lastAlertMonth = "2026-09"))
        val stored = budgetDao.get("food")
        assertEquals(6000.0, stored?.monthlyLimit)
        assertEquals(1, stored?.lastAlertLevel)
    }

    @Test
    fun getReturnsNullWhenNoBudgetSet() = runBlocking {
        assertEquals(null, budgetDao.get("travel"))
    }

    @Test
    fun allReturnsEveryBudget() = runBlocking {
        budgetDao.upsert(BudgetEntity(category = "food", monthlyLimit = 5000.0))
        budgetDao.upsert(BudgetEntity(category = "travel", monthlyLimit = 2000.0))
        assertEquals(2, budgetDao.all().first().size)
    }
}
