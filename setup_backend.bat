@echo off
title Rental Platform - first-time setup
cd /d "%~dp0backend"
echo.
echo === Step 1 of 4: creating the Python environment ===
if not exist venv ( python -m venv venv )
if errorlevel 1 ( echo Python was not found. Install Python 3.10+ and tick "Add Python to PATH". & pause & exit /b 1 )
call venv\Scripts\activate
echo.
echo === Step 2 of 4: installing Python packages (a few minutes) ===
python -m pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 ( echo Package install failed. See START_HERE.txt, Troubleshooting. & pause & exit /b 1 )
echo.
echo === Step 3 of 4: creating your settings file ===
if not exist .env ( copy .env.example .env >nul & echo Created backend\.env )
echo.
echo === Step 4 of 4: preparing the database connection ===
python manage.py makemigrations core
python manage.py migrate
if errorlevel 1 ( echo.& echo The database step failed. Is MySQL running in XAMPP? Check backend\.env. & pause & exit /b 1 )
echo.
echo Setup finished. Next: double-click create_admin.bat
pause
