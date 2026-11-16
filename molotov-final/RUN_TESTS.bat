@echo off
cd /d "%~dp0backend"
call npm install --no-audit --no-fund
docker compose -f ..\docker-compose.yml up -d --wait
call npm test
cd ..\mobile
call npm install --no-audit --no-fund
call npm test
call npx tsc --noEmit && echo TYPECHECK OK
pause
