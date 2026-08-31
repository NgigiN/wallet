# Backend Ingest API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated HTTP ingest/read API to the existing Go Discord-bot server so the Android capture app can push tagged transactions and pull history.

**Architecture:** A new `internal/api` package owns the HTTP mux (taking over `/health` from the Discord bot) and exposes `POST /api/transactions` (idempotent create) and `GET /api/transactions` (full dump for phone hydration), both behind a static bearer token. `storage.Transaction` gains `Direction` and `Source` columns. The DB path becomes configurable to fix a data-loss bug (DB currently lives outside the mounted volume).

**Tech Stack:** Go 1.24, net/http (stdlib), GORM + SQLite (existing), httptest for tests.

**Spec:** `docs/superpowers/specs/2026-08-31-sms-finance-tracker-design.md`

## Global Constraints

- API auth: `Authorization: Bearer <API_TOKEN>`; `API_TOKEN` comes from env/.env and is **required** at startup.
- API JSON field names exactly: `transaction_id`, `amount`, `direction`, `source`, `counterparty`, `date_time` (RFC3339), `balance`, `cost`, `category`, `reason`.
- `direction` ∈ `in | out | transfer`; `source` ∈ `mpesa | airtel`. Legacy rows (empty columns) are served as `direction:"out"`, `source:"mpesa"`.
- Duplicate `transaction_id` on POST returns **200** (not an error) so phone retries are idempotent.
- Discord bot behavior (message parsing, `!summary`) must not change; all existing tests keep passing.
- Server listens on `:8080` as today; TLS is nginx's job (Task 8).
- Run tests with `go test ./...` from the repo root. Commit after every task.
- Commit messages: plain conventional style, **no AI attribution of any kind**.

## ⚠️ Production data warning (read before deploying anything)

The running container opens `transaction.db` in `/app` (its working directory), but the volume is mounted at `/app/data`. The live database is **inside the container layer and is destroyed on every redeploy**. Task 8 step 1 rescues it BEFORE any deploy of this work.

---

### Task 1: Config — API_TOKEN and DB_PATH

**Files:**
- Modify: `internal/config/config.go`
- Test: `internal/config/config_test.go` (create)

**Interfaces:**
- Produces: `Config.APIToken string`, `Config.DBPath string` — used by Tasks 7 (wiring).

- [ ] **Step 1: Write the failing test**

```go
package config

import "testing"

func setBaseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DISCORD_BOT_TOKEN", "tok")
	t.Setenv("DISCORD_CHANNEL_ID", "chan")
}

func TestLoadRequiresAPIToken(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when API_TOKEN is unset")
	}
}

func TestLoadReadsAPITokenAndDefaultsDBPath(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "secret123")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIToken != "secret123" {
		t.Errorf("APIToken = %q, want %q", cfg.APIToken, "secret123")
	}
	if cfg.DBPath != "transaction.db" {
		t.Errorf("DBPath default = %q, want %q", cfg.DBPath, "transaction.db")
	}
}

func TestLoadReadsDBPath(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "secret123")
	t.Setenv("DB_PATH", "data/transaction.db")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBPath != "data/transaction.db" {
		t.Errorf("DBPath = %q, want %q", cfg.DBPath, "data/transaction.db")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/config/ -v`
Expected: FAIL — `cfg.APIToken undefined` (compile error).

- [ ] **Step 3: Implement**

In `internal/config/config.go`, add fields and loading:

```go
type Config struct {
	DiscordBotToken  string
	DiscordChannelId string
	APIToken         string
	DBPath           string
}
```

and in `Load()`, after the channelID block:

```go
	apiToken := os.Getenv("API_TOKEN")
	if apiToken == "" {
		return nil, fmt.Errorf("API token is not set")
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "transaction.db"
	}

	return &Config{
		DiscordBotToken:  botToken,
		DiscordChannelId: channelID,
		APIToken:         apiToken,
		DBPath:           dbPath,
	}, nil
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/config/ -v` — expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add internal/config/
git commit -m "feat: add API_TOKEN and DB_PATH to config"
```

---

### Task 2: Storage — Direction and Source columns

**Files:**
- Modify: `internal/storage/models.go`
- Test: `internal/storage/db_test.go` (create)

**Interfaces:**
- Produces: `Transaction.Direction string`, `Transaction.Source string` — used by Tasks 5, 6.
- Produces (test helper): `newTestDB(t *testing.T) *Database` — reused in Task 3's tests.

- [ ] **Step 1: Write the failing test**

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/storage/ -v`
Expected: FAIL — `unknown field Direction` (compile error).

