@echo off
title Rental Platform - WEBSITE (keep this window open)
cd /d "%~dp0frontend"

if exist src\pages (
  echo.
  echo The OLD website files are still in the frontend folder: src\pages exists.
  echo Delete the whole frontend folder, then extract the new zip again.
  echo See README.md, section 9.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\.bin\next.cmd (
  echo Installing the website packages. First run only, this takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your internet connection and that Node.js is installed.
    pause
    exit /b 1
  )
)

echo.
echo Website starting. Open http://localhost:5173 in your browser.
echo.
call npm run dev
pause
