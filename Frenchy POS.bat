@echo off
title Frenchy POS
cd /d "%~dp0"

echo Demarrage de Frenchy POS...
start "Frenchy POS - Serveur (ne pas fermer)" cmd /k "npm start"

timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"

exit
