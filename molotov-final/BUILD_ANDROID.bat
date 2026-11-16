@echo off
cd /d "%~dp0mobile"
echo  === BUILD Android APK (cloud, free Expo account only) ===
echo  Edit mobile\eas.json first: set EXPO_PUBLIC_API_URL to your https API.
call npm install --no-audit --no-fund
call npx eas-cli@latest login
call npx eas-cli@latest init
call npx eas-cli@latest build --platform android --profile preview-android
pause
