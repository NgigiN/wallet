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
	err := godotenv.Load()
	if err != nil {
		log.Fatalf("Error loading .env file: %v", err)
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
