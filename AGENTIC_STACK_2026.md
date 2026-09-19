# JARVIS Agentic Stack Registry — 2026 Review

Reviewed source: ODSC, “Top Agentic AI GitHub Repos Worth Watching in 2026 So Far” (2026-06-26) plus the linked repositories.

JARVIS uses these projects as capability references, not as blindly vendored dependencies.

| Project | What JARVIS takes from it | v1.3 integration |
|---|---|---|
| affaan-m/ECC | Explicit agent harness: skills, rules, hooks, memory, security, research discipline | Native pattern |
| NousResearch/hermes-agent | Assistant across terminal + messaging contexts, memory and tools | Native pattern; Telegram already live |
| firecrawl/firecrawl | Reliable live-web grounding and structured extraction | Optional adapter concept; Reach remains fallback |
| google-gemini/gemini-cli | Terminal-native reason/action workflow and MCP | External route/reference; no hard dependency |
| browser-use/browser-use | Browser state/action agent loop | Optional adapter; BrowserSkill / Reach remain primary |
| daytonaio/daytona | Isolated execution for generated code | Sandbox pattern; Docker/runtime probing, no unrestricted model shell |
| bytedance/deer-flow | Long-horizon sub-agents, memory, sandbox, recovery | Native pattern through Council + Factory checkpoints |
| openai/openai-agents-python | Handoffs, guardrails, sessions, tracing | Native guardrails + local trace layer |
| ashishpatel26/500-AI-Agents-Projects | Cross-industry use-case discovery | Reference catalog only; linked repos require independent review |

## Design rule

A GitHub star count or inclusion in an article is not evidence that a dependency should be installed. JARVIS separates:

- pattern adoption,
- optional adapters,
- reference-only catalogs,
- code vendoring.

Any future vendoring requires a separate license/security/dependency review.
