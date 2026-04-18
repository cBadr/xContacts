@echo off
REM Quick-start script for Windows. Double-click or run from a terminal.
setlocal

cd /d "%~dp0"

if not exist node_modules (
  echo [xContacts] Installing dependencies...
  call npm install
  if errorlevel 1 goto :err
)

if not exist .env (
  if exist .env.example (
    copy /Y .env.example .env >nul
    echo [xContacts] Created .env from .env.example. Edit it to set OAuth keys.
  )
)

echo [xContacts] Starting server on http://localhost:5174
node src\index.js
goto :eof

:err
echo [xContacts] Install failed. See error above.
exit /b 1
