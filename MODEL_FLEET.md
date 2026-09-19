# JARVIS v0.6 Model Fleet

The fleet is multi-provider and Council-aware. Model names and provider availability change over time, so routes are operational configuration rather than permanent claims about which model is universally strongest.

Currently supported route families in the codebase include:

- OpenAI frontier routes;
- DeepSeek;
- Alibaba Model Studio routes for Qwen and selected third-party Chinese models;
- OpenRouter free/community routes;
- arbitrary local Ollama models;
- a legacy OpenAI-compatible endpoint.

Council Mode can ask every configured route rather than choosing one winner up front. Historical model performance is used as a bounded signal for ordering/arbiter selection, not as a permanent leaderboard.

Use `/models` to inspect routes actually configured on the current machine and `/performance` after several Council sessions to inspect learned operational metrics.
