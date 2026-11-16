#!/bin/bash
cd "$(dirname "$0")/mobile" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')
[ -z "$IP" ] && read -r -p "Type your computer's LAN IP (e.g. 192.168.1.20): " IP
echo "EXPO_PUBLIC_API_URL=http://$IP:4000" > .env
echo "Using API at http://$IP:4000"
npm install --no-audit --no-fund && npx expo start --clear
