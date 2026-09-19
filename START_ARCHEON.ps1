$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "[ARCHEON v1.5] Checking Node.js..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 20.9+ and run this script again."
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") | Out-String).Trim()
if ($nodeMajor -lt 20) {
  throw "ARCHEON requires Node.js 20.9 or newer."
}

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "[ARCHEON v1.5] Created .env.local." -ForegroundColor Yellow
}

$healthLine = Select-String -Path ".env.local" -Pattern '^JARVIS_HEALTH_VAULT_KEY=(.*)$' | Select-Object -First 1
if (-not $healthLine -or [string]::IsNullOrWhiteSpace($healthLine.Matches[0].Groups[1].Value)) {
  Write-Host "[ARCHEON v1.5] Health Vault key is not configured. Running safe local setup..." -ForegroundColor Yellow
  & "$PSScriptRoot\SETUP_V09.ps1"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "[ARCHEON v1.5] Installing dependencies..." -ForegroundColor Cyan
  npm install
}

$autoWorkerLine = Select-String -Path ".env.local" -Pattern '^JARVIS_COGNITION_WORKER_AUTOSTART=(.*)$' | Select-Object -First 1
$autoWorker = $false
if ($autoWorkerLine) {
  $autoValue = $autoWorkerLine.Matches[0].Groups[1].Value.Trim().ToLower()
  $autoWorker = $autoValue -in @("1","true","yes","on")
}

if ($autoWorker) {
  Write-Host "[ARCHEON v1.5] Starting bounded cognition worker in a separate PowerShell window..." -ForegroundColor Cyan
  Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList "-NoExit","-Command","npm run cognition:worker"
}

Write-Host "[ARCHEON v1.5] Desktop UI: http://localhost:3000" -ForegroundColor Green
Write-Host "[ARCHEON v1.5] Device Mesh: listening on LAN interfaces for Android development." -ForegroundColor Green
Write-Host "[SECURITY] Keep this on a trusted LAN. Do not port-forward the dev server." -ForegroundColor Yellow

Start-Process "http://localhost:3000"
npm run dev:lan
