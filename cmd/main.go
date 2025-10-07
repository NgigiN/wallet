package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/NgigiN/wallet/internal/config"
	"github.com/NgigiN/wallet/internal/discord"
	"github.com/joho/godotenv"
)

func main() {
	// Try to load .env file for local development, but don't fail if it doesn't exist
	// In Docker/production, environment variables are passed via -e flags
	err := godotenv.Load()
	if err != nil {
		// Only log a warning, don't fail - environment variables might be set directly
		log.Printf("Warning: Could not load .env file: %v (this is OK if using environment variables)", err)
	}

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load configuration %v\n", err)
		os.Exit(1)
	}

	bot, err := discord.NewBot(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize the discord bot: %v\n", err)
		os.Exit(1)
	}
	if err := bot.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start bot: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Bot is running...")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt)
	<-sc

	bot.Stop()
	fmt.Println("Bot stopped.")
}
