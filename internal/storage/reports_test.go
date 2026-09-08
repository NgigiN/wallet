package storage

import (
	"path/filepath"
	"testing"
	"time"
)

func mustSave(t *testing.T, db *Database, tx *Transaction) {
	t.Helper()
	if _, err := db.CreateTransaction(tx); err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
}

func TestPeriodTotalsAndCategoryTotals(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	base := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 1000, Recipient: "Shop", DateTime: base, Cost: 30, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 500, Recipient: "Boss", DateTime: base, Category: "income", Direction: "in", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 8000, Recipient: "Pochi", DateTime: base, Category: "transfer", Direction: "transfer", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

	in, out, err := db.PeriodTotals(from, to)
	if err != nil {
		t.Fatalf("PeriodTotals: %v", err)
	}
	if in != 500 || out != 1030 {
		t.Errorf("got in=%v out=%v, want in=500 out=1030 (transfer excluded, cost counted)", in, out)
	}

	cats, err := db.CategoryTotals(from, to)
	if err != nil {
		t.Fatalf("CategoryTotals: %v", err)
	}
	if len(cats) != 1 || cats[0].Name != "food" || cats[0].Total != 1030 {
		t.Errorf("got %+v, want [{food 1030}]", cats)
	}
}

func TestPeriodTotalsExcludesOutsideRange(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 1000, Recipient: "Shop", DateTime: time.Date(2026, 8, 31, 23, 0, 0, 0, time.UTC), Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	_, out, err := db.PeriodTotals(from, to)
	if err != nil {
		t.Fatalf("PeriodTotals: %v", err)
	}
	if out != 0 {
		t.Errorf("got out=%v, want 0 (transaction is before the range)", out)
	}
}

func TestTopDaysGroupsByCalendarDayInGoNotSQL(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	day1 := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)
	day1Later := time.Date(2026, 9, 10, 18, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 9, 11, 9, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 100, Recipient: "S", DateTime: day1, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 400, Recipient: "S", DateTime: day1Later, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 50, Recipient: "S", DateTime: day2, Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	days, err := db.TopDays(from, to, 5)
	if err != nil {
		t.Fatalf("TopDays: %v", err)
	}
	if len(days) != 2 || days[0].Name != "2026-09-10" || days[0].Total != 500 {
		t.Errorf("got %+v, want first day 2026-09-10 total 500", days)
	}
}

func TestBiggestExpensesAndTopCounterparties(t *testing.T) {
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	base := time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC)
	mustSave(t, db, &Transaction{TransactionID: "A", Amount: 100, Recipient: "Alice", DateTime: base, Category: "food", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "B", Amount: 900, Recipient: "Bob", DateTime: base, Category: "travel", Direction: "out", Source: "mpesa"})
	mustSave(t, db, &Transaction{TransactionID: "C", Amount: 200, Recipient: "Bob", DateTime: base, Category: "food", Direction: "out", Source: "mpesa"})

	from := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)

	biggest, err := db.BiggestExpenses(from, to, 5)
	if err != nil || len(biggest) == 0 || biggest[0].TransactionID != "B" {
		t.Fatalf("BiggestExpenses: got %+v, err=%v, want first TransactionID=B", biggest, err)
	}

	cp, err := db.TopCounterparties(from, to, 5)
	if err != nil || len(cp) == 0 || cp[0].Name != "Bob" || cp[0].Total != 1100 {
		t.Fatalf("TopCounterparties: got %+v, err=%v, want first {Bob 1100}", cp, err)
	}
}
