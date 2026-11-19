@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
set "CODEX_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
where node >nul 2>&1
if errorlevel 1 if exist "%CODEX_RUNTIME%\node\bin\node.exe" set "PATH=%CODEX_RUNTIME%\node\bin;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or later.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  call :create_venv
  if errorlevel 1 goto failed
)
".venv\Scripts\python.exe" -c "import flask, PIL" >nul 2>&1
if errorlevel 1 (
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto failed
)
echo Open http://127.0.0.1:5050 in a browser.
".venv\Scripts\python.exe" app.py
if errorlevel 1 goto failed
exit /b 0

:create_venv
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -m venv .venv
  exit /b
)
where python >nul 2>&1
if not errorlevel 1 (
  python -m venv .venv
  exit /b
)
if exist "%CODEX_RUNTIME%\python\python.exe" (
  "%CODEX_RUNTIME%\python\python.exe" -m venv .venv
  exit /b
)
echo Install Python 3.10 or later.
exit /b 1

:failed
echo Could not start Bambolbi. See the error above.
pause
exit /b 1
