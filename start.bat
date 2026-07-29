@echo off
title Frenchy - Caisse
cd /d "%~dp0"

echo ============================================
echo   Frenchy POS - Demarrage de la caisse
echo ============================================
echo.
echo Ne fermez pas cette fenetre pendant l'utilisation de la caisse.
echo Pour arreter la caisse, fermez cette fenetre ou appuyez sur Ctrl+C.
echo.

start "" cmd /c "timeout /t 2 >nul && start http://localhost:3000"

node server\index.js

echo.
echo Le serveur de caisse s'est arrete.
pause
