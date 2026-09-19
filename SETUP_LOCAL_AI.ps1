$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$Model = if ($env:ARCHEON_OLLAMA_MODEL) { $env:ARCHEON_OLLAMA_MODEL } else { "qwen3:4b" }

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host "[ARCHEON] Installing Ollama..." -ForegroundColor Yellow
  irm https://ollama.com/install.ps1 | iex
}

try { Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3 | Out-Null } catch {
  Start-Process ollama -ArgumentList "serve" -WindowStyle Minimized
  Start-Sleep -Seconds 3
}

Write-Host "[ARCHEON] Pulling $Model ..." -ForegroundColor Cyan
ollama pull $Model
if ($LASTEXITCODE -ne 0) { throw "Failed to pull $Model" }

if (-not (Test-Path ".env.local")) { Copy-Item ".env.example" ".env.local" }
$lines = Get-Content ".env.local"
$lines = $lines | Where-Object {
  $_ -notmatch '^JARVIS_LLM_PROVIDER=' -and
  $_ -notmatch '^JARVIS_MODEL_ROUTING=' -and
  $_ -notmatch '^JARVIS_COUNCIL_MODE=' -and
  $_ -notmatch '^OLLAMA_BASE_URL=' -and
  $_ -notmatch '^JARVIS_OLLAMA_MODELS='
}
$lines += "JARVIS_LLM_PROVIDER=auto"
$lines += "JARVIS_MODEL_ROUTING=local"
$lines += "JARVIS_COUNCIL_MODE=off"
$lines += "OLLAMA_BASE_URL=http://127.0.0.1:11434"
$lines += "JARVIS_OLLAMA_MODELS=$Model"
Set-Content ".env.local" $lines -Encoding UTF8

Write-Host "[ARCHEON] Local AI ready: $Model" -ForegroundColor Green
Write-Host "Run .\START_ARCHEON.ps1" -ForegroundColor Green