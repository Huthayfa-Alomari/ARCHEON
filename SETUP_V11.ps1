$ErrorActionPreference = 'Stop'
Write-Host 'JARVIS v1.1 Reach setup'
if (-not (Test-Path '.env.local')) { Copy-Item '.env.example' '.env.local' }
npm install
Write-Host 'Core dependencies installed.'
Write-Host 'Optional: install Agent-Reach after reviewing its upstream project:'
Write-Host '  py -m pip install --upgrade https://github.com/Panniantong/Agent-Reach/archive/main.zip'
Write-Host 'Then run JARVIS and use /reach or /agent-reach.'
