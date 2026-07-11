@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Najdi git: nejdriv obvykla cesta, jinak zkus PATH
set GIT="C:\Program Files\Git\cmd\git.exe"
if not exist %GIT% set GIT=git

echo ============================================
echo   Nahrani zmen webu guildy na GitHub
echo ============================================
echo.
echo Zmenene soubory:
%GIT% status --short
echo.

set /p msg=Kratky popis zmeny (nebo dejte Enter):
if "%msg%"=="" set msg=Uprava webu %DATE%

echo.
echo [1/3] Ukladam zmeny...
%GIT% add -A
%GIT% commit -m "%msg%"

echo.
echo [2/3] Stahuji zmeny z GitHubu...
%GIT% pull --no-rebase --no-edit
if errorlevel 1 goto konflikt

echo.
echo [3/3] Nahravam na GitHub...
%GIT% push
if errorlevel 1 goto pushfail

echo.
echo --------------------------------------------
echo Hotovo. Vse je nahrano. Web na GitHub Pages
echo se obnovi behem 1-2 minut. Okno muzete zavrit.
pause
exit /b 0

:konflikt
echo.
echo --------------------------------------------
echo POZOR: Pri stahovani zmen z GitHubu vznikl problem
echo (nejspis konflikt, ktery je potreba vyresit rucne).
echo NIC se zatim nenahralo na GitHub - vase zmeny jsou v bezpeci.
echo Napiste o tom Claudovi na pocitaci, pomuze to srovnat.
echo (Zatim prosim nespoustejte skript znovu.)
pause
exit /b 1

:pushfail
echo.
echo --------------------------------------------
echo POZOR: Nahrani na GitHub se nepovedlo.
echo Zkuste skript spustit znovu, nebo napiste Claudovi.
pause
exit /b 1
