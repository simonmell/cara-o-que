@echo off
rem Builds the «web-version» folder (the app and the songs, ready to upload to a static host) and opens it.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build-web.ps1"
if errorlevel 1 (pause & exit /b 1)
start "" "%~dp0web-version"
pause
