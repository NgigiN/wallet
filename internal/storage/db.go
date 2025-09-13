package storage

import (
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Database struct {
	db *gorm.DB
}

func NewDatabase(dbPath string) (*Database, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	if err := db.AutoMigrate(&Transaction{}); err != nil {
		return nil, fmt.Errorf("failed to migrate schema: %w", err)
	}

	return &Database{db: db}, nil
}

func (d *Database) SaveTransaction(tx *Transaction) error {
	if err := d.db.Create(tx).Error; err != nil {
		return fmt.Errorf("failed to save transaction: %w", err)
	}
	return nil
}
