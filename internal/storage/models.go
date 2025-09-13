package storage

import (
	"time"

	"gorm.io/gorm"
)

// Transaction represents a stored financial transaction.
type Transaction struct {
	gorm.Model
	TransactionID string `gorm:"uniqueIndex"`
	Amount        float64
	Recipient     string
	DateTime      time.Time
	Balance       float64
	Cost          float64
	Category      string
	Reason        string
}
