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

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
