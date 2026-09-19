$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not (Test-Path ".env.local")) { Copy-Item ".env.example" ".env.local" }
Write-Host "[ARCHEON v1.4] Installing dependencies..." -ForegroundColor Cyan
npm install
Write-Host "[ARCHEON v1.4] Type checking..." -ForegroundColor Cyan
npm run typecheck
Write-Host "[ARCHEON v1.4] Setup complete. Run .\START_ARCHEON.ps1" -ForegroundColor Green
