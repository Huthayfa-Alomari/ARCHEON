$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".env.local")) { Copy-Item ".env.example" ".env.local" }
Write-Host "[ARCHEON v1.5] Installing dependencies..." -ForegroundColor Cyan
npm install
Write-Host "[ARCHEON v1.5] Type checking..." -ForegroundColor Cyan
npm run typecheck
Write-Host "[ARCHEON v1.5] Setup complete." -ForegroundColor Green
Write-Host "Start core: .\START_ARCHEON.ps1"
Write-Host "Optional cognition worker (after enabling autonomy): npm run cognition:worker"
