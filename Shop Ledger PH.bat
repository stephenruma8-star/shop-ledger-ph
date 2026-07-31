@echo off
cd /d "%~dp0"
echo Building Shop Ledger PH...
call npm run build
echo Starting Shop Ledger PH...
call npm start
pause