- [ ] **Step 3: Implement**

In `internal/storage/models.go` add to `Transaction` after `Reason string`:

```go
	Direction string // "in" | "out" | "transfer"; empty on legacy rows (treated as "out")
	Source    string // "mpesa" | "airtel"; empty on legacy rows (treated as "mpesa")
```

(GORM `AutoMigrate` in `NewDatabase` adds the columns automatically.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/storage/ -v` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/storage/
git commit -m "feat: add direction and source columns to transactions"
```

---

### Task 3: Storage — idempotent CreateTransaction

**Files:**
- Modify: `internal/storage/db.go`
- Test: `internal/storage/db_test.go`

**Interfaces:**
- Consumes: `newTestDB` from Task 2.
- Produces: `func (d *Database) CreateTransaction(tx *Transaction) (created bool, err error)` — `(true,nil)` on insert, `(false,nil)` on duplicate `TransactionID`, `(false,err)` otherwise. Used by Task 5.

- [ ] **Step 1: Write the failing test** (append to `db_test.go`)

```go
func TestCreateTransactionIdempotent(t *testing.T) {
	db := newTestDB(t)
	mk := func() *Transaction {
		return &Transaction{TransactionID: "DUP001", Amount: 50, Recipient: "Shop",
			DateTime: time.Now(), Direction: "out", Source: "mpesa", Category: "food"}
	}
	created, err := db.CreateTransaction(mk())
	if err != nil || !created {
		t.Fatalf("first create: created=%v err=%v, want true,nil", created, err)
	}
	created, err = db.CreateTransaction(mk())
	if err != nil || created {
		t.Fatalf("duplicate create: created=%v err=%v, want false,nil", created, err)
	}
	all, _ := db.GetAllTransactions()
	if len(all) != 1 {
		t.Errorf("got %d rows, want 1", len(all))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/storage/ -v`
Expected: FAIL — `db.CreateTransaction undefined`.

- [ ] **Step 3: Implement** (append to `internal/storage/db.go`)

```go
// CreateTransaction inserts tx. It reports false with a nil error when a row
// with the same TransactionID already exists, so API retries are idempotent.
func (d *Database) CreateTransaction(tx *Transaction) (bool, error) {
	err := d.db.Create(tx).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) || strings.Contains(err.Error(), "UNIQUE constraint failed") {
		return false, nil
	}
	return false, fmt.Errorf("failed to create transaction: %w", err)
}
```

Add `"errors"` to the imports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/storage/ -v` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/storage/db.go internal/storage/db_test.go
git commit -m "feat: add idempotent CreateTransaction to storage"
```

---

### Task 4: api package — server skeleton, /health, bearer auth

**Files:**
- Create: `internal/api/server.go`
- Test: `internal/api/server_test.go`

**Interfaces:**
- Consumes: `*storage.Database` (Tasks 2-3).
- Produces (used by Tasks 5-7):
  - `type Health struct { Status string; Uptime string; DiscordConnected bool; Timestamp string }` (JSON tags: `status`, `uptime`, `discord_connected`, `timestamp`)
  - `func NewServer(db *storage.Database, token string, health func() Health) *Server`
  - `func (s *Server) Handler() http.Handler`
  - `func (s *Server) ListenAndServe(addr string) error`
  - unexported `func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc`

- [ ] **Step 1: Write the failing test**

```go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -v`
Expected: FAIL — package does not exist / `NewServer` undefined.

- [ ] **Step 3: Implement** `internal/api/server.go`

```go
// Package api serves the wallet HTTP API: health plus authenticated
// transaction ingest/read endpoints used by the Android capture app.
package api

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/NgigiN/wallet/internal/storage"
)

type Health struct {
	Status           string `json:"status"`
	Uptime           string `json:"uptime"`
	DiscordConnected bool   `json:"discord_connected"`
	Timestamp        string `json:"timestamp"`
}

type Server struct {
	db     *storage.Database
	token  string
	health func() Health
	mux    *http.ServeMux
}

func NewServer(db *storage.Database, token string, health func() Health) *Server {
	s := &Server{db: db, token: token, health: health, mux: http.NewServeMux()}
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/api/transactions", s.requireAuth(s.handleTransactions))
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s.mux)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	h := s.health()
	w.Header().Set("Content-Type", "application/json")
	if h.Status != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(h)
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got == r.Header.Get("Authorization") || // no Bearer prefix
			subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) != 1 {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// handleTransactions is filled in by later tasks (POST in Task 5, GET in Task 6).
func (s *Server) handleTransactions(w http.ResponseWriter, r *http.Request) {
	http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/api/ -v` — expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add internal/api/
git commit -m "feat: add api package with health endpoint and bearer auth"
```

---

### Task 5: POST /api/transactions

**Files:**
- Create: `internal/api/transactions.go`
- Modify: `internal/api/server.go` (route dispatch)
- Test: `internal/api/transactions_test.go`

**Interfaces:**
- Consumes: `CreateTransaction` (Task 3), `requireAuth` (Task 4).
- Produces: `type TransactionJSON` — the wire format, reused by Task 6 and mirrored by the Android `ApiTransaction` class:

```go
type TransactionJSON struct {
	TransactionID string    `json:"transaction_id"`
	Amount        float64   `json:"amount"`
	Direction     string    `json:"direction"`
	Source        string    `json:"source"`
	Counterparty  string    `json:"counterparty"`
	DateTime      time.Time `json:"date_time"`
	Balance       float64   `json:"balance"`
	Cost          float64   `json:"cost"`
	Category      string    `json:"category"`
	Reason        string    `json:"reason"`
}
```

- [ ] **Step 1: Write the failing test**

```go
package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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
		"malformed json":  `{not json`,
		"missing txn id":  strings.Replace(validTxJSON(t), "TID100", "", 1),
		"bad direction":   strings.Replace(validTxJSON(t), `"out"`, `"sideways"`, 1),
		"bad source":      strings.Replace(validTxJSON(t), `"mpesa"`, `"paypal"`, 1),
		"empty category":  strings.Replace(validTxJSON(t), `"food"`, `""`, 1),
	}
	for name, body := range cases {
		if rec := postTx(t, srv, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, rec.Code)
		}
	}
}
```

Note: `newTestServer` comes from Task 4's test file — same package.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -v`
Expected: FAIL — `TransactionJSON` undefined.

