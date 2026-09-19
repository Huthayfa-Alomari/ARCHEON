# ARCHEON v1.4

**Autonomous Research, Cognition & Hyper-Execution Operating Network**

ARCHEON is an experimental agent operating system that combines multi-model reasoning, governed tool use, persistent research workflows, device connectivity, web reach, quantitative strategy research, MT5 integration, engineering computation, biomedical evidence retrieval, and auditable execution.

> **Core rule:** intelligence is not authority. Models may propose actions; permission, risk, approval, and platform boundaries decide whether an action is allowed.


## v1.4 Mission Control

ARCHEON now adds persistent Mission DAGs, specialized Agent Teams, typed Memory 2.0, an Eval Harness, bounded Docker sandbox execution, Plugin/MCP registry, self-improvement experiment planning, a Command Center/Approval Inbox, distributed Device Mesh work dispatch, global lockdown enforcement, evidence Claim Graphs, Book Intelligence, portfolio/microstructure analytics, Coding/Vision/IoT workflow foundations, and an optional browser wake-word.

See `ARCHEON_V14.md` for the v1.4 subsystem details.

## Major capabilities

### 1. Cognitive Council
- Multi-model routing and comparison.
- Cross-examination / critic / arbiter patterns.
- Performance feedback and model-selection signals.
- Persistent cognitive memory separated from sensitive health data.

### 2. Knowledge Fabric
- Provenance-aware local knowledge store.
- Deduplication, source fingerprints, licensing metadata, tags, and trust metadata.
- Connectors for Kaggle, Hugging Face datasets, World Bank, FRED, SEC EDGAR, OpenAlex, PubMed, and local authorized books/documents.
- Research retrieval before answer generation where appropriate.

### 3. Reach Capability Layer
- Ordered backends with health probes and fallback routing.
- Web reading/search, GitHub, YouTube, RSS, social/career routes, and optional Agent-Reach interoperability.
- Doctor/status checks before relying on external backends.
- No automatic cookie theft or silent login automation.

### 4. Autonomous Research Factory
- Persistent queue: `queued -> running -> completed/failed/cancelled`.
- Research cycles across symbols, timeframes, datasets, regimes, and cost scenarios.
- Multi-generation strategy evolution.
- Bounded matrices that can compose into thousands of planned backtests.
- Checkpoints and resumable research jobs.

### 5. Strategy Genome + Quant Research
- Strategy families including trend, breakout, mean reversion, and ICT/SMC-derived logic.
- `hybrid-vote` genomes for combining independent strategy components.
- Out-of-sample testing.
- Walk-forward validation.
- Seeded bootstrap for reproducibility.
- Cost/slippage stress.
- Parameter stability.
- Overfit-gap analysis.
- Champion/Challenger portfolio ranking.

### 6. ICT / SMC Detectors
- Swing highs/lows.
- BOS and CHoCH.
- Fair Value Gaps.
- Displacement normalized by ATR.
- Order Blocks.
- Buy-side / sell-side liquidity sweeps.
- Equal highs / equal lows.
- Confluence features usable by the research engine.

### 7. MetaTrader 5 Bridge
- Account/status/positions access through the local Python bridge.
- Historical candle snapshots for research datasets.
- `order_check` before `order_send`.
- Paper/shadow/live lifecycle separation.
- Live execution is gated by promoted-strategy state, time-bounded trading permit, stop loss, symbol allowlist, size/risk limits, and daily kill switch.

### 8. Telegram Control Plane
- Protected Telegram webhook.
- Chat allowlist.
- MT5 status and position queries.
- Kill command.
- Optional manual buy/sell commands only when live trading is explicitly armed and risk checks pass.

### 9. Device Mesh
- Pairing codes and per-device tokens.
- Capability-based Permission Broker.
- Device heartbeat and revocation.
- Android companion with foreground mesh service.
- Health Connect bridge.
- Meta Wearables DAT adapter.
- Tencent BrowserSkill adapter.

### 10. Health Vault
- AES-256-GCM encrypted local health storage.
- Supports heart rate, blood pressure, oxygen saturation, steps, and sleep records.
- Sensitive health data is isolated from ordinary model fan-out, trading research, and general memory by default.

### 11. Engineering Lab
- Deterministic engineering calculation kernels.
- Electrical, mechanical, structural, fluid, and thermal calculations.
- Adapters / probes for ngspice, Gmsh, CalculiX, and OpenFOAM.
- Control-systems state-space workflow.
- Solver execution remains allowlisted and permission-gated.

