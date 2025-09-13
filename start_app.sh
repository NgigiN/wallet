#!/bin/bash

# Navigate to the correct directory
cd /home/deploy/opt/wallet

# Load environment variables
if [ -f ".env" ]; then
  echo "📄 Loading environment variables from .env file"
  export $(cat .env | grep -v '^#' | xargs)
else
  echo "❌ .env file not found"
  exit 1
fi

# Check if environment variables are set
if [ -z "$DISCORD_BOT_TOKEN" ] || [ -z "$DISCORD_CHANNEL_ID" ]; then
  echo "❌ Environment variables not set. Please check .env file"
  echo "Current values:"
  echo "DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN:0:10}..."
  echo "DISCORD_CHANNEL_ID: $DISCORD_CHANNEL_ID"
  exit 1
fi

# Stop any existing process gracefully
if pgrep -f financial-tracker > /dev/null; then
  echo "🛑 Stopping existing financial-tracker process"
  pkill -f financial-tracker
  sleep 3
  # Force kill if still running
  if pgrep -f financial-tracker > /dev/null; then
    echo "🔨 Force killing financial-tracker process"
    pkill -9 -f financial-tracker
    sleep 2
  fi
else
  echo "ℹ️  No existing financial-tracker process found"
fi

# Build the application
echo "🔨 Building application..."
go build -o financial-tracker ./cmd

# Start the application detached from the terminal
echo "🚀 Starting financial-tracker in detached session..."
setsid ./financial-tracker > app.log 2>&1 < /dev/null &

# Get the process ID
APP_PID=$!
echo "📋 Process started with PID: $APP_PID"

# Give it a moment to start
sleep 2

# Verify it's running
if pgrep -f financial-tracker > /dev/null; then
  echo "✅ Application started successfully"
  echo "Process ID: $(pgrep -f financial-tracker)"
else
  echo "❌ Application failed to start"
  echo "Recent logs:"
  tail -10 app.log
  exit 1
fi

echo "🎉 Deployment completed successfully"
