@echo off
chcp 65001 >nul
title HAYBEAT — Локальный сервер + Онлайн-туннель Cloudflare
echo =====================================================================
echo   HAYBEAT — Радар Трендов Армянской Музыки (Онлайн + Локальный режим)
echo =====================================================================
echo   Постоянный облачный сайт 24/7:
echo   https://haykohanyans.github.io/haybeat-armenian-music/
echo =====================================================================
cd /d "%~dp0"
start "HAYBEAT Local Server" cmd /k "python server.py"
timeout /t 2 >nul
echo Запускаю публичный HTTPS-туннель Cloudflare...
"%~dp0cloudflared.exe" tunnel --no-autoupdate --url http://localhost:8765
