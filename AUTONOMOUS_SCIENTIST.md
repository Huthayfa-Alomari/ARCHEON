# JARVIS v1.0 — Autonomous Scientist

JARVIS v1.0 turns the v0.9 Research Lab into a governed research lifecycle. It does **not** treat a book, paper, dataset, model answer, backtest, or high profit factor as proof.

## Research lifecycle

`Knowledge evidence -> proposed hypothesis -> experiment -> validated -> paper -> shadow -> promoted -> retired`

Promotion is code-gated. A live trading step requires both:

1. a hypothesis whose lifecycle status is `promoted`; and
2. the existing time-limited MT5 `live` permit plus broker-side/risk checks.

## Autonomous Quant Scientist

New capabilities:

- `research.knowledge.mine`: searches provenance-aware Knowledge Fabric and creates testable strategy hypotheses linked to source references.
- `research.candidates.generate`: creates a bounded candidate population from a research seed.
- `research.candidates.mutate`: evolves a parent hypothesis into parameter-neighborhood child candidates.
- `research.backtest.csv`: now includes chronological OOS testing, walk-forward folds, bootstrap resampling, transaction-cost stress, parameter-neighborhood stability, and an overfit-gap check.
- `research.rank`: compares tested candidates on robustness metrics. Ranking is research-only; it does not bypass lifecycle gates.
- `research.lifecycle.promote`: enforces stage transitions and evidence requirements.
- `trading.autopilot.step`: evaluates the latest **closed** MT5 bar. `shadow` never sends an order. `live` is rejected unless the hypothesis is promoted.

### Current programmable strategy primitives

- SMA cross
- RSI reversion
- Donchian breakout
- Bollinger reversion
- EMA trend pullback
- ATR-confirmed breakout
- Range-edge fade

These primitives are deliberately transparent. More complex ICT/SMC/market-microstructure detectors should be introduced as explicit detectors with unit tests rather than hidden LLM-only rules.

## Statistical gates

A candidate can fail for:

- insufficient OOS trades;
- OOS profit factor below threshold;
- excessive OOS drawdown;
- weak bootstrap probability;
- weak walk-forward consistency;
- transaction-cost fragility;
- parameter-neighborhood instability;
- excessive train/test gap.

A failed strategy remains in history. JARVIS should learn from rejection instead of rediscovering the same overfit repeatedly.

## Stage rules

- `validated -> paper`: latest experiment must pass.
- `paper -> shadow`: at least 30 paper trades and PF >= 1.05 are required by the lifecycle gate.
- `shadow -> promoted`: at least 14 shadow days and shadow max drawdown <= 10% are required by the lifecycle gate.
- any active strategy can be retired.

The thresholds are conservative defaults, not guarantees of profitability.
