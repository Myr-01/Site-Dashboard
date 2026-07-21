@echo off
echo ====================================
echo Site Monitor - Production Setup
echo ====================================
echo.

echo [1/3] Building client...
cd client
call npm run build
if errorlevel 1 (
    echo ERROR: Client build failed!
    pause
    exit /b 1
)
cd ..

echo.
echo [2/3] Installing server dependencies...
cd server
call npm install
if errorlevel 1 (
    echo ERROR: Server install failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Opening firewall port 3001...
powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"New-NetFirewallRule -DisplayName \"\"Site Monitor\"\" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue\"' -Verb RunAs"

echo.
echo ====================================
echo Setup tamamlandi!
echo ====================================
echo.
echo ZeroTier IP-nizi oyrenmek ucun:
echo   ipconfig
echo.
echo Server baslatmaq ucun:
echo   cd server
echo   node index.js
echo.
echo Dostunuz brauzerinde acsin:
echo   http://SIZIN_ZEROTIER_IP:3001
echo.
pause
