@echo off
title Green-Roomz local-ci
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-ci.ps1"
echo.
echo local-ci exited %ERRORLEVEL%
pause
