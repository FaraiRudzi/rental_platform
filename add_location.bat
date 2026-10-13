@echo off
title Add a city and suburbs
cd /d "%~dp0backend"
call venv\Scripts\activate
echo Add the city and suburbs where you will launch. Tenants search by suburb.
echo Example city: Harare      Example suburbs: Avondale,Borrowdale,Mabelreign
echo.
set /p CITY=City: 
set /p SUBURBS=Suburbs (separated by commas, no spaces after commas): 
python manage.py add_location "%CITY%" --suburbs "%SUBURBS%"
echo.
pause
