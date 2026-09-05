@echo off
title ADHD Wearable IoT Multisensor Full-Stack System
color 0B
echo ==============================================================================
echo   SISTEM WEARABLE IOT MULTISENSOR BERBASIS BIOFEEDBACK UNTUK ANAK ADHD
echo   Peneliti: Muhammad Reza (NPM: 2209020111) - Fasilkom-TI UMSU Medan 2026
echo ==============================================================================
cd /d %~dp0
node scripts/kill_ports.js
echo.
echo Menjalankan Backend (Port 5001 + MQTT 1883) dan Frontend Dashboard secara bersamaan...
echo.
npm run dev


