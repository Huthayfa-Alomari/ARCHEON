$ErrorActionPreference = "Stop"
Write-Host "ARCHEON v1.3 setup"
npm install
npm run typecheck
Write-Host "Optional MT5 bridge package: py -m pip install MetaTrader5"
Write-Host "Start: npm run dev"
Write-Host "Useful commands: /factory status ; /agentic-stack ; /regimes data/research-datasets/file.csv"
