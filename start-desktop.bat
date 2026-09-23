@echo off
setlocal
cd /d "%~dp0"
title DF Throwables Calc - Desktop Overlay

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

if not exist "node_modules\electron\dist\electron.exe" (
  echo [INFO] Repairing Electron binary...
  call npm run fix:electron
  if errorlevel 1 (
    echo [ERROR] Electron repair failed.
    pause
    exit /b 1
  )
)

echo [INFO] Building and launching overlay window...
call npm run desktop
if errorlevel 1 (
  echo [ERROR] Launch failed. Please copy the error text above.
  pause
  exit /b 1
)

endlocal