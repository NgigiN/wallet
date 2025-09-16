#!/bin/bash

cd /home/deploy/opt/wallet

if pgrep -f financial-tracker > /dev/null; then
  echo "Stopping existing financial-tracker process"
  pkill -f financial-tracker
  sleep 3
  if pgrep -f financial-tracker > /dev/null; then
    echo "Force killing financial-tracker process"
    pkill -9 -f financial-tracker
    sleep 2
  fi
else
  echo "No existing financial-tracker process found"
fi

echo "Building application..."
go build -o financial-tracker ./cmd

echo "Starting financial-tracker in detached session..."
setsid ./financial-tracker > app.log 2>&1 < /dev/null &

APP_PID=$!
echo "Process started with PID: $APP_PID"

sleep 2

if pgrep -f financial-tracker > /dev/null; then
  echo "Application started successfully"
  echo "Process ID: $(pgrep -f financial-tracker)"
else
  echo "Application failed to start"
  echo "Recent logs:"
  tail -10 app.log
  exit 1
fi

echo "Deployment completed successfully"
