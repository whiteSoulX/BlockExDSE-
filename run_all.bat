@echo off
REM One-command launcher for Windows. Double-click this file or run it in Command Prompt / PowerShell.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 run.py %*
) else (
  python run.py %*
)
echo.
pause
