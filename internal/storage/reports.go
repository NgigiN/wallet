package storage

import (
	"sort"
	"time"
)

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

// TopCounterparties sums outgoing spend per recipient in [from, to), highest
// first, capped at limit.
func (d *Database) TopCounterparties(from, to time.Time, limit int) ([]NamedTotal, error) {
	var results []NamedTotal
	err := d.db.Model(&Transaction{}).
		Select("recipient AS name, SUM(amount) AS total").
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Group("recipient").Order("total DESC").Limit(limit).Scan(&results).Error
	return results, err
}

// BiggestExpenses returns the largest outgoing transactions in [from, to),
// capped at limit.
func (d *Database) BiggestExpenses(from, to time.Time, limit int) ([]Transaction, error) {
	var results []Transaction
	err := d.db.
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Order("amount DESC").Limit(limit).Find(&results).Error
	return results, err
}

// TopDays sums outgoing spend per calendar day in [from, to), highest first,
// capped at limit. Grouping happens in Go, not via SQL strftime, since rows
// written by the Discord bot and by the Android sync API don't necessarily
// share one SQLite date/time text format.
func (d *Database) TopDays(from, to time.Time, limit int) ([]NamedTotal, error) {
	var rows []Transaction
	if err := d.db.
		Where("direction = ? AND date_time >= ? AND date_time < ?", "out", from, to).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	byDay := make(map[string]float64)
	for _, r := range rows {
		byDay[r.DateTime.Format("2006-01-02")] += r.Amount + r.Cost
	}
	results := make([]NamedTotal, 0, len(byDay))
	for day, total := range byDay {
		results = append(results, NamedTotal{Name: day, Total: total})
	}
	sort.Slice(results, func(i, j int) bool { return results[i].Total > results[j].Total })
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}
