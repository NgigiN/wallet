package discord

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/NgigiN/wallet/internal/config"
	"github.com/NgigiN/wallet/internal/mpesa"
	"github.com/NgigiN/wallet/internal/storage"
	"github.com/bwmarrin/discordgo"
)

type Bot struct {
	session   *discordgo.Session
	db        *storage.Database
	channelID string
	startTime time.Time
}

func NewBot(cfg *config.Config) (*Bot, error) {
	session, err := discordgo.New("Bot " + cfg.DiscordBotToken)
	if err != nil {
		return nil, fmt.Errorf("failed to create Discord session: %w", err)
	}
	db, err := storage.NewDatabase("transaction.db")
	if err != nil {
		return nil, fmt.Errorf("failed to initialize the database: %w", err)
	}

	bot := &Bot{
		session:   session,
		db:        db,
		channelID: cfg.DiscordChannelId,
		startTime: time.Now(),
	}

	session.AddHandler(bot.handleMessage)
	session.Identify.Intents = discordgo.IntentGuildMessages

	return bot, nil
}

func (b *Bot) Start() error {
	// Start health check server
	go b.startHealthServer()

	if err := b.session.Open(); err != nil {
		return fmt.Errorf("failed to open Discord connection: %w", err)
	}
	return nil
}

func (b *Bot) Stop() {
	b.session.Close()
}

func (b *Bot) handleMessage(s *discordgo.Session, m *discordgo.MessageCreate) {
	if m.Author.ID == s.State.User.ID {
		return //bot's messages
	}

	if m.ChannelID != b.channelID {
		return //specific to the channel
	}

	// Check for summary command
	if strings.HasPrefix(m.Content, "!summary") {
		b.handleSummaryCommand(s, m)
		return
	}

	// Check for batch processing (multiple transactions)
	if b.isBatchMessage(m.Content) {
		b.handleBatchMessage(s, m)
		return
	}

	parts := strings.Split(m.Content, "\n")
	if len(parts) < 1 {
		s.ChannelMessageSend(m.ChannelID, "No message content provided")
		return
	}
	parsed, err := mpesa.ParseMPesaMessage(parts[0])
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Invalid Mpesa Message: %v", err))
		return
	}

	category, reason := parseMetadata(parts[1:])
	if !isValidCategory(category) {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Invalid category: %s. \n Use: food, travel, savings, church, investments", category))
		return
	}

	tx := storage.Transaction{
		TransactionID: parsed.TransactionID,
		Amount:        parsed.Amount,
		Recipient:     parsed.Recipient,
		DateTime:      parsed.DateTime,
		Balance:       parsed.Balance,
		Cost:          parsed.Cost,
		Category:      category,
		Reason:        reason,
	}

	if err := b.db.SaveTransaction(&tx); err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to save transaction %s: %v", parsed.TransactionID, err))
		return
	}

	s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Tracked %s: Ksh%.2f to %s in %s", parsed.TransactionID, parsed.Amount, parsed.Recipient, category))
}

func parseMetadata(lines []string) (category, reason string) {
	category = "uncategorized"

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		// Case-insensitive parsing with flexible spacing, supports:
		// "Category: food", "category: food", "c: food", "c:food"
		// "Reason: lunch", "reason: lunch", "r: lunch", "r:lunch"
		lower := strings.ToLower(trimmed)

		// Find the first colon to split key:value
		colonIdx := strings.Index(lower, ":")
		if colonIdx == -1 {
			continue
		}

		key := strings.TrimSpace(lower[:colonIdx])
		value := strings.TrimSpace(trimmed[colonIdx+1:]) // preserve original casing for value

		switch key {
		case "category", "c":
			if value != "" {
				category = value
			}
		case "reason", "r":
			// reason is optional
			reason = value
		}
	}

	return category, reason
}

func isValidCategory(category string) bool {
	validCategories := map[string]bool{
		"food":        true,
		"travel":      true,
		"savings":     true,
		"church":      true,
		"investments": true,
	}
	return validCategories[strings.ToLower(category)]
}

