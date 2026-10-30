@echo off
chcp 65001 >nul
title HAYBEAT — Радар Трендов Армянской Музыки
cd /d "%~dp0"
echo ============================================================
echo   HAYBEAT — Радар Трендов Армянской Музыки
echo   Запуск локального сервера на http://localhost:8765 ...
echo ============================================================
start "" "http://localhost:8765"
python server.py
pause
