@echo off
rem Opens the karaoke on this computer: starts a local server with Node (tools\server.cjs) and opens the
rem browser at http://127.0.0.1:8080/ (or another port if that one is taken). The server is needed because
rem browsers do not load JavaScript modules or the audio processor when index.html is double-clicked (file://).
rem The song list is built automatically from whatever is in the «songs» folder.
rem On other computers, use the published web version (Build web version.bat).
chcp 65001 >nul
cd /d "%~dp0"
title Cara-o-que (local server)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer.
  echo Install it from https://nodejs.org/ ^(LTS version^) and open this file again.
  pause
  exit /b 1
)
node "%~dp0tools\server.cjs" --open
if errorlevel 1 pause
