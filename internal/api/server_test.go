package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/NgigiN/wallet/internal/storage"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	db, err := storage.NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("NewDatabase: %v", err)
	}
	return NewServer(db, "testtoken", func() Health {
		return Health{Status: "healthy", Uptime: "1s", DiscordConnected: true, Timestamp: "now"}
	})
}

func TestHealthEndpoint(t *testing.T) {
	srv := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestHealthUnhealthyReturns503(t *testing.T) {
	db, _ := storage.NewDatabase(filepath.Join(t.TempDir(), "test.db"))
	srv := NewServer(db, "testtoken", func() Health {
		return Health{Status: "unhealthy", DiscordConnected: false}
	})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestTransactionsRequireAuth(t *testing.T) {
	srv := newTestServer(t)
	for _, header := range []string{"", "Bearer wrong", "testtoken"} {
		req := httptest.NewRequest(http.MethodGet, "/api/transactions", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		rec := httptest.NewRecorder()
		srv.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("header %q: status = %d, want 401", header, rec.Code)
		}
	}
}
