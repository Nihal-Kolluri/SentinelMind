@echo off
setlocal
set "ROOT=%~dp0"
set "PATH=C:\Windows\System32;C:\Windows;%ROOT%\.tools\node;%ROOT%\.venv\Scripts;%PATH%"

echo ==================================================================
echo          SENTINELMIND: ALL-IN-ONE SYSTEM LAUNCHER                 
echo ==================================================================
echo [*] This script starts ALL services at once:
echo     1. SentinelMind Web Application Server (Local: http://127.0.0.1:8000)
echo     2. Cloudflare Public HTTPS Tunnel (Share with friends)
echo     3. Automatically opens your browser
echo ==================================================================
echo.

REM 1. Ensure frontend is compiled
if not exist "%ROOT%\web\dist" (
    echo [*] Compiling web assets for production...
    cd /d "%ROOT%\web"
    call "%ROOT%\.tools\node\npm.cmd" run build
    cd /d "%ROOT%"
)

REM 2. Launch Backend Server in a dedicated window
echo [+] Starting SentinelMind Backend Server...
start "SentinelMind Web Server" cmd /k "cd /d "%ROOT%" && "%ROOT%\.venv\Scripts\python.exe" server.py"

REM Give server 2 seconds to initialize
timeout /t 2 >nul 2>nul || ping 127.0.0.1 -n 3 >nul

REM 3. Launch Public Cloudflare Tunnel in a dedicated window
if exist "%ROOT%\.tools\cloudflared.exe" (
    echo [+] Starting Cloudflare Public HTTPS Sharing Tunnel...
    start "SentinelMind Public Share Tunnel" cmd /k "cd /d "%ROOT%" && "%ROOT%\.tools\cloudflared.exe" tunnel --url http://127.0.0.1:8000"
) else (
    echo [!] cloudflared.exe not found in .tools - skipping public tunnel.
)

REM 4. Open default browser to local web console
echo [+] Opening Web Console at http://127.0.0.1:8000 ...
timeout /t 1 >nul 2>nul || ping 127.0.0.1 -n 2 >nul
start http://127.0.0.1:8000

echo.
echo ==================================================================
echo [+] ALL SERVICES ARE NOW RUNNING!
echo.
echo  - LOCAL URL (For You):
echo    http://127.0.0.1:8000
echo.
echo  - SHARE URL (For Your Friend):
echo    Look in the "SentinelMind Public Share Tunnel" window
echo    Copy the link ending in .trycloudflare.com
echo.
echo [*] Keep these terminal windows open while testing.
echo [*] To stop everything: simply close the terminal windows.
echo ==================================================================
echo.
pause
