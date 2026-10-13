@echo off
title Rental Platform - BACKEND (keep this window open)
cd /d "%~dp0backend"
call venv\Scripts\activate
echo Backend starting at http://127.0.0.1:8000
echo SMS codes (OTP) will be printed in this window.
echo.
python manage.py runserver
pause
