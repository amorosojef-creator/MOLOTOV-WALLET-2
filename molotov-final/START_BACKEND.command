#!/bin/bash
# macOS/Linux equivalent of START_BACKEND.bat. Double-click in Finder (or run in Terminal).
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org"; read -r; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop first, then run this again."; read -r; exit 1; }
docker compose up -d --wait || exit 1
cd backend && npm install --no-audit --no-fund && node scripts/init-env.js && npm start
