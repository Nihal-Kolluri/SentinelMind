@echo off
setlocal
set "ROOT=%~dp0"
set "PATH=C:\Windows\System32;C:\Windows;%PATH%"

echo ==================================================================
echo              SENTINELMIND: DOCKER CONTAINER LAUNCH
echo ==================================================================

REM Check if Docker CLI is installed and in PATH
where docker >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] DOCKER NOT DETECTED:
    echo     The 'docker' command was not found on your system.
    echo.
    echo [i] To use Docker:
    echo     Download and install Docker Desktop for Windows:
    echo     https://www.docker.com/products/docker-desktop
    echo.
    echo [*] Don't worry! SentinelMind runs natively without Docker.
    echo [*] Starting SentinelMind native server (run.bat)...
    echo ==================================================================
    echo.
    timeout /t 3 >nul 2>nul || ping 127.0.0.1 -n 4 >nul
    call "%ROOT%\run.bat"
    exit /b
)

if not exist "%ROOT%\.env" (
    echo [!] WARNING: .env file not found. Creating from .env.example...
    copy "%ROOT%\.env.example" "%ROOT%\.env"
)

echo [*] Building and starting SentinelMind Docker container...
docker compose up --build -d

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==================================================================
    echo [+] SentinelMind is now running inside Docker!
    echo [+] Web Console: http://127.0.0.1:8000
    echo [+] API Docs:    http://127.0.0.1:8000/docs
    echo ==================================================================
    echo.
    echo Opening browser at http://127.0.0.1:8000 ...
    timeout /t 2 >nul 2>nul || ping 127.0.0.1 -n 3 >nul
    start http://127.0.0.1:8000
) else (
    echo [X] Docker build failed. Please ensure Docker Desktop is running.
    echo [*] Would you like to run natively? Launching run.bat...
    timeout /t 3 >nul 2>nul || ping 127.0.0.1 -n 4 >nul
    call "%ROOT%\run.bat"
)

pause
