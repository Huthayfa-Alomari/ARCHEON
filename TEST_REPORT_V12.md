# JARVIS v1.2 Test Report

Date: 2026-09-19

## Executed checks

### 1. TypeScript syntax/transpile check
- Scope: every `.ts` / `.tsx` under `src/`
- Files checked: 78
- Result: **PASS — 0 syntax diagnostics**

### 2. MT5 bridge Python compile
- Command: `python3 -m py_compile bridge/mt5_bridge.py`
- Result: **PASS**

### 3. ICT/SMC detector runtime smoke test
- Input: 120 synthetic OHLC bars
- Result: **PASS**
- Detector returned bullish structure, generated 44 structural features in that run and included a BOS feature.

### 4. Research Orchestrator cross-dataset runtime test
- Candidate hypotheses: 3
- Datasets: 3 synthetic OHLC datasets (XAUUSD M15, EURUSD H1, BTCUSD H1)
- Planned experiments: 9
- Completed: **9**
- Failed: **0**
- Champion/Challenger aggregation rows: 3
- Result: **PASS**

An initial run exposed a real defect: mutated Donchian lookback values could become fractional, causing invalid array indexing. Discrete period/lookback parameters were normalized to integer values in the backtest signal engine and the matrix was rerun successfully at 9/9.

### 5. ICT/SMC backtest validation behavior
- Strategy: `ict-smc`
- Dataset: synthetic XAUUSD M15 test set
- OOS trades: 15 in the executed run
- Result: **PASS behaviorally**: the strategy was rejected by the validation gates rather than being privileged because of its strategy family.
- Rejection reasons included weak OOS profit factor, bootstrap probability, walk-forward consistency, cost stress and parameter stability.

### 6. Reproducibility hardening
- Bootstrap resampling changed from `Math.random()` to a deterministic seeded PRNG.
- Orchestrator now persists a top-level seed and derives per-experiment seeds from the complete hypothesis/dataset/cost identity.
- Result: **PASS by implementation + syntax/runtime rerun**

## Full project TypeScript build

`tsc --noEmit` was attempted. It cannot be treated as a valid full-build result in this execution environment because the extracted package does not contain installed `node_modules`; TypeScript therefore reports missing `next`, `react`, `@types/node` and resulting JSX/Node typing errors. This is an environment/dependency state, not reported as a successful build.

Run on the target machine after `npm install`:

```powershell
npm run typecheck
npm run build
```

## Scientific adapter limitation

ngspice, CalculiX, Gmsh, OpenFOAM and python-control are optional external runtimes. Their adapter code is included and syntax-checked; solver-level validation requires those runtimes to be installed on the target machine. JARVIS does not auto-install them without an explicit owner action.