### 12. Biomedical Research Lab
- PubMed evidence retrieval.
- PICO structuring: Population / Intervention / Comparison / Outcome.
- Evidence tables with PMID, title, year, journal, authors, abstract, and study-design metadata.
- Research evidence is separated from diagnosis, prescribing, and autonomous clinical treatment.

### 13. Agentic Stack Registry + Observability
- Reviewed patterns from contemporary agent frameworks and infrastructure projects.
- Local JSONL tracing for tool start/finish/duration/status.
- Audit logs and approval boundaries.
- Sandbox-first design for generated execution.

## Architecture

```text
                         ARCHEON CORE
                              |
        +---------------------+---------------------+
        |                     |                     |
  Cognitive Council     Knowledge Fabric      Approval / Risk
        |                     |                     |
        +------------+--------+----------+----------+
                     |                   |
               Tool Registry       Research Factory
                     |                   |
          +----------+---------+     Strategy Genome
          |          |         |           |
        Reach     Device Mesh  Labs    Champion/Challenger
          |          |         |           |
       Web/Git    Android    Eng/Bio      MT5 Bridge
          |          |                     |
       Browser     Watch/Meta          Paper/Shadow/Live
```

## Safety boundaries

ARCHEON intentionally does **not** equate model intelligence with unrestricted machine authority.

- No generic unrestricted shell exposed to the model.
- System-changing operations should pass approval gates.
- Browser login/cookies are not silently extracted.
- Health records are isolated from ordinary memory/model fan-out.
- Engineering solvers are allowlisted.
- Biomedical modules are research-oriented, not autonomous treatment systems.
- Live trading remains separately armed and risk-gated.

## Quick start

### Requirements
- Windows 11 recommended for the current MT5/device workflow.
- Node.js 20.9+
- npm
- Python 3.x for the MT5 bridge
- MetaTrader 5 terminal for MT5 integration
- JDK 17 + Android SDK for the Android companion

### Desktop

```powershell
Copy-Item .env.example .env.local
.\SETUP_V14.ps1
npm install
npm run dev:lan
```

Or use:

```powershell
.\START_ARCHEON.ps1
```

Then open `http://localhost:3000`.

Do not expose the development server directly to the public Internet.

### MT5 bridge

```powershell
py -m pip install MetaTrader5
py bridge\mt5_bridge.py
```

The MetaTrader terminal must be installed, running, and logged into the intended account.

## Useful console commands

Examples available across the current codebase include:

```text
/status
/council status
/mesh
/devices
/permissions
/pair My-Phone
/health heart_rate,blood_pressure
/browser status
/reach
/agent-reach
/factory status
/agentic-stack
/kaggle xauusd gold forex
/hf finance trading
/papers market microstructure liquidity
/knowledge liquidity sweep psychology
/trading-library
/mt5 status
/positions
/kill
```

See the versioned documentation files for the complete subsystem details.

## Important documentation

- `ARCHITECTURE.md`
- `CAPABILITY_MATRIX.md`
- `SECURITY.md`
- `COUNCIL_PROTOCOL.md`
- `KNOWLEDGE_FABRIC.md`
- `DEVICE_MESH.md`
- `REACH_CAPABILITY_LAYER.md`
- `AUTONOMOUS_SCIENTIST.md`
- `RESEARCH_TRADING_ENGINE.md`
- `RESEARCH_ORCHESTRATOR_V12.md`
- `RESEARCH_FACTORY_V13.md`
- `SCIENTIFIC_LABS.md`
- `DOMAIN_PACKS.md`
- `AGENTIC_STACK_2026.md`
- `TEST_REPORT_V13.md`

## Validation status

The v1.3 baseline previously passed syntax-level validation across the TypeScript/TSX source set and Python `py_compile` for the MT5 bridge. Research Factory, Strategy Genome, regime segmentation, and ICT/SMC detector smoke tests were also exercised with bounded test datasets.

A clean machine should still run:

```bash
npm install
npm run typecheck
npm run build
```

because `node_modules` is intentionally not committed.

## Project status

ARCHEON is an advanced experimental system, not a finished safety-certified medical, financial, or engineering product. External runtimes such as OpenFOAM, CalculiX, Gmsh, ngspice, Browser Use, Firecrawl, Docker, or Gemini CLI are optional and must be installed/configured separately when those adapters are used.
