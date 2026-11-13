@echo off
rem Doppio clic: avvia database e sito e apre il browser. Chiudendo questa finestra si spegne tutto.
title Cartelle Cliniche
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato: installalo da https://nodejs.org e riprova.
  pause
  exit /b 1
)
node scripts\avvia.mjs
if errorlevel 1 pause
