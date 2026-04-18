@echo off
REM Windows deploy helper. Run from an Administrator prompt if PM2 needs it.
setlocal
cd /d "%~dp0"

echo.
echo === xContacts deploy ===
echo.

if exist ".git" (
  echo [1/4] git pull
  git pull --ff-only || goto :err
) else (
  echo [1/4] Skipped git pull (not a repo)
)

echo [2/4] npm install (server)
call npm --prefix server install --omit=dev --no-audit --no-fund || goto :err

echo [3/4] Building client
call npm --prefix client install --include=dev --no-audit --no-fund || goto :err
call npm --prefix client run build || goto :err

echo [4/4] Restarting server
where pm2 >nul 2>nul && (
  pm2 restart xcontacts-server || pm2 start server\ecosystem.config.cjs
) || (
  echo No PM2 found. Start manually: node server\src\index.js
)

echo.
echo Deploy complete.
exit /b 0

:err
echo.
echo Deploy failed — see output above.
exit /b 1
