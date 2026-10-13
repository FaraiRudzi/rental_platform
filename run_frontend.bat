@echo off
title Rental Platform - WEBSITE (keep this window open)
cd /d "%~dp0frontend"
if not exist node_modules ( echo Installing website packages, first run only... & call npm install )
echo.
echo Website starting. Open http://localhost:5173 in your browser.
echo.
call npm run dev
pause