func (b *Bot) handleSummaryCommand(s *discordgo.Session, m *discordgo.MessageCreate) {
	args := strings.Fields(m.Content)

	if len(args) == 1 {
		// !summary - show all categories
		b.handleAllCategoriesSummary(s, m)
	} else if len(args) == 2 {
		// !summary <category> - show specific category
		category := strings.ToLower(args[1])
		if !isValidCategory(category) {
			s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Invalid category: %s. Use: food, travel, savings, church, investments", category))
			return
		}
		b.handleCategorySummary(s, m, category)
	} else {
		s.ChannelMessageSend(m.ChannelID, "Usage: !summary [category]\nExamples:\n!summary - show all categories\n!summary food - show food transactions")
	}
}

func (b *Bot) handleAllCategoriesSummary(s *discordgo.Session, m *discordgo.MessageCreate) {
	summary, err := b.db.GetCategorySummary()
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to get summary: %v", err))
		return
	}

	if len(summary) == 0 {
		s.ChannelMessageSend(m.ChannelID, "No transactions found.")
		return
	}

	var total float64
	response := "📊 **Transaction Summary**\n\n"

	categories := []string{"food", "travel", "savings", "church", "investments"}
	for _, category := range categories {
		if amount, exists := summary[category]; exists {
			response += fmt.Sprintf("**%s**: Ksh%.2f\n", strings.Title(category), amount)
			total += amount
		}
	}

	response += fmt.Sprintf("\n**Total**: Ksh%.2f", total)
	s.ChannelMessageSend(m.ChannelID, response)
}

func (b *Bot) handleCategorySummary(s *discordgo.Session, m *discordgo.MessageCreate, category string) {
	transactions, err := b.db.GetTransactionsByCategory(category)
	if err != nil {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to get transactions: %v", err))
		return
	}

	if len(transactions) == 0 {
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("No transactions found for category: %s", category))
		return
	}

	var total float64
	response := fmt.Sprintf("📊 **%s Transactions**\n\n", strings.Title(category))

	// Show last 10 transactions
	limit := 10
	if len(transactions) < limit {
		limit = len(transactions)
	}

	for i := 0; i < limit; i++ {
		tx := transactions[i]
		total += tx.Amount
		response += fmt.Sprintf("• **Ksh%.2f** to %s\n  %s - %s\n\n",
			tx.Amount, tx.Recipient,
			tx.DateTime.Format("Jan 2, 2006 3:04 PM"),
			tx.Reason)
	}

	if len(transactions) > limit {
		response += fmt.Sprintf("... and %d more transactions\n\n", len(transactions)-limit)
	}

	response += fmt.Sprintf("**Total %s**: Ksh%.2f (%d transactions)", strings.Title(category), total, len(transactions))
	s.ChannelMessageSend(m.ChannelID, response)
}

func (b *Bot) isBatchMessage(content string) bool {
	// Count occurrences of pattern "<ID> Confirmed" anywhere in the content
	re := regexp.MustCompile(`(?i)\b\w+\s+Confirmed\b`)
	matches := re.FindAllStringIndex(content, -1)
	return len(matches) > 1
}

