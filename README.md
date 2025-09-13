# IRS - Intelligent Receipt Scanner

A Discord bot that automatically parses and categorizes M-PESA transaction messages for personal finance tracking. The bot extracts transaction details from M-PESA SMS notifications and stores them in a SQLite database with user-defined categories and reasons.

## Features

- **Automated M-PESA Parsing**: Extracts transaction details from M-PESA SMS messages
- **Category Management**: Supports predefined categories (food, travel, savings, church, investments)
- **SQLite Storage**: Persistent transaction storage with GORM ORM
- **Discord Integration**: Real-time message processing and feedback
- **Transaction Validation**: Ensures data integrity and proper formatting

## Architecture

```
cmd/
├── main.go                 # Application entry point
internal/
├── config/
│   └── config.go          # Configuration management
├── discord/
│   └── bot.go             # Discord bot implementation
├── mpesa/
│   └── parser.go          # M-PESA message parsing logic
└── storage/
    ├── db.go              # Database operations
    └── models.go          # Data models
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
   go build -o irs cmd/main.go
   ```

## Usage

### Starting the Bot

```bash
./irs
```

The bot will:
- Connect to Discord using the provided token
- Listen for messages in the specified channel
- Process M-PESA transaction messages
- Store valid transactions in the database

### Message Format

Send M-PESA transaction messages in the following format:

```
TID60759AQ Confirmed. Ksh300.00 sent to Margaret Njuguna on 13/9/25 at 9:24 AM. New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00. Amount you can transact within the day is 499,700.00. Sign up for Lipa Na M-PESA Till online https://m-pesaforbusiness.co.ke/
Category: food
Reason: at home
```

### Supported Categories

- `food` - Food and dining expenses
- `travel` - Transportation and travel costs
- `savings` - Savings and deposits
- `church` - Church and religious donations
- `investments` - Investment transactions

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
- **Database storage**: Persists transaction data
- **User feedback**: Confirms successful processing

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

### Building for Production

```bash
# Build for Linux
GOOS=linux GOARCH=amd64 go build -o irs-linux cmd/main.go

# Build for Windows
GOOS=windows GOARCH=amd64 go build -o irs.exe cmd/main.go

# Build for macOS
GOOS=darwin GOARCH=amd64 go build -o irs-macos cmd/main.go
```

## Deployment

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM golang:1.24-alpine AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN go build -o irs cmd/main.go

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /app/irs .
COPY --from=builder /app/.env .
CMD ["./irs"]
```

### Systemd Service

Create `/etc/systemd/system/irs.service`:

```ini
[Unit]
Description=IRS Discord Bot
After=network.target

[Service]
Type=simple
User=irs
WorkingDirectory=/opt/irs
ExecStart=/opt/irs/irs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DISCORD_BOT_TOKEN` | Discord bot token | Yes |
| `DISCORD_CHANNEL_ID` | Target channel ID | Yes |

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

## Troubleshooting

### Common Issues

1. **"Bot token is not set"**
   - Ensure `DISCORD_BOT_TOKEN` is set in `.env`

2. **"Channel ID is not set"**
   - Ensure `DISCORD_CHANNEL_ID` is set in `.env`

3. **"Invalid Mpesa Message"**
   - Check message format matches expected pattern
   - Verify date/time parsing (recently fixed AM/PM duplication bug)

4. **"Failed to save transaction"**
   - Check database file permissions
   - Ensure SQLite database is accessible

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

debug line