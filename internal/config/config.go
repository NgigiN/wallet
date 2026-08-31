package config

import (
	"fmt"
	"os"
)

type Config struct {
	DiscordBotToken  string
	DiscordChannelId string
	APIToken         string
	DBPath           string
}

func Load() (*Config, error) {
	botToken := os.Getenv("DISCORD_BOT_TOKEN")
	if botToken == "" {
		return nil, fmt.Errorf("Bot token is not set")
	}
	channelID := os.Getenv("DISCORD_CHANNEL_ID")
	if channelID == "" {
		return nil, fmt.Errorf("Channel ID is not set")
	}

	apiToken := os.Getenv("API_TOKEN")
	if apiToken == "" {
		return nil, fmt.Errorf("API token is not set")
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "transaction.db"
	}

	return &Config{
		DiscordBotToken:  botToken,
		DiscordChannelId: channelID,
		APIToken:         apiToken,
		DBPath:           dbPath,
	}, nil
}
