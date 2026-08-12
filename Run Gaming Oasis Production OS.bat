@echo off
setlocal
title Gaming Oasis Production OS
cd /d "%~dp0"

echo Closing any previous Gaming Oasis Production OS instance...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(3000, 4877); $pids = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort } | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($processId in $pids) { if ($processId -gt 0) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } }; Start-Sleep -Milliseconds 500"
if exist ".production-os.pid" del /q ".production-os.pid" >nul 2>nul

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run Gaming Oasis Production OS.
  echo Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vinext.cmd" (
  echo Preparing Gaming Oasis Production OS for first use...
  call npm install
  if errorlevel 1 (
    echo Setup could not be completed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

start "Gaming Oasis Production OS Server" /min cmd /c "npm run dev"
echo Starting the local production workspace...
timeout /t 4 /nobreak >nul
start "" "http://localhost:3000"
echo Gaming Oasis Production OS is running at http://localhost:3000
echo Keep the server window open while using the tool.
timeout /t 3 /nobreak >nul
endlocal
