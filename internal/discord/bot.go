package discord

import (
	"fmt"
	"strings"

	"github.com/NgigiN/wallet/internal/config"
	"github.com/NgigiN/wallet/internal/mpesa"
	"github.com/NgigiN/wallet/internal/storage"
	"github.com/bwmarrin/discordgo"
)

type Bot struct {
	session   *discordgo.Session
	db        *storage.Database
	channelID string
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
	}

	session.AddHandler(bot.handleMessage)
	session.Identify.Intents = discordgo.IntentGuildMessages

	return bot, nil
}

func (b *Bot) Start() error {
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
		s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Failed to save transaction: %v", err))
		return
	}

	s.ChannelMessageSend(m.ChannelID, fmt.Sprintf("Tracked %s: Ksh%.2f to %s in %s", parsed.TransactionID, parsed.Amount, parsed.Recipient, category))
}

func parseMetadata(lines []string) (category, reason string) {
	category = "uncategorized"
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Category: ") {
			category = strings.TrimSpace(strings.TrimPrefix(line, "Category: "))
		} else if strings.HasPrefix(line, "Reason: ") {
			reason = strings.TrimSpace(strings.TrimPrefix(line, "Reason: "))
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
