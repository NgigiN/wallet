package config

import (
	"fmt"
	"os"
)

type Config struct {
	DiscordBotToken  string
	DiscordChannelId string
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

	return &Config{
		DiscordBotToken:  botToken,
		DiscordChannelId: channelID,
	}, nil
}
