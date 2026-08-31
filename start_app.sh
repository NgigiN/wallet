#!/bin/bash

APP_NAME="financial-tracker"
CONTAINER_NAME="${APP_NAME}-bot"
IMAGE_TAG="wallet-irs:latest"
# Loopback-only: nginx terminates TLS and proxies to this port.
PORT="127.0.0.1:8080"

# Change to the application directory
cd /home/deploy/opt/wallet

# 1. Build the Docker image on the server using the code pulled by 'git pull'
# This assumes the Dockerfile is present in the current directory.
echo "Building Docker image: ${IMAGE_TAG}"
# Ensure we pass the build context
docker build -t ${IMAGE_TAG} .

# 2. Stop and remove any existing container
echo "Stopping and removing old container: ${CONTAINER_NAME}"
docker rm -f ${CONTAINER_NAME} || true # '|| true' prevents the script from failing if the container doesn't exist

# 3. Run the new container in detached mode (-d)
echo "Starting new container: ${CONTAINER_NAME}"

# Check if .env file exists, if not create it with the environment variables
if [ ! -f .env ]; then
    echo "Creating .env file from environment variables"
    cat > .env << EOF
DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
API_TOKEN=${API_TOKEN}
DB_PATH=data/transaction.db
EOF
fi

# Ensure newer required vars exist in a pre-existing .env
if ! grep -q '^API_TOKEN=' .env; then
    if [ -z "${API_TOKEN}" ]; then
        echo "ERROR: API_TOKEN is not in .env and not provided in the environment" >&2
        exit 1
    fi
    echo "API_TOKEN=${API_TOKEN}" >> .env
fi
grep -q '^DB_PATH=' .env || echo "DB_PATH=data/transaction.db" >> .env

docker run -d \
  --name ${CONTAINER_NAME} \
  --restart unless-stopped \
  -p ${PORT}:8080 \
  --env-file /home/deploy/opt/wallet/.env \
  -v /home/deploy/opt/wallet/data:/app/data \
  ${IMAGE_TAG}

# The script finishes, but the container keeps running in the background.
echo "Container started successfully in detached mode."

# Verify the container is running
sleep 3
if docker ps | grep -q ${CONTAINER_NAME}; then
  echo "Container verification: ${CONTAINER_NAME} is running"
  echo "Container ID: $(docker ps -q --filter name=${CONTAINER_NAME})"
else
  echo "Container failed to start"
  echo "Container logs:"
  docker logs ${CONTAINER_NAME}
  exit 1
fi

echo "Deployment completed successfully"