# JARVIS v0.8 Capability Matrix

| Capability | Principal | Sensitivity | Approval/Broker boundary | v0.8 status |
|---|---|---:|---|---|
| `mesh.heartbeat` | Android device | Low | auto-granted at pairing | Implemented |
| `device.notifications.push` | Android device | Medium | explicit broker grant + action approval | Implemented |
| `device.vibrate` | Android device | Medium | explicit broker grant + action approval | Implemented |
| `device.location.read` | Android device | High | explicit broker grant | Broker-defined; local collector not yet implemented |
| `health.heart_rate.read` | Android device | High | Android Health permission + broker grant | Implemented |
| `health.blood_pressure.read` | Android device | Critical | Android Health permission + broker grant | Implemented |
| `health.oxygen_saturation.read` | Android device | High | Android Health permission + broker grant | Implemented |
| `health.steps.read` | Android device | Medium | Android Health permission + broker grant | Implemented |
| `health.sleep.read` | Android device | High | Android Health permission + broker grant | Implemented |
| `meta.camera.capture` | Android device | Critical | Meta registration + broker grant + approval | Implemented; media stays on phone |
| `meta.camera.stream` | Android device | Critical | Meta registration + broker grant + approval | Implemented control path |
| `meta.display.render` | Android device | High | Meta registration + broker grant + approval | Implemented |
| `browser.observe` | `local:browser-skill` | Medium | broker grant | Implemented |
| `browser.navigate` | `local:browser-skill` | High | broker grant + approval | Implemented |
| `browser.interact` | `local:browser-skill` | High | broker grant + approval | Implemented |
| `browser.borrow_user_tab` | `local:browser-skill` | Critical | broker grant + JARVIS approval + BrowserSkill confirmation | Implemented |

Capability advertisement is never equivalent to a grant.


## Knowledge Fabric

| Capability | Source | Persistence | Guardrail |
| --- | --- | --- | --- |
| Dataset discovery | Kaggle / Hugging Face | No by default | Results are evidence, not instructions |
| Dataset sample ingestion | Hugging Face Dataset Viewer | Yes, bounded sample | Explicit approval + provenance + dedup |
| Economic data | World Bank / FRED | Live by default | Promotion required for durable memory |
| Company filings | SEC EDGAR | Live by default | Source/CIK preserved |
| Research discovery | OpenAlex | Live by default | Citation metadata preserved |
| Trading books | Project Gutenberg / user-owned files | Yes | License/source required + explicit approval |
| Local knowledge files | Workspace-only files | Yes | Size/type restrictions + secret redaction |

## v1.3 additions

- Research Factory persistent queue: implemented
- Multi-generation experiment capacity: implemented (500-run bounded matrix jobs, repeatable across generations)
- Strategy Genome crossover: implemented
- ICT/SMC + Quant hybrid-vote strategies: implemented
- Regime segmentation: implemented
- MT5 OHLC research snapshots: implemented, approval-gated write
- Tool tracing/observability: implemented
- 2026 agentic stack registry: implemented
- Firecrawl / Browser Use / external sandbox products: optional adapters/references, not auto-installed
