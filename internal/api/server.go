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

func (s *Server) handleTransactions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.handlePost(w, r)
	case http.MethodGet:
		s.handleGet(w, r)
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}
