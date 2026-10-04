@echo off
set "ROOT=%~dp0"
set "PATH=C:\Windows\System32;C:\Windows;%PATH%"

echo ==================================================================
echo             SENTINELMIND: SHARING PUBLIC HTTPS URL                
echo ==================================================================
echo [*] Ensure your server is running in another terminal (run.bat)
echo [*] Starting Cloudflare Tunnel to http://127.0.0.1:8000...
echo.
echo Look for the URL ending in .trycloudflare.com below:
echo ==================================================================
"%ROOT%\.tools\cloudflared.exe" tunnel --url http://127.0.0.1:8000
pause
