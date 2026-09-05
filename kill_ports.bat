@echo off
title Auto Kill Ports & Node Processes - ADHD Wearable System
color 0C
echo ==============================================================================
echo   AUTO-KILL PORT & PROCESS UTILITY (1883, 5001, 8080, 8081, 3001, Node.js)
echo ==============================================================================
cd /d %~dp0
node scripts/kill_ports.js
echo.
pause
