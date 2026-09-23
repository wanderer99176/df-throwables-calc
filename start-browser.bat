@echo off
setlocal
cd /d "%~dp0"
title DF Throwables Calc - Browser

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] First run: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting Vite. Open the Local URL shown below in your browser.
echo.
call npm run dev
echo.
pause
endlocal