@echo off
title QCC App - Stop
echo(
echo  ==================================================
echo    Stopping QCC Monitor  (backend + frontend)
echo  ==================================================
echo(

set "ANY="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  set "ANY=1"
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":6001" ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
  set "ANY=1"
)

REM close the named server windows if they are still open
taskkill /F /FI "WINDOWTITLE eq QCC Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq QCC Frontend*" >nul 2>&1

if defined ANY (
  echo   Stopped backend + frontend.
) else (
  echo   Nothing was running.
)
echo(
timeout /t 4 >nul
