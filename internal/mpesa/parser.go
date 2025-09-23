package mpesa

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type ParsedTransaction struct {
	TransactionID string
	Amount        float64
	Recipient     string
	DateTime      time.Time
	Balance       float64
	Cost          float64
}

func ParseMPesaMessage(msg string) (*ParsedTransaction, error) {
	// More permissive pattern to support variants observed in messages:
	// - Optional extra spaces/periods
	// - Optional "for account ..." inside recipient text
	// - "New M-PESA balance is" or "New business balance is"
	// - Optional space before AM/PM
	// - Allow extra trailing text after transaction cost
	// Allow no space before "New ..." (e.g., "PM.New") by making the space optional (\s*)
	// Constrain money captures to avoid swallowing trailing punctuation on cost
	// Ksh<number>[,number]* with optional fractional part
	money := `Ksh[\d,]+(?:\.\d+)?`
	pattern := `(?i)(\w+)\s+Confirmed\.?\s+(` + money + `)\s+(sent|paid)\s+to\s+(.*?)\s*\.?\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?(AM|PM))\.?\s*New\s+(?:M-PESA|business)\s+balance\s+is\s+(` + money + `)\.\s*Transaction\s+cost,?\s*(` + money + `)(?:\.|\b)`
	re := regexp.MustCompile(pattern)
	matches := re.FindStringSubmatch(msg)
	if len(matches) < 10 {
		return nil, fmt.Errorf("not a valid outgoing M-PESA message")
	}

	amountStr := strings.ReplaceAll(strings.TrimPrefix(matches[2], "Ksh"), ",", "")
	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse amount: %w", err)
	}

	recipient := strings.TrimSpace(strings.TrimSuffix(matches[4], "."))
	// Normalize double spaces
	recipient = strings.Join(strings.Fields(recipient), " ")

	dateParts := strings.Split(matches[5], "/")
	day, _ := strconv.Atoi(dateParts[0])
	month, _ := strconv.Atoi(dateParts[1])
	year := 2000 + func() int { y, _ := strconv.Atoi(dateParts[2]); return y }()
	// Ensure time has a space before AM/PM
	timePart := strings.ToUpper(strings.TrimSpace(matches[6]))
	timePart = strings.ReplaceAll(timePart, "AM", " AM")
	timePart = strings.ReplaceAll(timePart, "PM", " PM")
	timePart = strings.ReplaceAll(timePart, "  ", " ")
	// Fix cases where replace might create leading space (e.g., already had space)
	timePart = strings.TrimSpace(timePart)
	if !strings.HasSuffix(timePart, "AM") && !strings.HasSuffix(timePart, "PM") {
		// Fallback to original if we somehow broke it
		timePart = matches[6]
	}
	dateTimeStr := fmt.Sprintf("%d-%02d-%02d %s", year, month, day, timePart)
	dateTime, err := time.Parse("2006-01-02 3:04 PM", dateTimeStr)
	if err != nil {
		return nil, fmt.Errorf("failed to parse date/time: %w", err)
	}

	balanceStr := strings.ReplaceAll(strings.TrimPrefix(matches[8], "Ksh"), ",", "")
	balance, err := strconv.ParseFloat(balanceStr, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse balance: %w", err)
	}

	costStr := strings.ReplaceAll(strings.TrimPrefix(matches[9], "Ksh"), ",", "")
	cost, err := strconv.ParseFloat(costStr, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse cost: %w", err)
	}

	return &ParsedTransaction{
		TransactionID: matches[1],
		Amount:        amount,
		Recipient:     recipient,
		DateTime:      dateTime,
		Balance:       balance,
		Cost:          cost,
	}, nil
}