- [ ] **Step 3: Implement** `internal/api/transactions.go`

```go
package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/NgigiN/wallet/internal/storage"
)

type TransactionJSON struct {
	TransactionID string    `json:"transaction_id"`
	Amount        float64   `json:"amount"`
	Direction     string    `json:"direction"`
	Source        string    `json:"source"`
	Counterparty  string    `json:"counterparty"`
	DateTime      time.Time `json:"date_time"`
	Balance       float64   `json:"balance"`
	Cost          float64   `json:"cost"`
	Category      string    `json:"category"`
	Reason        string    `json:"reason"`
}

var validDirections = map[string]bool{"in": true, "out": true, "transfer": true}
var validSources = map[string]bool{"mpesa": true, "airtel": true}

func (t *TransactionJSON) validate() string {
	switch {
	case t.TransactionID == "":
		return "transaction_id is required"
	case t.Amount <= 0:
		return "amount must be positive"
	case !validDirections[t.Direction]:
		return "direction must be in, out, or transfer"
	case !validSources[t.Source]:
		return "source must be mpesa or airtel"
	case t.DateTime.IsZero():
		return "date_time is required"
	case t.Category == "":
		return "category is required"
	}
	return ""
}

func (s *Server) handlePost(w http.ResponseWriter, r *http.Request) {
	var in TransactionJSON
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if msg := in.validate(); msg != "" {
		writeJSONError(w, http.StatusBadRequest, msg)
		return
	}
	created, err := s.db.CreateTransaction(&storage.Transaction{
		TransactionID: in.TransactionID,
		Amount:        in.Amount,
		Recipient:     in.Counterparty,
		DateTime:      in.DateTime,
		Balance:       in.Balance,
		Cost:          in.Cost,
		Category:      in.Category,
		Reason:        in.Reason,
		Direction:     in.Direction,
		Source:        in.Source,
	})
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "storage error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if created {
		w.WriteHeader(http.StatusCreated)
	} // duplicate falls through as 200
	json.NewEncoder(w).Encode(map[string]bool{"created": created})
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
```

In `internal/api/server.go`, replace the `handleTransactions` body:

