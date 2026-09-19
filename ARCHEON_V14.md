# ARCHEON v1.4 — Mission Control

v1.4 turns the v1.3 research platform into a broader governed agent operating layer.

## Implemented foundations

- Persistent Mission DAG with dependency validation and ready-task calculation.
- Specialized Agent Team catalog with scoped handoffs: architect, researcher, coder, QA, security, quant, biomedical and engineering.
- Memory 2.0 typed records: episodic, semantic, procedural, project, preference, failure and evidence.
- Core Eval Harness for deterministic tool/safety regression checks.
- Docker sandbox adapter: no network, read-only filesystem, memory/CPU/PID limits and explicit approval.
- Plugin/MCP registry with registration separated from enablement.
- Self-improvement experiment planner with auto-merge permanently disabled.
- Command Center status aggregator.
- Approval Inbox listing.
- Windows Computer Agent screenshot adapter with explicit approval.
- Distributed Device Mesh work dispatch using capability-scoped commands.
- Global security lockdown enforced in the central tool dispatcher.
- Evidence Claim Graph with provenance, source types, confidence and contradiction state.
- Book Intelligence concept/chapter discovery.
- Multi-asset correlation/portfolio analytics.
- Tick/microstructure features: VWAP, range, spread and optional volume imbalance.
- Coding Agent workflow scaffold with architect → coder → QA → security → owner gates.
- Vision task pipeline with capture permission separated from action permission.
- HTTPS Home Assistant service-plan adapter; execution is intentionally not automatic.
- Browser wake-word UI for “ARCHEON / أركيون”.
- GitHub CI: install, typecheck and production build.

## Security model

Global lockdown denies every approval-gated tool before execution, except the lockdown control itself. A model cannot bypass Permission Broker, Approval Gateway, trading lifecycle gates, Health Vault isolation, or the sandbox boundary.

## Useful commands

```text
/command
/missions
/mission mission_...
/approvals
/team
/sandbox
/plugins
/workers
/evals
/computer
/security
/lockdown
/unlock
/claims <query>
/memory2 <query>
```

## Scope note

Some v1.4 modules are foundations, not claims that every external platform is installed or fully autonomous. Docker, scientific solvers, Home Assistant, external MCP servers, MT5, Android/Meta runtimes and browser backends still require their respective local credentials/runtimes and permissions.
