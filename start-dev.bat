@echo off
cd /d "%~dp0"
echo Stopping any running Metro bundler...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak >nul
echo Starting Metro with LAN + dev-client mode...
npm start -- --lan --clear