```go
func (s *Server) handleTransactions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.handlePost(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/api/ -v` — expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add internal/api/
git commit -m "feat: add POST /api/transactions with validation and idempotency"
```

---

### Task 6: GET /api/transactions

**Files:**
- Modify: `internal/api/transactions.go`, `internal/api/server.go`
- Test: `internal/api/transactions_test.go`

**Interfaces:**
- Consumes: `GetAllTransactions` (existing), `TransactionJSON` (Task 5).
- Produces: GET returns `[]TransactionJSON`; legacy rows get `direction:"out"`, `source:"mpesa"`.

- [ ] **Step 1: Write the failing test** (append)

```go
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
```

Add `"github.com/NgigiN/wallet/internal/storage"` to the test file imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./internal/api/ -v`
Expected: FAIL — GET returns 405.

- [ ] **Step 3: Implement** (append to `transactions.go`)

```go
func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.GetAllTransactions()
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "storage error")
		return
	}
	out := make([]TransactionJSON, 0, len(rows))
	for _, tx := range rows {
		direction, source := tx.Direction, tx.Source
		if direction == "" {
			direction = "out"
		}
		if source == "" {
			source = "mpesa"
		}
		out = append(out, TransactionJSON{
			TransactionID: tx.TransactionID,
			Amount:        tx.Amount,
			Direction:     direction,
			Source:        source,
			Counterparty:  tx.Recipient,
			DateTime:      tx.DateTime,
			Balance:       tx.Balance,
			Cost:          tx.Cost,
			Category:      tx.Category,
			Reason:        tx.Reason,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}
```

Add `case http.MethodGet: s.handleGet(w, r)` to the switch in `handleTransactions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test ./internal/api/ -v` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/api/
git commit -m "feat: add GET /api/transactions with legacy-row defaults"
```

---

### Task 7: Wiring — main.go, bot refactor, health handover

**Files:**
- Modify: `cmd/main.go`
- Modify: `internal/discord/bot.go` (lines 17-30 struct/NewBot, 47-55 Start, 440-463 delete startHealthServer)

**Interfaces:**
- Consumes: `api.NewServer`, `api.Health` (Task 4), `config` fields (Task 1).
- Produces: `discord.NewBot(cfg *config.Config, db *storage.Database) (*Bot, error)` (signature change) and `func (b *Bot) Health() api.Health`.

- [ ] **Step 1: Refactor the bot**

In `internal/discord/bot.go`:
1. Change `NewBot` to accept the DB: `func NewBot(cfg *config.Config, db *storage.Database) (*Bot, error)` — delete the internal `storage.NewDatabase("transaction.db")` call and assign the parameter instead.
2. In `Start()`, delete the line `go b.startHealthServer()`.
3. Delete the whole `startHealthServer` method (lines 440-463) and remove `"net/http"` from imports.
4. Add (with `"github.com/NgigiN/wallet/internal/api"` and keeping `"time"` imported):

```go
// Health reports bot liveness for the API server's /health endpoint.
func (b *Bot) Health() api.Health {
	connected := b.session != nil && b.session.State != nil
	status := "healthy"
	if !connected {
		status = "unhealthy"
	}
	return api.Health{
		Status:           status,
		Uptime:           time.Since(b.startTime).String(),
		DiscordConnected: connected,
		Timestamp:        time.Now().Format(time.RFC3339),
	}
}
```

- [ ] **Step 2: Rewire main.go**

Replace the bot-construction block in `cmd/main.go` (keep the godotenv/config/signal handling around it):

```go
	db, err := storage.NewDatabase(cfg.DBPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to open database: %v\n", err)
		os.Exit(1)
	}

	bot, err := discord.NewBot(cfg, db)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize the discord bot: %v\n", err)
		os.Exit(1)
	}
	if err := bot.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start bot: %v\n", err)
		os.Exit(1)
	}

	apiServer := api.NewServer(db, cfg.APIToken, bot.Health)
	go func() {
		if err := apiServer.ListenAndServe(":8080"); err != nil {
			log.Printf("api server stopped: %v", err)
		}
	}()
