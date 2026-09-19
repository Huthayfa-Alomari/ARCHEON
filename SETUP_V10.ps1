$ErrorActionPreference = "Stop"
Write-Host "[JARVIS v1.0] Autonomous Scientist setup" -ForegroundColor Cyan

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local from .env.example" -ForegroundColor Yellow
}

$node = node -v
Write-Host "Node: $node"
$py = $env:JARVIS_PYTHON_BIN
if (-not $py) { $py = "py" }

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
  npm install
}

Write-Host "Running TypeScript typecheck..." -ForegroundColor Cyan
npm run typecheck

Write-Host "Checking MT5 Python bridge syntax..." -ForegroundColor Cyan
& $py -m py_compile bridge/mt5_bridge.py

Write-Host "JARVIS v1.0 setup checks complete." -ForegroundColor Green
Write-Host "Start with: .\START_JARVIS.ps1"
