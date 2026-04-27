@echo off
title Two Dots — Deploy to Android
cd /d "C:\Claude\Two Dots\two-dots"

echo ============================================
echo  Two Dots — Android Deploy
echo ============================================
echo.

echo Checking ADB devices...
adb devices -l | findstr "device" | findstr /v "List"
echo.

echo Starting Expo build + deploy (this takes 2-5 minutes)...
echo The Metro bundler will stay running after deploy — leave this window open.
echo.

npx expo run:android

echo.
echo === Done. App should be open on your phone. ===
pause
