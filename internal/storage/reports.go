package storage

import "time"

// NamedTotal is a generic (label, amount) pair used by the period-scoped
// report queries below.
type NamedTotal struct {
	Name  string
	Total float64
}

// PeriodTotals sums incoming and outgoing money (outgoing includes fees) for
// transactions in [from, to).
func (d *Database) PeriodTotals(from, to time.Time) (moneyIn, moneyOut float64, err error) {
	if err = d.db.Model(&Transaction{}).
		Where("direction = ? AND date_time >= ? AND date_time < ?", "in", from, to).
		Select("COALESCE(SUM(amount), 0)").Scan(&moneyIn).Error; err != nil {
		return 0, 0, err
	}
	if err = d.db.Model(&Transaction{}).
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Select("COALESCE(SUM(amount + cost), 0)").Scan(&moneyOut).Error; err != nil {
		return 0, 0, err
	}
	return moneyIn, moneyOut, nil
}

// CategoryTotals sums outgoing spend per category in [from, to), highest first.
func (d *Database) CategoryTotals(from, to time.Time) ([]NamedTotal, error) {
	var results []NamedTotal
	err := d.db.Model(&Transaction{}).
		Select("category AS name, SUM(amount + cost) AS total").
		Where("direction = ? AND category IS NOT NULL AND date_time >= ? AND date_time < ?", "out", from, to).
		Group("category").Order("total DESC").Scan(&results).Error
	return results, err
}
