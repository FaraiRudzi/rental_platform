@echo off
title Create admin account
cd /d "%~dp0backend"
call venv\Scripts\activate
echo Create the first ADMIN account.
echo Phone must be international format, for example +263771234567
echo.
set /p PHONE=Admin phone: 
set /p NAME=Full name: 
set /p PASS=Password (at least 8 characters): 
python manage.py create_admin %PHONE% "%NAME%" --password "%PASS%"
echo.
pause
