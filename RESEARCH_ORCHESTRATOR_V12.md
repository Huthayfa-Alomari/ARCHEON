# JARVIS v1.2 — Research Orchestrator

## Purpose

v1.2 closes the earlier Research Orchestrator milestone while preserving the v1.1 Reach Capability Layer. It turns isolated strategy tests into bounded, reproducible cross-market research programs.

## Quant Research Orchestrator

`research.orchestrator.run` accepts a matrix of hypothesis IDs, OHLC datasets, symbols/timeframes and cost scenarios. The Cartesian plan is capped at 500 experiments per call. Each experiment uses a deterministic seed derived from the orchestrator seed + hypothesis + dataset + symbol/timeframe + cost scenario.

Each strategy is evaluated using:

- chronological 70/30 train/out-of-sample split;
- bounded walk-forward folds;
- seeded bootstrap resampling of OOS trades;
- transaction-cost stress at multiple multipliers;
- parameter-neighborhood stability;
- train/test overfit-gap checks.

Results persist in the orchestrator manifest and ordinary Research Store.

## Champion / Challenger

`research.portfolio.championChallenger` aggregates all stored experiments by hypothesis. A candidate needs cross-dataset coverage before it is eligible. Ranking includes median robustness, median OOS profit factor, pass rate and worst maximum drawdown. This is a research portfolio, not a live-trading recommendation and not an automatic live promotion.

## ICT / SMC detector module

Strategy kind `ict-smc` is executable in the backtester and has a direct MT5 read-only detector via `trading.ictsmc.detect`.

Implemented features:

- confirmed swing highs/lows;
- break of structure (BOS);
- change of character (CHoCH);
- bullish/bearish three-candle FVG;
- displacement normalized by ATR;
- heuristic bullish/bearish order blocks (last opposite candle before displacement);
- buy-side / sell-side liquidity sweeps;
- equal highs / equal lows with ATR-scaled tolerance;
- confluence score over a configurable confirmation window.

These are explicit programmable definitions, not claims that ICT terminology itself has predictive validity. Their value must be established by the same statistical validation pipeline as any other hypothesis.

## Scientific engineering adapters

`domain.engineering.adapters.doctor` probes optional local solvers. JARVIS does not silently install them.

- SPICE: `ngspice` batch netlists (`domain.spice.run`)
- FEA: CalculiX `.inp` jobs (`domain.fea.run`)
- mesh/preprocessing: Gmsh (`domain.mesh.run`)
- CFD: OpenFOAM with explicit solver allowlist (`domain.cfd.run`)
- control: bounded state-space simulation (`domain.control.simulate`)

External solvers execute only against workspace-contained paths, use fixed argument arrays (no generic shell), have timeouts, and are approval-gated when they write/run local solver workloads.

## Biomedical PICO lab

`domain.biomed.pico` converts a Population / Intervention / Comparison / Outcome question into a PubMed query and evidence-table scaffold. It records PMID, title, year, journal, authors, abstract and a study-design hint, while deliberately leaving effect size, harms and risk-of-bias fields unclaimed when PubMed metadata is insufficient.

The medical subsystem remains research-only: no autonomous diagnosis, prescribing, dosing or patient-specific treatment decision.

## Reach Research Swarm

`research.swarm.run` queries selected Reach sources in parallel. Source reliability values are class priors used for routing/triage, not truth probabilities. Social/community data can generate hypotheses or expose operational experience, but cannot validate medical efficacy or trading edge by itself.
