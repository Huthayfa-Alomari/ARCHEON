$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[ARCHEON v1.3] Checking Node.js..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 20.9+ and run this script again."
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") | Out-String).Trim()
if ($nodeMajor -lt 20) {
  throw "ARCHEON requires Node.js 20.9 or newer."
}

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "[ARCHEON v1.3] Created .env.local." -ForegroundColor Yellow
}

$healthLine = Select-String -Path ".env.local" -Pattern '^JARVIS_HEALTH_VAULT_KEY=(.*)$' | Select-Object -First 1
if (-not $healthLine -or [string]::IsNullOrWhiteSpace($healthLine.Matches[0].Groups[1].Value)) {
  Write-Host "[ARCHEON v1.3] Health Vault key is not configured. Running safe local setup..." -ForegroundColor Yellow
  & "$PSScriptRoot\SETUP_V09.ps1"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[ARCHEON v1.3] Installing dependencies..." -ForegroundColor Cyan
  npm install
}

Write-Host "[ARCHEON v1.3] Desktop UI: http://localhost:3000" -ForegroundColor Green
Write-Host "[ARCHEON v1.3] Device Mesh: listening on LAN interfaces for Android development." -ForegroundColor Green
Write-Host "[SECURITY] Keep this on a trusted LAN. Do not port-forward the dev server." -ForegroundColor Yellow
Start-Process "http://localhost:3000"
npm run dev:lan
