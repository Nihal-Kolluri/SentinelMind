@echo off
set "ROOT=%~dp0"
set "PATH=C:\Windows\System32;C:\Windows;%ROOT%\.tools\node;%ROOT%\.venv\Scripts;%PATH%"

echo ==================================================================
echo                SENTINELMIND: STARTING APPLICATION                 
echo ==================================================================

if not exist "%ROOT%\web\dist" (
    echo [*] Building frontend assets...
    cd /d "%ROOT%\web"
    call "%ROOT%\.tools\node\npm.cmd" run build
    cd /d "%ROOT%"
)

echo [+] Launching SentinelMind Console at http://127.0.0.1:8000
"%ROOT%\.venv\Scripts\python.exe" "%ROOT%\server.py"
pause
