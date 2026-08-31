package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/NgigiN/wallet/internal/storage"
)

func postTx(t *testing.T, srv *Server, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/transactions", bytes.NewBufferString(body))
	req.Header.Set("Authorization", "Bearer testtoken")
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	return rec
}

func validTxJSON(t *testing.T) string {
	t.Helper()
	b, _ := json.Marshal(TransactionJSON{
		TransactionID: "TID100", Amount: 300, Direction: "out", Source: "mpesa",
		Counterparty: "Jane Doe", DateTime: time.Now(), Balance: 1761.18,
		Cost: 7, Category: "food", Reason: "lunch",
	})
	return string(b)
}

func TestPostCreatesTransaction(t *testing.T) {
	srv := newTestServer(t)
	rec := postTx(t, srv, validTxJSON(t))
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}
	all, _ := srv.db.GetAllTransactions()
	if len(all) != 1 || all[0].Recipient != "Jane Doe" || all[0].Direction != "out" {
		t.Fatalf("stored row wrong: %+v", all)
	}
}

func TestPostDuplicateReturns200(t *testing.T) {
	srv := newTestServer(t)
	body := validTxJSON(t)
	if rec := postTx(t, srv, body); rec.Code != http.StatusCreated {
		t.Fatalf("first: %d", rec.Code)
	}
	if rec := postTx(t, srv, body); rec.Code != http.StatusOK {
		t.Fatalf("duplicate: %d, want 200", rec.Code)
	}
}

func TestPostRejectsBadInput(t *testing.T) {
	srv := newTestServer(t)
	cases := map[string]string{
		"malformed json": `{not json`,
		"missing txn id": strings.Replace(validTxJSON(t), "TID100", "", 1),
		"bad direction":  strings.Replace(validTxJSON(t), `"out"`, `"sideways"`, 1),
		"bad source":     strings.Replace(validTxJSON(t), `"mpesa"`, `"paypal"`, 1),
		"empty category": strings.Replace(validTxJSON(t), `"food"`, `""`, 1),
	}
	for name, body := range cases {
		if rec := postTx(t, srv, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, rec.Code)
		}
	}
}

func TestGetReturnsAllWithLegacyDefaults(t *testing.T) {
	srv := newTestServer(t)
	// modern row
	if rec := postTx(t, srv, validTxJSON(t)); rec.Code != http.StatusCreated {
		t.Fatalf("seed: %d", rec.Code)
	}
	// legacy row: no direction/source (as written by the Discord bot)
	srv.db.SaveTransaction(&storage.Transaction{
		TransactionID: "LEGACY1", Amount: 100, Recipient: "Old Shop",
		DateTime: time.Now(), Category: "food",
	})

	req := httptest.NewRequest(http.MethodGet, "/api/transactions", nil)
	req.Header.Set("Authorization", "Bearer testtoken")
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got []TransactionJSON
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d rows, want 2", len(got))
	}
	for _, tx := range got {
		if tx.TransactionID == "LEGACY1" && (tx.Direction != "out" || tx.Source != "mpesa") {
			t.Errorf("legacy row defaults wrong: %+v", tx)
		}
	}
}
