# JARVIS v0.9 Test Report

Date: 2026-09-19

## Passed
- TypeScript/TSX syntax transpilation check across `src/`: **61 files, 0 syntax diagnostics**.
- Python syntax compilation: `python3 -m py_compile bridge/mt5_bridge.py`: **PASS**.
- Structural integration checks: Research Lab tools, Trading tools, PubMed tool, v0.9 prompt, and environment keys: **PASS**.
- Telegram webhook route is present and protected by webhook secret + chat allowlist when configured.
- MT5 live order path requires an active live permit, symbol allowlist, max volume, explicit stop-loss, per-trade equity risk check, broker `order_check`, and daily realized-loss kill switch before `order_send`.

## Environment-dependent / not executed here
- `npm run typecheck`, `npm run lint`, and `npm run build` require project dependencies. The source archive does not contain `node_modules` or a lockfile. `npm install` in this execution environment exceeded the available execution window, so a full Next.js dependency-aware build was **not** claimed as passed.
- Live MetaTrader 5 integration requires Windows MT5 terminal + Python `MetaTrader5` package and a configured/logged-in terminal.
- Telegram end-to-end delivery requires a real bot token, webhook registration, HTTPS host and allowed chat IDs.
- PubMed end-to-end queries require outbound network access at runtime.

## First-run verification on Windows
```powershell
.\SETUP_V09.ps1
npm install
npm run typecheck
npm run lint
npm run build
py -m pip install -U MetaTrader5
npm run dev:lan
```

Then test:
```text
/research stats
/mt5 status
/mt5 bars XAUUSD M15 500
/trading arm paper 60
/pubmed atrial fibrillation anticoagulation guideline
```

Do not arm live trading until paper mode and historical validation have been reviewed.