```

Add imports: `"github.com/NgigiN/wallet/internal/api"`, `"github.com/NgigiN/wallet/internal/storage"`.

- [ ] **Step 3: Build and run all tests**

Run: `go build ./... && go test ./...`
Expected: everything compiles, all packages PASS.

- [ ] **Step 4: Smoke test locally**

```bash
API_TOKEN=devtoken DISCORD_BOT_TOKEN=fake DISCORD_CHANNEL_ID=fake DB_PATH=/tmp/smoke.db ./financial-tracker &
sleep 1
curl -s localhost:8080/health
curl -s -X POST localhost:8080/api/transactions -H "Authorization: Bearer devtoken" \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"SMOKE1","amount":10,"direction":"out","source":"mpesa","counterparty":"Test","date_time":"2026-08-31T10:00:00+03:00","balance":100,"cost":0,"category":"food","reason":""}'
curl -s localhost:8080/api/transactions -H "Authorization: Bearer devtoken"
kill %1
```

Build first with `go build -o financial-tracker cmd/main.go`. Note: the bot will fail to connect to Discord with fake creds — if `NewBot`/`Start` exits on Discord failure, smoke-test the API handlers via `go test` only and verify /health wiring in deployment instead. Expected where it runs: health JSON, `{"created":true}`, then a 1-element array.

- [ ] **Step 5: Commit**

```bash
git add cmd/main.go internal/discord/bot.go
git commit -m "refactor: move HTTP serving to api package and wire ingest endpoints"
```

---

### Task 8: Deployment — data rescue, env, nginx TLS (GUIDED — run with the user)

**Files:**
- Modify: `docker-compose.yml`, `.github/workflows/deploy.yml`, `README.md`
- Create: `deploy/nginx-wallet.conf`

**Interfaces:**
- Consumes: `API_TOKEN`, `DB_PATH` (Task 1).
- Produces: public HTTPS base URL for the Android app's Settings screen.

- [ ] **Step 1: ⚠️ RESCUE THE LIVE DATABASE (before any redeploy)**

On the server, the DB is inside the container layer (see warning at top):

```bash
docker cp financial-tracker-bot:/app/transaction.db /home/deploy/opt/wallet/data/transaction.db
sqlite3 /home/deploy/opt/wallet/data/transaction.db "SELECT COUNT(*) FROM transactions;"  # sanity check
```

- [ ] **Step 2: Update docker-compose.yml**

Add to the service's `environment:` block:

```yaml
      - API_TOKEN=${API_TOKEN}
      - DB_PATH=data/transaction.db
```

and change the ports mapping so 8080 is loopback-only (nginx fronts it):

```yaml
    ports:
      - "127.0.0.1:8080:8080"
```

- [ ] **Step 3: Update CI and README**

In `.github/workflows/deploy.yml`, wherever `DISCORD_BOT_TOKEN` is passed to the server/.env, add `API_TOKEN: ${{ secrets.API_TOKEN }}` the same way. Add the `API_TOKEN` repo secret in GitHub (generate: `openssl rand -hex 32`). In `README.md`'s environment-variables table add rows for `API_TOKEN` (required) and `DB_PATH` (default `transaction.db`; set `data/transaction.db` in Docker).

- [ ] **Step 4: Install `deploy/nginx-wallet.conf` on the VPS** (user's house style: `block-probes.conf` + `cloudflare-realip.conf` snippets, 80→443 redirect, Let's Encrypt certs — the repo file carries the full config and first-time install steps in its header comment)

Domain: **wallet.samtama.lol**, Cloudflare-proxied to the VPS (193.187.129.179). Because the cert doesn't exist yet: add the Cloudflare A record, install the port-80 block only, run `certbot --nginx -d wallet.samtama.lol`, then install the full file and reload. The old `irs-bot` site (IP-based `/health` proxy) is superseded — remove its sites-enabled symlink.

- [ ] **Step 5: Deploy with the user and verify**

With the user: set the `API_TOKEN` GitHub secret, then push to `main` to trigger deploy. Verify from outside:

```bash
curl -s https://wallet.samtama.lol/health
curl -s https://wallet.samtama.lol/api/transactions -H "Authorization: Bearer $API_TOKEN" | head -c 200
sqlite3 data/transaction.db "SELECT COUNT(*) FROM transactions;"  # on server: count unchanged after redeploy
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .github/workflows/deploy.yml README.md deploy/
git commit -m "feat: deployment config for ingest API behind nginx TLS"
```

---

## Self-review notes

- Spec coverage: §5.1 (Task 4, 7), §5.2 POST (Task 5), GET (Task 6), §5.3 columns + legacy defaults (Tasks 2, 6), §5.4 nginx (Task 8), §7 backend tests (Tasks 4-6). Data-loss fix is additional (found during planning; DB path vs volume mount).
- The Android plan consumes: base URL from Task 8, `API_TOKEN`, and the `TransactionJSON` wire format from Task 5 exactly.
