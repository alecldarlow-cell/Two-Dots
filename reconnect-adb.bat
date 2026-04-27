@echo off
title Two Dots — Reconnect ADB
cd /d "C:\Claude\Two Dots\two-dots"

echo ============================================
echo  Two Dots — WiFi ADB Reconnect
echo ============================================
echo.
echo On your phone:
echo   1. Settings ^> Developer Options ^> Wireless Debugging
echo   2. Make sure it's turned ON
echo   3. Tap "Pair device with pairing code" to get IP:PORT (for first-time pair only)
echo   4. Note the main IP address shown on the Wireless Debugging screen
echo.

set /p PAIR_NEEDED="Do you need to PAIR first? (y/n): "
if /i "%PAIR_NEEDED%"=="y" (
    set /p PAIR_ADDR="Enter pairing address (ip:port from Pair screen): "
    echo.
    echo Pairing with %PAIR_ADDR% ...
    adb pair %PAIR_ADDR%
    echo.
)

set /p CONNECT_IP="Enter device IP address (just the IP, no port): "
echo.
echo Connecting to %CONNECT_IP%:5555 ...
adb connect %CONNECT_IP%:5555
echo.
echo Current devices:
adb devices
echo.
echo === If you see your device above, go press ENTER in the deploy window! ===
pause
