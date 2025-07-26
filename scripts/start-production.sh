#!/bin/bash

# Production startup script for file upload server

set -e

echo "Starting File Upload Server in Production Mode..."

# Set environment variables
export NODE_ENV=production
export PORT=${PORT:-3000}

# Create necessary directories
mkdir -p uploads temp logs

# Set proper permissions
chmod 755 uploads temp
chmod 644 config/production.json

# Check if config file exists
if [ ! -f "config/production.json" ]; then
    echo "Error: Production config file not found!"
    exit 1
fi

# Start the server with PM2 for process management (if available)
if command -v pm2 &> /dev/null; then
    echo "Starting with PM2..."
    pm2 start src/index.js --name "file-upload-server" --instances max --exec-mode cluster
    pm2 save
    pm2 startup
else
    echo "Starting with Node.js directly..."
    node src/index.js
fi