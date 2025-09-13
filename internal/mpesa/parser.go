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
	pattern := `(\w+) Confirmed\. (Ksh[\d.,]+) (sent|paid) to (.*?) on (\d{1,2}/\d{1,2}/\d{2}) at (\d{1,2}:\d{2} (AM|PM))\.? ?New M-PESA balance is (Ksh[\d.,]+)\. Transaction cost, (Ksh[\d.,]+)\.`
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

	recipient := strings.TrimSuffix(strings.TrimSpace(matches[4]), ".")

	dateParts := strings.Split(matches[5], "/")
	day, _ := strconv.Atoi(dateParts[0])
	month, _ := strconv.Atoi(dateParts[1])
	year := 2000 + func() int { y, _ := strconv.Atoi(dateParts[2]); return y }()
	dateTimeStr := fmt.Sprintf("%d-%02d-%02d %s", year, month, day, matches[6])
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
