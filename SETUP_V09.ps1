$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "[JARVIS v0.9] Created .env.local" -ForegroundColor Cyan
}

function New-RandomBase64([int]$Bytes) {
  $buffer = New-Object byte[] $Bytes
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
  return [Convert]::ToBase64String($buffer)
}

function Set-EnvIfBlank([string]$Name, [string]$Value) {
  $path = Join-Path $PSScriptRoot ".env.local"
  $lines = [System.Collections.Generic.List[string]](Get-Content $path)
  $pattern = "^" + [Regex]::Escape($Name) + "=(.*)$"
  $found = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    $m = [Regex]::Match($lines[$i], $pattern)
    if ($m.Success) {
      $found = $true
      if ([string]::IsNullOrWhiteSpace($m.Groups[1].Value)) {
        $lines[$i] = "$Name=$Value"
        Write-Host "[JARVIS v0.9] Generated $Name" -ForegroundColor Green
      } else {
        Write-Host "[JARVIS v0.9] Kept existing $Name" -ForegroundColor DarkGray
      }
      break
    }
  }

  if (-not $found) {
    $lines.Add("$Name=$Value")
    Write-Host "[JARVIS v0.9] Added $Name" -ForegroundColor Green
  }

  Set-Content -Path $path -Value $lines -Encoding UTF8
}

Set-EnvIfBlank "JARVIS_HEALTH_VAULT_KEY" (New-RandomBase64 32)
Set-EnvIfBlank "JARVIS_DEVICE_MESH_SECRET" (New-RandomBase64 32)

Write-Host "" 

try {
  $kaggleVersion = (& kaggle --version 2>$null)
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Kaggle CLI: $kaggleVersion" -ForegroundColor Green
  }
} catch {
  Write-Host "Optional Kaggle ingestion: install Python 3.11+ then run: py -m pip install -U kaggle" -ForegroundColor Yellow
}

Write-Host "Device Mesh secrets are ready. Knowledge Fabric configuration is available in .env.local." -ForegroundColor Green
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  npm install"
Write-Host "  npm run dev:lan"
Write-Host "Then use /pair My-Phone for Device Mesh, /trading-library for books, /kaggle <query>, /kaggle-ingest owner/dataset file.csv, /hf <query>, or /papers <query>."

Write-Host "" 
try {
  & py -c "import MetaTrader5; print('MetaTrader5 Python package: OK')" 2>$null
  if ($LASTEXITCODE -ne 0) { throw "missing" }
} catch {
  Write-Host "MT5 bridge dependency missing. Install with: py -m pip install -U MetaTrader5" -ForegroundColor Yellow
}

Write-Host "v0.9 commands:" -ForegroundColor Cyan
Write-Host "  /research stats"
Write-Host "  /hypotheses"
Write-Host "  /mt5 status"
Write-Host "  /mt5 bars XAUUSD M15 1000"
Write-Host "  /trading arm paper 120"
Write-Host "  /trading arm live 30"
Write-Host "  /trading kill"
Write-Host "  /pubmed market microstructure is not biomedical; use /papers for engineering/trading and /pubmed for medical research"
