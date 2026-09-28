@echo off
setlocal
title Gaming Oasis Production OS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run Gaming Oasis Production OS.
  echo Install Node.js 22.13 or newer, then run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required to run Gaming Oasis Production OS.
  pause
  exit /b 1
)

node scripts\launch-production.mjs
if errorlevel 1 (
  echo.
  echo Startup did not complete. Review the message above, then try again.
  pause
  exit /b 1
)

echo.
echo Gaming Oasis Production OS has stopped. You can close this window.
pause
endlocal
