@echo off
setlocal
title Kill DF Throwables leftovers
echo Closing DF Throwables processes...
taskkill /F /IM "DF投掷物尺子.exe" >nul 2>nul
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'DF-Throwables-Ruler*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul
echo Done. You can start the portable exe again.
timeout /t 2 >nul
endlocal
