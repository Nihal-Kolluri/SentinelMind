# Launches both the SentinelMind web server and Cloudflare public sharing tunnel at once
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$env:PATH = "C:\Windows\System32;C:\Windows;$root\.tools\node;$root\.venv\Scripts;" + $env:PATH

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "          SENTINELMIND: ALL-IN-ONE SYSTEM LAUNCHER                 " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Build frontend if needed
if (!(Test-Path "$root\web\dist")) {
    Write-Host "[*] Building frontend assets..." -ForegroundColor Yellow
    Set-Location "$root\web"
    & "$root\.tools\node\npm.cmd" run build
    Set-Location $root
}

# 2. Start server in a background job or separate process
Write-Host "[+] Starting SentinelMind Web Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; & '$root\.venv\Scripts\python.exe' server.py"

Start-Sleep -Seconds 2

# 3. Start Cloudflare Tunnel
if (Test-Path "$root\.tools\cloudflared.exe") {
    Write-Host "[+] Starting Cloudflare Public HTTPS Sharing Tunnel..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; & '$root\.tools\cloudflared.exe' tunnel --url http://127.0.0.1:8000"
}

# 4. Open default browser
Write-Host "[+] Opening Web Console at http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Start-Process "http://127.0.0.1:8000"

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "[+] Both processes started!" -ForegroundColor Green
Write-Host " - Local URL: http://127.0.0.1:8000" -ForegroundColor White
Write-Host " - Share URL: Check the Cloudflare tunnel window for .trycloudflare.com" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
