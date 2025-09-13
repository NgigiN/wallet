package storage

import (
	"fmt"
	"strings"

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

func (d *Database) GetTransactionsByCategory(category string) ([]Transaction, error) {
	var transactions []Transaction
	query := d.db.Where("category = ?", strings.ToLower(category)).Order("date_time DESC")
	if err := query.Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to get transactions by category: %w", err)
	}
	return transactions, nil
}

func (d *Database) GetAllTransactions() ([]Transaction, error) {
	var transactions []Transaction
	if err := d.db.Order("date_time DESC").Find(&transactions).Error; err != nil {
		return nil, fmt.Errorf("failed to get all transactions: %w", err)
	}
	return transactions, nil
}

func (d *Database) GetCategorySummary() (map[string]float64, error) {
	var results []struct {
		Category string
		Total    float64
	}

	if err := d.db.Model(&Transaction{}).Select("category, SUM(amount) as total").Group("category").Scan(&results).Error; err != nil {
		return nil, fmt.Errorf("failed to get category summary: %w", err)
	}

	summary := make(map[string]float64)
	for _, result := range results {
		summary[result.Category] = result.Total
	}

	return summary, nil
}
