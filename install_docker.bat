@echo off
setlocal
set "ROOT=%~dp0"
set "PATH=C:\Windows\System32;C:\Windows;%PATH%"

echo ==================================================================
echo             DOCKER DESKTOP INSTALLER & SETUP ASSISTANT
echo ==================================================================

where docker >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [+] Docker is ALREADY installed and recognized on your system!
    docker --version
    echo.
    echo [*] Starting SentinelMind container...
    call "%ROOT%\docker-run.bat"
    exit /b
)

echo [*] Docker Desktop is not yet installed on this PC.
echo.
echo [1/3] Downloading official Docker Desktop Installer for Windows (~590MB)...
echo       URL: https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe
echo.

set "INSTALLER=%ROOT%\Docker_Desktop_Installer.exe"

if exist "%INSTALLER%" (
    echo [*] Found existing installer: %INSTALLER%
) else (
    echo [*] Downloading installer now... Please wait a few moments...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'Continue'; Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker Desktop Installer.exe' -OutFile '%INSTALLER%'"
)

if not exist "%INSTALLER%" (
    echo [!] Download could not complete automatically.
    echo [*] Opening the direct download link in your browser instead:
    start https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe
    echo.
    echo Please run the downloaded installer manually.
    pause
    exit /b
)

echo.
echo [2/3] Launching Docker Desktop Installer...
echo ==================================================================
echo IMPORTANT DURING INSTALLATION:
echo  1. Keep checked: "Use WSL 2 instead of Hyper-V (recommended)"
echo  2. Click "OK" and let the installation complete.
echo  3. If Windows prompts to log out or restart, do so.
echo  4. After restart, open "Docker Desktop" from your Windows Start Menu.
echo ==================================================================
echo.
start "" "%INSTALLER%"

echo [3/3] Once Docker Desktop is launched and shows "Engine running":
echo       Run: docker-run.bat
echo.
pause
