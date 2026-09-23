@echo off
setlocal
if "%~1"=="" (
  python "%~dp0runner.py" --help
  exit /b %errorlevel%
)
python "%~dp0runner.py" %*
exit /b %errorlevel%
