package discord

import (
	"testing"
	"time"
)

func TestResolveWeekDefaultsToCurrentIsoWeek(t *testing.T) {
	now := time.Date(2026, 9, 8, 15, 0, 0, 0, time.UTC) // Tuesday, ISO week 37
	from, to, label, err := resolveWeek(nil, now)
	if err != nil {
		t.Fatalf("resolveWeek: %v", err)
	}
	wantFrom := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	wantTo := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	if !from.Equal(wantFrom) || !to.Equal(wantTo) {
		t.Errorf("got [%v, %v), want [%v, %v)", from, to, wantFrom, wantTo)
	}
	if label != "Week 37 (so far)" {
		t.Errorf("got label %q, want %q", label, "Week 37 (so far)")
	}
}

func TestResolveWeekWithExplicitNumber(t *testing.T) {
	now := time.Date(2026, 9, 8, 15, 0, 0, 0, time.UTC)
	from, _, label, err := resolveWeek([]string{"36"}, now)
	if err != nil {
		t.Fatalf("resolveWeek: %v", err)
	}
	if from.Weekday() != time.Monday {
		t.Errorf("week start %v is not a Monday", from)
	}
	if label != "Week 36" {
		t.Errorf("got label %q, want %q", label, "Week 36")
	}
}

func TestResolveWeekRejectsOutOfRangeNumber(t *testing.T) {
	if _, _, _, err := resolveWeek([]string{"99"}, time.Now()); err == nil {
		t.Fatal("expected an error for week 99")
	}
}

func TestResolveMonthByNameAndByNumberAgree(t *testing.T) {
	now := time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC)
	from, to, _, err := resolveMonth([]string{"august"}, now)
	if err != nil {
		t.Fatalf("resolveMonth(august): %v", err)
	}
	if from.Month() != time.August || to.Month() != time.September {
		t.Errorf("got [%v, %v)", from, to)
	}
	from2, _, _, err := resolveMonth([]string{"8"}, now)
	if err != nil || !from2.Equal(from) {
		t.Errorf("resolveMonth(8) = %v, err=%v, want %v", from2, err, from)
	}
}

func TestResolveMonthRejectsInvalidInput(t *testing.T) {
	if _, _, _, err := resolveMonth([]string{"smarch"}, time.Now()); err == nil {
		t.Fatal("expected an error for an invalid month name")
	}
	if _, _, _, err := resolveMonth([]string{"13"}, time.Now()); err == nil {
		t.Fatal("expected an error for month 13")
	}
}

func TestResolveLastWeekAndLastMonth(t *testing.T) {
	now := time.Date(2026, 9, 8, 0, 0, 0, 0, time.UTC)
	_, _, wLabel := resolveLastWeek(now)
	if wLabel != "Week 36" {
		t.Errorf("got %q, want %q", wLabel, "Week 36")
	}
	_, _, mLabel := resolveLastMonth(now)
	if mLabel != "August 2026" {
		t.Errorf("got %q, want %q", mLabel, "August 2026")
	}
}

func TestComparisonLineAndSavingsRateText(t *testing.T) {
	if got := comparisonLine(1080, 1000); got != "↑8% vs previous period" {
		t.Errorf("got %q", got)
	}
	if got := comparisonLine(920, 1000); got != "↓8% vs previous period" {
		t.Errorf("got %q", got)
	}
	if got := comparisonLine(500, 0); got != "new — no spend last period to compare" {
		t.Errorf("got %q", got)
	}
	if got := savingsRateText(1000, 700); got != "Savings rate: 30%" {
		t.Errorf("got %q", got)
	}
	if got := savingsRateText(0, 700); got != "" {
		t.Errorf("got %q, want empty string when there was no income", got)
	}
}
