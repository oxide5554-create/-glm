@echo off
title Push to GitHub - RUST Game
color 0A

echo ============================================================
echo   RUST - PUSH TO GITHUB
echo   Upload all new changes to GitHub
echo ============================================================
echo.

REM Check if this is a git repository
if not exist ".git" (
    echo [!] This is NOT a git repository!
    echo.
    echo If you DO NOT have the repo cloned yet:
    echo   1. Open folder where you want the game
    echo   2. Right-click -^> Open PowerShell here
    echo   3. Type: git clone https://github.com/oxide5554-create/-glm.git
    echo   4. Copy game files into the -glm folder
    echo   5. Run this .bat from the -glm folder
    echo.
    pause
    exit /b 1
)

echo [1/4] Checking changes...
echo.
git status --short
echo.

echo [2/4] Adding all files...
git add .
echo.

echo [3/4] Creating commit...
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "ts=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%:%dt:~12,2%"
git commit -m "Update %ts% - recoil, crosshair, spread"
echo.

echo [4/4] Pushing to GitHub...
git push origin main
echo.

if %ERRORLEVEL% EQU 0 (
    echo ============================================================
    echo   SUCCESS! All changes uploaded to GitHub
    echo ============================================================
) else (
    echo ============================================================
    echo   ERROR! Push failed
    echo.
    echo   Try manually:
    echo   1. Open PowerShell in this folder
    echo   2. Type: git push
    echo   3. Enter GitHub login and token
    echo ============================================================
)
echo.
pause
