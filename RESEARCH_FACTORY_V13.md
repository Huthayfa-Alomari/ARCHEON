# JARVIS v1.3 — Autonomous Research Factory

JARVIS v1.3 turns the v1.2 Research Orchestrator into a persistent, resumable research factory.

## Factory loop

1. Dataset snapshots / local CSVs
2. Regime segmentation
3. Bounded experiment matrix (max 500 backtests per matrix job)
4. Strategy Genome crossover + seeded mutation
5. Next-generation experiment matrix
6. Repeat for N generations
7. Final matrix
8. Champion / Challenger aggregation

Because each generation can enqueue a fresh 500-run matrix, a normal 4-generation factory plan has capacity for up to 2,500 backtests while each individual execution remains bounded and persisted.

## Strategy Genome

Cross-family parents are represented as `hybrid-vote` strategies with explicit components. Example:

- ICT/SMC structure/liquidity component
- SMA trend component
- RSI mean-reversion component

Each component produces an independent signal. The genome has a vote threshold and is subjected to the same OOS, walk-forward, seeded bootstrap, cost stress, parameter stability and overfit gates as any other strategy.

No strategy family receives privileged validation.

## Persistent queue

Job states:

`queued -> running -> completed | failed | cancelled`

Failed jobs can be retried up to a bounded `maxAttempts`. State lives in `JARVIS_RESEARCH_FACTORY_PATH` and survives process restarts.

Supported jobs:

- `matrix`
- `evolution`
- `regime-scan`
- `portfolio`

## Data sources

- Existing local OHLC CSVs
- MT5 terminal snapshots via `research.datasets.mt5Snapshot`
- Kaggle / Hugging Face data already brought into the JARVIS workspace through the existing approval-gated knowledge connectors

MT5 snapshotting is research-only and never sends an order.

## Observability

Every tool call is traced to a local JSONL trace store with start/finish/status/duration metadata. This is separate from the existing audit log and is intended for agent debugging and evaluation.

## Safety boundary

The Research Factory can create hypotheses, datasets, experiments, genomes and rankings. It cannot bypass the trading lifecycle. Live execution still requires the existing trading permit, risk checks, stop-loss requirement and promotion gates.
