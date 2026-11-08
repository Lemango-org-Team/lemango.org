@echo off
title Lemango Debug Server
cd /d "%~dp0\.."
echo.
echo  ==========================================
echo   Lemango Debug Server
echo  ==========================================
echo.
echo   Starting local server on http://localhost:4000
echo   Auto-reload: ON  |  Auth: BYPASSED  |  All features: UNLOCKED
echo.
echo   Press Ctrl+C to stop.
echo.
node Debug/server.js
pause
