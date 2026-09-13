> **2026-09-13: Wallet v2 is live.** The Go backend and Discord bot described below were retired at the production cutover. The backend is now the TypeScript service in `server/`, the web app is `web/`, deployment is `deploy/`. This README is rewritten in Phase 4 (see `docs/superpowers/PROGRESS.md`).

# Wallet

A personal finance tracker with two parts sharing one backend database:

- **Go backend** — a Discord bot that parses M-PESA/Airtel SMS forwarded as
  messages, plus an authenticated HTTP API the Android app syncs through.
  Deployed at `wallet.samtama.lol`.
- **Android app** (`android/`) — intercepts M-PESA/Airtel SMS directly on the
  phone, prompts you to tag it, and syncs to the same backend. Has its own
  Stats/Review screens and local budgets (see [Android App](#android-app)
  below).

Both surfaces read and write the same `transactions` table, so a transaction
tagged on the phone shows up in `!summary`/`!week`/`!month` on Discord, and
vice versa for anything entered directly in the Discord channel.

## Features

- **Automated M-PESA/Airtel Parsing**: Extracts transaction details from SMS/Discord messages
- **Batch Processing**: Process multiple transactions in a single Discord message
- **Category Management**: `food`, `travel`, `savings`, `church`, `investments`, plus `income` and `transfer` (auto-tagged; see [Supported Categories](#supported-categories) for the Discord-vs-app distinction)
- **Flexible Metadata**: Use full or abbreviated forms (`Category:` or `c:`, `Reason:` or `r:`)
- **SQLite Storage**: Persistent transaction storage with GORM ORM
- **Discord Integration**: Real-time message processing, summaries, and period reviews (`!week`, `!month`)
- **Transaction Validation**: Ensures data integrity and proper formatting
- **Health Monitoring**: Built-in health check endpoint
- **Unicode Cleaning**: Handles invisible characters from Discord messages
- **Android capture app**: SMS interception, tagging, sync, Stats/Review screens, category budgets — see [Android App](#android-app)

## Architecture

```
cmd/
├── main.go                 # Application entry point
internal/
├── api/
│   ├── server.go           # Health + bearer-auth routing
│   └── transactions.go     # POST/GET /api/transactions (used by the Android app)
├── config/
│   └── config.go           # Configuration management
├── discord/
│   ├── bot.go               # Discord bot: message handling, !summary, !week/!month
│   └── period_commands.go   # Period range resolution + review-message formatting
├── mpesa/
│   ├── parser.go            # M-PESA message parsing logic
│   └── parser_test.go       # Parser tests
└── storage/
    ├── db.go                # Database operations
    ├── models.go             # Data models
    └── reports.go            # Period-scoped report queries (totals, top days, movers, ...)
android/                    # Android capture app (Kotlin/Compose) — see Android App section
deploy/
├── nginx-wallet.conf        # nginx vhost for wallet.samtama.lol
└── VPS_SETUP.md              # One-time VPS migration notes
.github/
└── workflows/
    └── deploy.yml           # GitHub Actions CI/CD
start_app.sh                 # Deployment script
```

## Prerequisites

- Go 1.24.6 or later
- Discord Bot Token
- Discord Channel ID

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/NgigiN/wallet.git
   cd wallet
   ```

2. **Install dependencies**
   ```bash
   go mod tidy
   ```

3. **Environment Configuration**
   Create a `.env` file in the project root:
   ```env
   DISCORD_BOT_TOKEN=your_discord_bot_token_here
   DISCORD_CHANNEL_ID=your_channel_id_here
   ```

4. **Build the application**
   ```bash
   go build -o financial-tracker cmd/main.go
   ```

## Usage

### Starting the Bot

```bash
./financial-tracker
```

The bot will:
- Connect to Discord using the provided token
- Listen for messages in the specified channel
- Process M-PESA transaction messages
- Store valid transactions in the database

### Single Transaction Format

Send M-PESA transaction messages in the following format:

```
TID60759AQ Confirmed. Ksh300.00 sent to Margaret Njuguna on 13/9/25 at 9:24 AM. New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00.
Category: food
Reason: at home
```

### Batch Processing

Process multiple transactions at once by sending them in a single message:

```
TIL4XR5BBM Confirmed. Ksh25.00 sent to Caroline Mwania on 21/9/25 at 7:00 PM. New M-PESA balance is Ksh164.18. Transaction cost, Ksh0.00.
Category: food
Reason: water

TIL3XTT9WB Confirmed. Ksh40.00 sent to Divinah Nyabuto on 21/9/25 at 7:10 PM. New M-PESA balance is Ksh124.18. Transaction cost, Ksh0.00.
Category: food

TIL7XUOPX7 Confirmed. Ksh80.00 sent to Meshack Mbindyo on 21/9/25 at 7:13 PM. New M-PESA balance is Ksh44.18. Transaction cost, Ksh0.00.
Category: food
```

### Supported Message Variants

The parser handles various M-PESA message formats:
- **Outgoing transactions**: "sent to", "paid to"
- **Incoming transactions**: "received from"
- **Balance types**: "New M-PESA balance is" or "New business balance is"
- **Time formats**: "6:56 PM" or "6:56PM" (normalized automatically)
- **Optional fields**: "for account ..." in recipient names

### Metadata Formats

Use either full or abbreviated forms (case-insensitive):

| Full Form | Abbreviated Form |
|-----------|------------------|
| `Category: food` | `c: food` |
| `Reason: lunch` | `r: lunch` |

### Summary Commands

View transaction summaries:

```
!summary                    # Show all categories with totals
!summary food              # Show detailed food transactions
!summary travel            # Show detailed travel transactions
```

### Period Review Commands

View a full breakdown (net/in/out, comparison vs. the previous period,
savings rate, category/day/expense/counterparty breakdown) for a week or
month:

```
!week                       # Current ISO week, so far
!week 37                    # A specific ISO week number (this year)
!month                      # Current calendar month
!month august               # A named month (this year)
!month 8                    # ...or by number
!lastweek                   # Shorthand for the previous week
!lastmonth                  # Shorthand for the previous month
```

### Supported Categories

- `food` - Food and dining expenses
- `travel` - Transportation and travel costs
- `savings` - Savings and deposits
- `church` - Church and religious donations
- `investments` - Investment transactions

The Android app and synced data also use two more categories the Discord
bot doesn't validate for *manual* Discord entry: `income` (incoming
money) and `transfer` (auto-tagged M-PESA/Pochi internal transfers,
excluded from spend totals everywhere). If you type
`Category: income`/`Category: transfer` directly into Discord, the bot
will reject it — those two only ever get set by the Android app's parser
and sync path, not by hand.

## Database Schema

The application uses SQLite with the following transaction schema:

```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    created_at DATETIME,
    updated_at DATETIME,
    deleted_at DATETIME,
    transaction_id TEXT UNIQUE,
    amount REAL,
    recipient TEXT,
    date_time DATETIME,
    balance REAL,
    cost REAL,
    category TEXT,
    reason TEXT
);
```

## API Reference

### M-PESA Parser

The `ParseMPesaMessage` function extracts:
- Transaction ID
- Amount (Ksh)
- Recipient name
- Date and time
- New balance
- Transaction cost

### Discord Bot

The bot processes messages with:
- **Message validation**: Ensures proper M-PESA format
- **Category validation**: Verifies against allowed categories
- **Database storage**: Persists transaction data with retry logic
- **User feedback**: Confirms successful processing
- **Batch processing**: Handles multiple transactions in one message
- **Duplicate detection**: Skips duplicate transactions gracefully

### Health Check

The bot exposes a health check endpoint at `http://localhost:8080/health`:

```json
{
    "status": "healthy",
    "uptime": "2h30m15s",
    "discord_connected": true,
    "timestamp": "2024-01-15T10:30:45Z"
}
```

## Android App

`android/` is a native Kotlin/Compose app (package `com.ngigi.wallet`, minSdk
26) that captures M-PESA/Airtel SMS directly on the phone — no need to
forward anything to Discord.

### What it does

- **SMS capture**: listens for M-PESA/Airtel SMS via a broadcast receiver and
  records each transaction the moment it lands, even with the app closed.
- **Tagging**: a heads-up notification (with quick-tag actions for your top
  categories) or the in-app Inbox lets you categorize each transaction;
  messages the parser couldn't read land in the Inbox for manual entry.
- **Sync**: tagged transactions push to the backend's `/api/transactions`
  (bearer-auth); a "sync history from server" action in Settings pulls
  everything the backend already knows about, including pre-app history.
- **Stats & Review**: the Stats screen's "Period" tab shows any week
  (ISO-numbered), month, or year — tap the period label to jump straight to
  any period, not just step one at a time — with a spend comparison against
  the previous period. The "Review" tab adds cross-period insight Period
  can't show on its own: a spend trend strip, a savings-rate trend, category
  movers (which category changed most vs. last period), a pace projection
  for the period still in progress, and a trailing-12-month spend calendar
  heatmap.
- **Budgets**: set a monthly spend limit per category in Settings; category
  bars on the Stats screen switch to a budget-progress view, and you get a
  notification at 80% and 100% of budget. Budgets are local to the phone —
  not synced to the backend or visible from Discord.
- **Shoulder-surfing guard**: amounts are hidden (`Ksh ••••`) by default on
  every app open and re-hide when the app leaves the foreground; tap the eye
  icon to reveal.

### Building

```bash
cd android
./gradlew :app:installDebug   # builds and installs on a connected device/emulator
./gradlew :app:testDebugUnitTest   # unit tests (DAO logic via Robolectric, pure logic via plain JUnit)
```

Requires `android/local.properties` with `sdk.dir=<path to your Android SDK>`
(not committed — machine-specific). Point the app at your backend and API
token from the in-app Settings screen (Server connection section).

## Development

### Project Structure

- `cmd/main.go`: Application entry point with signal handling
- `internal/config/`: Environment configuration management
- `internal/discord/`: Discord bot implementation and message handling
- `internal/mpesa/`: M-PESA message parsing and validation
- `internal/storage/`: Database operations and data models

### Dependencies

- `github.com/bwmarrin/discordgo` - Discord API client
- `github.com/joho/godotenv` - Environment variable loading
- `gorm.io/gorm` - ORM for database operations
- `gorm.io/driver/sqlite` - SQLite database driver

### Running Tests

```bash
# Run all tests
go test ./...

# Run specific package tests
go test ./internal/mpesa/
```

### Building for Production

```bash
# Build for Linux
GOOS=linux GOARCH=amd64 go build -o financial-tracker-linux cmd/main.go

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o financial-tracker.exe cmd/main.go

# Build for macOS
GOOS=darwin GOARCH=amd64 go build -o financial-tracker-macos cmd/main.go
```

## Deployment

### Docker Deployment (Recommended)

The project uses Docker for containerized deployment with a multi-stage build process.

#### Dockerfile Features

- **Multi-stage build**: Optimized for small final image size
- **CGO enabled**: Required for SQLite database functionality
- **Alpine Linux**: Minimal runtime environment with SQLite support
- **Health check port**: Exposes port 8080 for monitoring

#### GitHub Actions CI/CD

The project includes automated Docker deployment via GitHub Actions:

1. **Set up repository secrets**:
   - `SERVER_HOST`: Your server IP address
   - `SERVER_USER`: Your server username
   - `SERVER_SSH_KEY`: Your private SSH key
   - `SERVER_PORT`: SSH port (usually 22)
   - `DISCORD_BOT_TOKEN`: Your Discord bot token
   - `DISCORD_CHANNEL_ID`: Your Discord channel ID
   - `API_TOKEN`: Bearer token for the transactions API (generate with `openssl rand -hex 32`)

2. **Deployment process**:
   - Push to `main` branch triggers deployment
   - Tests run automatically
   - Docker image is built on the server
   - Old container is stopped and removed
   - New container is started in detached mode
   - Health check verifies deployment success

#### Manual Docker Deployment

1. **Set up environment**:
   ```bash
   # Install Docker
   sudo apt update && sudo apt install -y docker.io
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -aG docker $USER

   # Create app directory
   sudo mkdir -p /home/deploy/opt/wallet && sudo chown $USER:$USER /home/deploy/opt/wallet
   cd /home/deploy/opt/wallet

   # Clone repository
   git clone https://github.com/yourusername/irs.git .
   ```

2. **Configure environment**:
   ```bash
   # Create data directory for SQLite
   mkdir -p data

   # Make deployment script executable
   chmod +x start_app.sh
   ```

3. **Deploy**:
   ```bash
   # Pull latest changes
   git pull origin main

   # Set environment variables and run deployment script
   # The script will create a .env file if it doesn't exist
   DISCORD_BOT_TOKEN="your_token" DISCORD_CHANNEL_ID="your_channel_id" ./start_app.sh
   ```

#### Docker Commands

```bash
# Build image manually
docker build -t wallet-irs:latest .

# Run container manually with .env file
docker run -d \
  --name financial-tracker-bot \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  -v /home/deploy/opt/wallet/data:/app/data \
  wallet-irs:latest

# Check container status
docker ps --filter name=financial-tracker-bot

# View container logs
docker logs financial-tracker-bot

# Stop and remove container
docker rm -f financial-tracker-bot
```

### Direct Go Deployment (Alternative)

For non-Docker environments:

1. **Set up environment**:
   ```bash
   # Install Go
   sudo apt update && sudo apt install -y golang-go

   # Create app directory
   sudo mkdir -p /opt/irs && sudo chown $USER:$USER /opt/irs
   cd /opt/irs

   # Clone repository
   git clone https://github.com/yourusername/irs.git .
   ```

2. **Configure environment**:
   ```bash
   # Create .env file
   nano .env
   # Add: DISCORD_BOT_TOKEN=your_token
   # Add: DISCORD_CHANNEL_ID=your_channel_id

   # Make deployment script executable
   chmod +x start_app.sh
   ```

3. **Deploy**:
   ```bash
   # Pull latest changes
   git pull origin main

   # Run deployment script
   ./start_app.sh
   ```

### A note on Docker Compose

Don't manage this service with Docker Compose. The production container is
created by `start_app.sh` (plain `docker run`), so Compose never owns it:
`docker compose down` won't stop it, and `docker compose up` fails with a
container-name conflict against the real deployment. To restart or redeploy,
use `./start_app.sh`; to just restart the running container,
`docker restart financial-tracker-bot`.

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_BOT_TOKEN` | Discord bot token | Yes |
| `DISCORD_CHANNEL_ID` | Target channel ID | Yes |
| `API_TOKEN` | Bearer token for the HTTP transactions API | Yes |
| `DB_PATH` | SQLite file path (default `transaction.db`; use `data/transaction.db` in Docker so it lives on the mounted volume) | No |

### Discord Bot Setup

1. Create a Discord application at https://discord.com/developers/applications
2. Create a bot and copy the token
3. Invite the bot to your server with appropriate permissions
4. Get the channel ID where transactions will be processed

## Monitoring

The application logs:
- Bot startup and shutdown events
- Message processing errors
- Database operation failures
- Configuration loading issues
- Batch processing results

### Health Monitoring

#### Docker Deployment
```bash
# Check if container is running
docker ps --filter name=financial-tracker-bot

# Check health endpoint
curl http://localhost:8080/health

# View container logs
docker logs financial-tracker-bot

# Follow logs in real-time
docker logs -f financial-tracker-bot
```

#### Direct Go Deployment
```bash
# Check if bot is running
ps aux | grep financial-tracker

# Check health endpoint
curl http://localhost:8080/health

# View logs
tail -f app.log
```

## Troubleshooting

### Common Issues

1. **"Bot token is not set"**
   - Ensure `DISCORD_BOT_TOKEN` is set in `.env`

2. **"Channel ID is not set"**
   - Ensure `DISCORD_CHANNEL_ID` is set in `.env`

3. **"Invalid Mpesa Message"**
   - Check message format matches expected pattern
   - Verify date/time parsing
   - Ensure no invisible Unicode characters

4. **"Failed to save transaction"**
   - Check database file permissions
   - Ensure SQLite database is accessible
   - Check for duplicate transaction IDs

5. **Batch processing only handles first transaction**
   - Ensure message contains multiple "Confirmed" patterns
   - Check for invisible Unicode characters
   - Verify proper line breaks between transactions

6. **"UNIQUE constraint failed"**
   - Transaction already exists in database
   - Bot will skip duplicates and report them in batch summary

### Debugging

#### Docker Deployment
```bash
# Check container logs
docker logs financial-tracker-bot

# Execute commands inside container
docker exec -it financial-tracker-bot sh

# Check database (if mounted)
sqlite3 data/transaction.db "SELECT COUNT(*) FROM transactions;"

# Test parser manually
docker exec -it financial-tracker-bot go test ./internal/mpesa/ -v
```

#### Direct Go Deployment
```bash
# Check bot logs
tail -f app.log

# Test parser manually
go test ./internal/mpesa/ -v

# Check database
sqlite3 transaction.db "SELECT COUNT(*) FROM transactions;"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review Discord bot permissions and channel access
- Check application logs for detailed error messages