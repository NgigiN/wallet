# --- STAGE 1: Build the Go application ---
# Use the official Go image for building
FROM golang:1.24.6-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy the Go module and checksum files first, then download dependencies.
# This improves build speed by leveraging Docker's cache.
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code
COPY . .

# Build the Go application
# -ldflags="-w -s" reduces the executable size
# -o specifies the output name (matching your pgrep in the workflow)
# cmd/main.go is the entry point (from your architecture)
# Set GOOS and GOARCH for static compilation on Linux (good practice)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a -ldflags '-w -s' -o financial-tracker cmd/main.go

# --- STAGE 2: Create the final, small runtime image ---
# Use a minimal base image, like Alpine Linux
FROM alpine:3.18

# Set working directory
WORKDIR /app

# Copy the built executable from the 'builder' stage
COPY --from=builder /app/financial-tracker .

# Copy the .env file for runtime configuration
# Note: This will be overridden by --env-file at runtime, but ensures the file exists
COPY --from=builder /app/.env .

# The application uses SQLite, so we need to ensure the directory exists for the DB file.
RUN mkdir -p /app/data

# Expose the port for the health check (optional, but good documentation)
EXPOSE 8080

# The command to run the application
# This is the single, non-forking process that Docker expects to be PID 1
# Note: We do NOT use the start_app.sh as the entrypoint here. That script
# is better used for host-level restart logic (see next section).
ENTRYPOINT ["./financial-tracker"]
