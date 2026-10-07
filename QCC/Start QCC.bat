@echo off
title QCC App Launcher
cd /d "%~dp0"

echo(
echo  ==================================================
echo    Starting QCC Monitor  (backend + frontend)
echo  ==================================================
echo(

REM ---------- 1) BACKEND (port 8000) ----------
REM NOTE: never reference %~dp0 inside an if(...) block - the "(2)" in the folder
REM path would prematurely close the block. Directory work is done in subroutines.
netstat -ano | findstr ":8000" | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (echo   [1/2] Backend already running   -^>  http://127.0.0.1:8000) else (call :start_backend)

REM ---------- 2) FRONTEND (port 6001) ----------
netstat -ano | findstr ":6001" | findstr LISTENING >nul 2>&1
if %errorlevel%==0 (echo   [2/2] Frontend already running  -^>  http://localhost:6001) else (call :start_frontend)

echo(
echo   Login:   use your QCC account (username / password)
echo   Keep the "QCC Backend" and "QCC Frontend" windows open while using the app.
echo   To close everything later, run  "Stop QCC.bat".
echo(
echo   Opening the app in your browser...

REM give the servers a few seconds to boot, then open the app
timeout /t 9 >nul
start "" http://localhost:6001
timeout /t 3 >nul
goto :eof

:start_backend
echo   [1/2] Starting backend...
REM DATABASE_URL is read from backend\.env (PostgreSQL). No SQLite override here.
cd /d "%~dp0backend"
start "QCC Backend" ".venv\Scripts\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8000
cd /d "%~dp0"
goto :eof

:start_frontend
echo   [2/2] Starting frontend...
start "QCC Frontend" cmd /k "npm run dev"
goto :eof
