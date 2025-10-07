# IRS - Intelligent Receipt Scanner

A Discord bot that automatically parses and categorizes M-PESA transaction messages for personal finance tracking. The bot extracts transaction details from M-PESA SMS notifications and stores them in a SQLite database with user-defined categories and reasons.

## Features

- **Automated M-PESA Parsing**: Extracts transaction details from M-PESA SMS messages
- **Batch Processing**: Process multiple transactions in a single message
- **Category Management**: Supports predefined categories (food, travel, savings, church, investments)
- **Flexible Metadata**: Use full or abbreviated forms (`Category:` or `c:`, `Reason:` or `r:`)
- **SQLite Storage**: Persistent transaction storage with GORM ORM
- **Discord Integration**: Real-time message processing and feedback
- **Transaction Validation**: Ensures data integrity and proper formatting
- **Summary Commands**: View transaction summaries by category
- **Health Monitoring**: Built-in health check endpoint
- **Unicode Cleaning**: Handles invisible characters from Discord messages

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
│   ├── parser.go          # M-PESA message parsing logic
│   └── parser_test.go     # Parser tests
└── storage/
    ├── db.go              # Database operations
    └── models.go          # Data models
.github/
└── workflows/
    └── deploy.yml         # GitHub Actions CI/CD
start_app.sh               # Deployment script
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
- **Static compilation**: CGO_ENABLED=0 for maximum compatibility
- **Alpine Linux**: Minimal runtime environment
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
   DISCORD_BOT_TOKEN="your_token" DISCORD_CHANNEL_ID="your_channel_id" ./start_app.sh
   ```

#### Docker Commands

```bash
# Build image manually
docker build -t wallet-irs:latest .

# Run container manually
docker run -d \
  --name financial-tracker-bot \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /home/deploy/opt/wallet/data:/app/data \
  -e DISCORD_BOT_TOKEN="your_token" \
  -e DISCORD_CHANNEL_ID="your_channel_id" \
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

### Docker Compose (Optional)

For easier container management, create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  irs-bot:
    build: .
    container_name: financial-tracker-bot
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
```

Usage:
```bash
# Start with docker-compose
docker-compose up -d

# Stop with docker-compose
docker-compose down

# View logs
docker-compose logs -f
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
- Batch processing results

### Health Monitoring

#### Docker Deployment
```bash
# Check if container is running
docker ps --filter name=financial-tracker-bot

# Check health endpoint
curl http://localhost:7070/health

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
curl http://localhost:7070/health

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