# Generates an instant public HTTPS URL using Cloudflare Tunnel
$root = $PSScriptRoot

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "             SENTINELMIND: SHARING PUBLIC HTTPS URL                " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "[*] Make sure server.py is running in another terminal (run.bat or .\run_dev.ps1)" -ForegroundColor Yellow
Write-Host "[*] Launching Cloudflare Tunnel to http://127.0.0.1:8000..." -ForegroundColor Green
Write-Host ""
Write-Host "Look for the public URL ending in .trycloudflare.com below:" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

& "$root\.tools\cloudflared.exe" tunnel --url http://127.0.0.1:8000
