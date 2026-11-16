@echo off
setlocal
title Molotov - Backend (SANDBOX)
cd /d "%~dp0"
echo.
echo  === MOLOTOV BACKEND (sandbox) ===
where node >nul 2>nul || (echo [!] Node.js is not installed. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b 1)
where docker >nul 2>nul || (echo [!] Docker Desktop is not installed. Install it from https://www.docker.com/products/docker-desktop then run this again. & pause & exit /b 1)
docker info >nul 2>nul || (echo [!] Docker Desktop is not running. Open Docker Desktop, wait until it says "running", then run this again. & pause & exit /b 1)
echo [1/4] Starting local database...
docker compose up -d --wait || (echo [!] Database failed to start. & pause & exit /b 1)
cd backend
echo [2/4] Installing backend packages (first run takes a minute)...
call npm install --no-audit --no-fund || (pause & exit /b 1)
echo [3/4] Preparing settings...
call node scripts/init-env.js
echo [4/4] Starting API on http://localhost:4000  (leave this window open)
echo       Test it: open http://localhost:4000/health in your browser.
netsh advfirewall firewall add rule name="Molotov API 4000 (private)" dir=in action=allow protocol=TCP localport=4000 profile=private >nul 2>nul
call npm start
pause
