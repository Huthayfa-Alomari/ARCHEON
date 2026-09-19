# JARVIS v1.3 Test Report

Date: 2026-09-19

## 1. TypeScript syntax/transpile

- Scope: all `.ts` / `.tsx` files under `src/`
- Files checked: 84
- Syntax diagnostics: **0**
- Result: **PASS**

## 2. MT5 bridge

- `python3 -m py_compile bridge/mt5_bridge.py`
- Result: **PASS**

## 3. Strategy Genome runtime smoke test

- Parents: ICT/SMC + SMA Cross
- Resulting strategy type: `hybrid-vote`
- Components: `ict-smc`, `sma-cross`
- Result: **PASS**

## 4. Regime segmentation

- Synthetic XAUUSD dataset
- 100-bar windows
- Runtime produced multiple regime segments
- Result: **PASS**

## 5. Persistent Research Factory

Test plan:

- 1 dataset
- 3 seed hypotheses
- 2 evolutionary generations
- 3 backtests per matrix (smoke-test bound)
- regime scan + matrix/evolution interleave + final matrix + portfolio

Results:

- Jobs enqueued: 7
- Completed: **7**
- Failed: **0**
- Final hypotheses: 27
- Hybrid genomes: 24
- Result: **PASS**

The production bound remains max 500 backtests per matrix job. Multiple generational matrix jobs allow thousands of experiments without making one unbounded invocation.

## 6. TypeScript full typecheck caveat

`tsc --noEmit` was attempted. The extracted package does not include installed `node_modules`, so the environment reports missing Next/React/Node modules and typings. After filtering dependency-resolution errors, the new v1.3 modules do not show additional implicit-any diagnostics.

Run on the target machine:

```powershell
npm install
npm run typecheck
npm run build
```

## 7. External runtimes

Optional external solvers/browser/sandbox components are not auto-installed. Their availability is detected at runtime. This preserves owner control and avoids silently modifying the workstation.
