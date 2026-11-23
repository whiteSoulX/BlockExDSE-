@echo off
REM Stops leftover BlockExDSE processes (ports 8545, 9001, 9002, 9003, 9004).
for %%P in (8545 9001 9002 9003 9004) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do taskkill /F /T /PID %%I >nul 2>nul
)
echo Done. Ports 8545 and 9001 to 9004 are free.
pause
