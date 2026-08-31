package config

import "testing"

func setBaseEnv(t *testing.T) {
	t.Helper()
	t.Setenv("DISCORD_BOT_TOKEN", "tok")
	t.Setenv("DISCORD_CHANNEL_ID", "chan")
}

func TestLoadRequiresAPIToken(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "")
	if _, err := Load(); err == nil {
		t.Fatal("expected error when API_TOKEN is unset")
	}
}

func TestLoadReadsAPITokenAndDefaultsDBPath(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "secret123")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.APIToken != "secret123" {
		t.Errorf("APIToken = %q, want %q", cfg.APIToken, "secret123")
	}
	if cfg.DBPath != "transaction.db" {
		t.Errorf("DBPath default = %q, want %q", cfg.DBPath, "transaction.db")
	}
}

func TestLoadReadsDBPath(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("API_TOKEN", "secret123")
	t.Setenv("DB_PATH", "data/transaction.db")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.DBPath != "data/transaction.db" {
		t.Errorf("DBPath = %q, want %q", cfg.DBPath, "data/transaction.db")
	}
}
