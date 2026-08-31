package storage

import (
	"path/filepath"
	"testing"
	"time"
)

func newTestDB(t *testing.T) *Database {
	t.Helper()
	db, err := NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	return db
}

func TestSaveAndReadDirectionSource(t *testing.T) {
	db := newTestDB(t)
	tx := &Transaction{
		TransactionID: "TID001",
		Amount:        300,
		Recipient:     "Jane Doe",
		DateTime:      time.Now(),
		Direction:     "in",
		Source:        "airtel",
		Category:      "income",
	}
	if err := db.SaveTransaction(tx); err != nil {
		t.Fatalf("SaveTransaction: %v", err)
	}
	all, err := db.GetAllTransactions()
	if err != nil {
		t.Fatalf("GetAllTransactions: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("got %d transactions, want 1", len(all))
	}
	if all[0].Direction != "in" || all[0].Source != "airtel" {
		t.Errorf("got direction=%q source=%q, want in/airtel", all[0].Direction, all[0].Source)
	}
}