func (b *Bot) handleBatchMessage(s *discordgo.Session, m *discordgo.MessageCreate) {
	// Split into individual transactions scanning entire content, not just lines
	transactions := b.splitIntoTransactions(m.Content)

	if len(transactions) == 0 {
		s.ChannelMessageSend(m.ChannelID, "No valid M-PESA transactions found in batch message")
		return
	}

	successCount := 0
	errorCount := 0
	var errors []string
	var successes []string

	for i, txData := range transactions {
		// Parse the M-PESA message
		parsed, err := mpesa.ParseMPesaMessage(txData.Message)
		if err != nil {
			errorCount++
			errors = append(errors, fmt.Sprintf("%d [%s]: %v", i+1, extractTxnID(txData.Message), err))
			continue
		}

		// Parse metadata
		category, reason := parseMetadata(txData.Metadata)
		if !isValidCategory(category) {
			errorCount++
			errors = append(errors, fmt.Sprintf("%d [%s]: Invalid category '%s'", i+1, parsed.TransactionID, category))
			continue
		}

		// Create transaction record
		tx := storage.Transaction{
			TransactionID: parsed.TransactionID,
			Amount:        parsed.Amount,
			Recipient:     parsed.Recipient,
			DateTime:      parsed.DateTime,
			Balance:       parsed.Balance,
			Cost:          parsed.Cost,
			Category:      category,
			Reason:        reason,
		}

		// Save to database
		if err := b.db.SaveTransaction(&tx); err != nil {
			errorCount++
			errors = append(errors, fmt.Sprintf("%d [%s]: %v", i+1, parsed.TransactionID, err))
			continue
		}

		successCount++
		successes = append(successes, fmt.Sprintf("%d [%s]", i+1, parsed.TransactionID))
	}

	// Send summary response
	response := fmt.Sprintf("📊 **Batch Processing Complete**\n")
	response += fmt.Sprintf("✅ **Successfully processed**: %d/%d transactions\n", successCount, len(transactions))

	if len(successes) > 0 {
		response += "\n**Succeeded:**\n"
		for _, ok := range successes {
			response += fmt.Sprintf("• %s\n", ok)
		}
	}

	if errorCount > 0 {
		response += fmt.Sprintf("❌ **Failed**: %d transactions\n", errorCount)
		response += fmt.Sprintf("**Errors:**\n")
		for _, err := range errors {
			response += fmt.Sprintf("• %s\n", err)
		}
	}

	s.ChannelMessageSend(m.ChannelID, response)
}

type TransactionData struct {
	Message  string
	Metadata []string
}

func extractTxnID(line string) string {
	l := strings.TrimSpace(line)
	re := regexp.MustCompile(`(?i)^(\w+)\s+Confirmed`)
	m := re.FindStringSubmatch(l)
	if len(m) > 1 {
		return m[1]
	}
	// Fallback: first token
	fields := strings.Fields(l)
	if len(fields) > 0 {
		return fields[0]
	}
	return "?"
}

func (b *Bot) splitIntoTransactions(content string) []TransactionData {
	var transactions []TransactionData
	// Find all boundaries where a new transaction starts
	re := regexp.MustCompile(`(?i)\b\w+\s+Confirmed\b`)
	indices := re.FindAllStringIndex(content, -1)
	if len(indices) == 0 {
		return transactions
	}
	// Build slices between boundaries
	starts := make([]int, 0, len(indices))
	for _, pair := range indices {
		starts = append(starts, pair[0])
	}
	starts = append(starts, len(content))

	for i := 0; i < len(starts)-1; i++ {
		segment := strings.TrimSpace(content[starts[i]:starts[i+1]])
		if segment == "" {
			continue
		}
		lines := strings.Split(segment, "\n")
		message := strings.TrimSpace(lines[0])
		var meta []string
		for _, ln := range lines[1:] {
			lt := strings.TrimSpace(ln)
			if lt == "" {
				continue
			}
			low := strings.ToLower(lt)
			if strings.HasPrefix(low, "c:") || strings.HasPrefix(low, "category:") ||
				strings.HasPrefix(low, "r:") || strings.HasPrefix(low, "reason:") {
				meta = append(meta, lt)
			}
		}
		transactions = append(transactions, TransactionData{Message: message, Metadata: meta})
	}
	return transactions
}

func (b *Bot) startHealthServer() {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		uptime := time.Since(b.startTime)
		status := "healthy"

		// Check if Discord connection is alive
		if b.session == nil || b.session.State == nil {
			status = "unhealthy"
			w.WriteHeader(http.StatusServiceUnavailable)
		}

		response := fmt.Sprintf(`{
			"status": "%s",
			"uptime": "%s",
			"discord_connected": %t,
			"timestamp": "%s"
		}`, status, uptime.String(), b.session != nil && b.session.State != nil, time.Now().Format(time.RFC3339))

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(response))
	})

	http.ListenAndServe(":8080", nil)
}
