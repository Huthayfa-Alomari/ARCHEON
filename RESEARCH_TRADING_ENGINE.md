# JARVIS v0.9 — Research & Trading Intelligence Engine

## Principle
JARVIS does not promote a strategy because a book, paper, dataset, influencer or LLM claims it works. A strategy becomes deployable only after a provenance-preserving hypothesis is converted into executable rules and survives empirical validation.

## Research pipeline

```text
Books / papers / Kaggle / HF / market data
            |
      Knowledge Fabric
            |
   falsifiable hypothesis
            |
   programmable StrategySpec
            |
 chronology-safe backtest
      /             \
 train 70%       OOS 30%
                    |
          walk-forward folds
                    |
          bootstrap robustness
                    |
        VALIDATED / REJECTED
                    |
        paper trading candidate
                    |
       live deployment permit
```

Built-in strategy primitives in v0.9: SMA cross, RSI mean reversion, Donchian breakout and Bollinger mean reversion. These are primitives for testing hypotheses, not endorsements.

Validation includes transaction-cost assumptions, out-of-sample profit factor, maximum drawdown, positive walk-forward fold rate and bootstrap probability of positive return. The default validator rejects weak candidates instead of optimizing them until they look good.

## MetaTrader 5

`bridge/mt5_bridge.py` uses the official `MetaTrader5` Python package. It supports terminal/account status, OHLC bars, current positions, `order_check`, paper requests, and `order_send` for live trading.

Live execution is impossible unless a bounded permit is armed first:

```text
/trading arm paper 120
/trading arm live 30
/trading status
/trading kill
```

The permit expires automatically. Symbol and maximum-volume allowlists are enforced in JARVIS before the bridge is called. Use `JARVIS_TRADING_SYMBOLS`, `JARVIS_MAX_TRADE_VOLUME`, and risk variables in `.env.local`.

## Telegram

Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, and `TELEGRAM_WEBHOOK_SECRET`. Point the Telegram webhook to:

`https://YOUR_HOST/api/telegram/webhook`

The webhook validates Telegram's secret-token header and the chat allowlist. `/ping` is supported. Privileged trading remains controlled by the JARVIS trading permit rather than trusting arbitrary Telegram text.

## Biomedical / engineering domain packs

`domain.pubmed.search` adds PubMed discovery through NCBI E-utilities. Existing OpenAlex search remains the general scholarly connector for mechanical, electrical, civil, chemical, computer, materials, aerospace and other engineering fields. NIST/public engineering datasets can be added to Knowledge Fabric with provenance.

Medical knowledge must preserve source/date/study type and is evidence-support only; JARVIS must not convert a single paper or model output into an autonomous diagnosis/treatment action.
