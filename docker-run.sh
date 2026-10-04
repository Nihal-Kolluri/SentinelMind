#!/bin/bash
set -e

echo "=================================================================="
echo "             SENTINELMIND: DOCKER CONTAINER LAUNCH"
echo "=================================================================="

if [ ! -f .env ]; then
    echo "[!] WARNING: .env file not found. Creating from .env.example..."
    cp .env.example .env
fi

echo "[*] Building and starting SentinelMind Docker container..."
docker compose up --build -d

echo ""
echo "=================================================================="
echo "[+] SentinelMind is now running inside Docker!"
echo "[+] Web Console: http://127.0.0.1:8000"
echo "[+] API Docs:    http://127.0.0.1:8000/docs"
echo "=================================================================="
echo ""

# Try opening default browser
if which xdg-open > /dev/null; then
    xdg-open http://127.0.0.1:8000
elif which open > /dev/null; then
    open http://127.0.0.1:8000
fi
