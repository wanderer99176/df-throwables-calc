@echo off
setlocal
cd /d "%~dp0"
title DF Throwables Calc - Package

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found.
  pause
  exit /b 1
)

echo [INFO] Packaging portable exe (may take a few minutes)...
call npm run fix:electron
call npm run build
npx electron-builder --win portable --config.directories.output="%TEMP%\df-ruler-release"
if errorlevel 1 (
  echo [ERROR] package failed
  pause
  exit /b 1
)

if not exist "release\" mkdir release
copy /Y "%TEMP%\df-ruler-release\DF*portable.exe" "release\DF-Throwables-Ruler-portable.exe" >nul
echo [OK] Copied to release\DF-Throwables-Ruler-portable.exe
explorer release
pause
endlocal