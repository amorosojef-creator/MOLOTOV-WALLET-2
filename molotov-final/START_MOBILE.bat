@echo off
setlocal enabledelayedexpansion
title Molotov - Mobile app
cd /d "%~dp0mobile"
echo.
echo  === MOLOTOV MOBILE (Expo) ===
where node >nul 2>nul || (echo [!] Node.js is not installed. Install the LTS version from https://nodejs.org & pause & exit /b 1)
set IP=
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress"`) do set IP=%%i
if "%IP%"=="" (echo [!] Could not detect your PC's Wi-Fi/LAN address. & set /p IP=Type it here (e.g. 192.168.1.20): )
echo EXPO_PUBLIC_API_URL=http://%IP%:4000> .env
echo Using API at http://%IP%:4000  (START_BACKEND must be running on this PC)
echo Installing app packages (first run takes a few minutes)...
call npm install --no-audit --no-fund || (pause & exit /b 1)
netsh advfirewall firewall add rule name="Molotov Metro 8081 (private)" dir=in action=allow protocol=TCP localport=8081 profile=private >nul 2>nul
echo.
echo  When the QR code appears: scan it with your phone camera / Expo Go.
echo  Press  w  to open it in your PC browser instead (no phone needed).
echo.
call npx expo start --clear
pause
