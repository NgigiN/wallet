package discord

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/NgigiN/wallet/internal/storage"
)

var monthNames = map[string]time.Month{
	"jan": time.January, "january": time.January,
	"feb": time.February, "february": time.February,
	"mar": time.March, "march": time.March,
	"apr": time.April, "april": time.April,
	"may": time.May,
	"jun": time.June, "june": time.June,
	"jul": time.July, "july": time.July,
	"aug": time.August, "august": time.August,
	"sep": time.September, "sept": time.September, "september": time.September,
	"oct": time.October, "october": time.October,
	"nov": time.November, "november": time.November,
	"dec": time.December, "december": time.December,
}

// weekRange returns [Monday 00:00, next Monday 00:00) for the ISO week containing ref.
func weekRange(ref time.Time) (time.Time, time.Time) {
	wd := int(ref.Weekday())
	if wd == 0 {
		wd = 7
	}
	monday := time.Date(ref.Year(), ref.Month(), ref.Day(), 0, 0, 0, 0, ref.Location()).AddDate(0, 0, -(wd - 1))
	return monday, monday.AddDate(0, 0, 7)
}

// monthRange returns [1st 00:00, next month's 1st 00:00) for the month containing ref.
func monthRange(ref time.Time) (time.Time, time.Time) {
	start := time.Date(ref.Year(), ref.Month(), 1, 0, 0, 0, 0, ref.Location())
	return start, start.AddDate(0, 1, 0)
}

// isoWeekStart returns the Monday that begins ISO week `week` of `year`.
// ISO week 1 is, equivalently, the week containing January 4th.
func isoWeekStart(year, week int) time.Time {
	jan4 := time.Date(year, 1, 4, 0, 0, 0, 0, time.UTC)
	week1Monday, _ := weekRange(jan4)
	return week1Monday.AddDate(0, 0, (week-1)*7)
}

func isoWeekOf(t time.Time) int {
	_, week := t.ISOWeek()
	return week
}

// resolveWeek parses `!week` args (none, or a week number 1-53) into a
// [from, to) range and a display label. now is injected for testability.
func resolveWeek(args []string, now time.Time) (from, to time.Time, label string, err error) {
	if len(args) == 0 {
		from, to = weekRange(now)
		return from, to, fmt.Sprintf("Week %d (so far)", isoWeekOf(now)), nil
	}
	n, convErr := strconv.Atoi(args[0])
	if convErr != nil || n < 1 || n > 53 {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid week number %q — use 1-53", args[0])
	}
	start := isoWeekStart(now.Year(), n)
	return start, start.AddDate(0, 0, 7), fmt.Sprintf("Week %d", n), nil
}

// resolveMonth parses `!month` args (none, a name, or a number 1-12) into a
// [from, to) range and a display label.
func resolveMonth(args []string, now time.Time) (from, to time.Time, label string, err error) {
	if len(args) == 0 {
		from, to = monthRange(now)
		return from, to, now.Month().String() + " " + strconv.Itoa(now.Year()), nil
	}
	arg := strings.ToLower(args[0])
	var month time.Month
	if n, convErr := strconv.Atoi(arg); convErr == nil {
		if n < 1 || n > 12 {
			return time.Time{}, time.Time{}, "", fmt.Errorf("invalid month number %q — use 1-12", args[0])
		}
		month = time.Month(n)
	} else if m, ok := monthNames[arg]; ok {
		month = m
	} else {
		return time.Time{}, time.Time{}, "", fmt.Errorf("invalid month %q — use a name (august) or a number (1-12)", args[0])
	}
	start := time.Date(now.Year(), month, 1, 0, 0, 0, 0, now.Location())
	return start, start.AddDate(0, 1, 0), month.String() + " " + strconv.Itoa(now.Year()), nil
}

func resolveLastWeek(now time.Time) (from, to time.Time, label string) {
	prevRef := now.AddDate(0, 0, -7)
	from, to = weekRange(prevRef)
	return from, to, fmt.Sprintf("Week %d", isoWeekOf(prevRef))
}

func resolveLastMonth(now time.Time) (from, to time.Time, label string) {
	prevRef := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -1, 0)
	from, to = monthRange(prevRef)
	return from, to, prevRef.Month().String() + " " + strconv.Itoa(prevRef.Year())
}

func comparisonLine(current, previous float64) string {
	if previous <= 0 {
		return "new — no spend last period to compare"
	}
	pct := int(math.Round((current - previous) / previous * 100))
	arrow := "↑"
	if pct < 0 {
		arrow = "↓"
		pct = -pct
	}
	return fmt.Sprintf("%s%d%% vs previous period", arrow, pct)
}

func savingsRateText(moneyIn, moneyOut float64) string {
	if moneyIn <= 0 {
		return ""
	}
	rate := int(math.Round((moneyIn - moneyOut) / moneyIn * 100))
	return fmt.Sprintf("Savings rate: %d%%", rate)
}

func formatPeriodReview(label string, moneyIn, moneyOut, prevMoneyOut float64, cats, days, counterparties []storage.NamedTotal, biggest []storage.Transaction) string {
	if moneyIn == 0 && moneyOut == 0 {
		return fmt.Sprintf("📊 **%s**\n\nNo transactions found for this period.", label)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "📊 **%s**\n\n", label)
	fmt.Fprintf(&b, "Net: Ksh%.2f · In: Ksh%.2f · Out: Ksh%.2f\n", moneyIn-moneyOut, moneyIn, moneyOut)
	fmt.Fprintf(&b, "%s\n", comparisonLine(moneyOut, prevMoneyOut))
	if sr := savingsRateText(moneyIn, moneyOut); sr != "" {
		fmt.Fprintf(&b, "%s\n", sr)
	}
	if len(cats) > 0 {
		b.WriteString("\n**By category**\n")
		for _, c := range cats {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", strings.Title(c.Name), c.Total)
		}
	}
	if len(days) > 0 {
		b.WriteString("\n**Top spending days**\n")
		for _, d := range days {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", d.Name, d.Total)
		}
	}
	if len(biggest) > 0 {
		b.WriteString("\n**Biggest expenses**\n")
		for _, tx := range biggest {
			fmt.Fprintf(&b, "• Ksh%.2f to %s\n", tx.Amount, tx.Recipient)
		}
	}
	if len(counterparties) > 0 {
		b.WriteString("\n**Top counterparties**\n")
		for _, c := range counterparties {
			fmt.Fprintf(&b, "• %s: Ksh%.2f\n", c.Name, c.Total)
		}
	}
	return b.String()
}
