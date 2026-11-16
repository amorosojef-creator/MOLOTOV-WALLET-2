@echo off
setlocal
cd /d "%~dp0mobile"
echo.
echo  === BUILD iPhone app (cloud, from Windows) ===
echo  Needs: free Expo account (expo.dev) + paid Apple Developer Program ($99/yr) for a real iPhone IPA.
echo  Before building, edit mobile\eas.json and replace REPLACE-WITH-YOUR-DEPLOYED-API-HOST with your https API.
echo.
call npm install --no-audit --no-fund
call npx eas-cli@latest login
call npx eas-cli@latest init
call npx eas-cli@latest device:create
call npx eas-cli@latest build --platform ios --profile preview
echo.
echo  When the build finishes, EAS prints an install link / QR for your registered iPhone.
pause
