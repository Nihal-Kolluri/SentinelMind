# One-command development runner for SentinelMind on Windows
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$env:PATH = "C:\Windows\System32;C:\Windows;$root\.tools\node;$root\.venv\Scripts;" + $env:PATH

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "               SENTINELMIND: STARTING APPLICATION                 " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Check if web/dist exists; if not, build it
if (!(Test-Path "$root\web\dist")) {
    Write-Host "[*] Building frontend assets..." -ForegroundColor Yellow
    Set-Location "$root\web"
    & "$root\.tools\node\npm.cmd" run build
    Set-Location $root
}

# 2. Launch FastAPI + React console
Write-Host "[+] Launching SentinelMind at http://127.0.0.1:8000" -ForegroundColor Green
& "$root\.venv\Scripts\python.exe" "$root\server.py"
