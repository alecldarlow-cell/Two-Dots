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
echo   3. Tap "Pair device with pairing code" to get IP:PAIRING_PORT (first-time only)
echo   4. On the main Wireless Debugging screen, note the IP and CONNECTION port
echo      (NOTE: pairing and connection ports are different on Android 11+)
echo.

set /p PAIR_NEEDED="Do you need to PAIR first? (y/n): "
if /i "%PAIR_NEEDED%"=="y" (
    set /p PAIR_ADDR="Enter pairing address (ip:port from 'Pair device with pairing code' screen): "
    echo.
    echo Pairing with %PAIR_ADDR% ...
    adb pair %PAIR_ADDR%
    echo.
)

set /p CONNECT_IP="Enter device IP address (just the IP, no port): "
set /p CONNECT_PORT="Enter connection port (from main Wireless Debugging screen, e.g. 35201) [default 5555]: "
if "%CONNECT_PORT%"=="" set CONNECT_PORT=5555
echo.
echo Connecting to %CONNECT_IP%:%CONNECT_PORT% ...
adb connect %CONNECT_IP%:%CONNECT_PORT%
echo.
echo Current devices:
adb devices
echo.
echo === If you see your device above, go press ENTER in the deploy window! ===
pause
