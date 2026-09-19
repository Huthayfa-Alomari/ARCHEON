# JARVIS v1.1 — Reach Capability Layer

Inspired by the architecture of MIT-licensed `Panniantong/Agent-Reach` (reviewed 2026-09-19), JARVIS now treats internet access as a capability layer rather than one fixed scraper/API.

## Design

Each channel has an ordered backend list. JARVIS probes executable backends, selects the first healthy option, exposes a doctor report, and leaves high-risk installation/system mutation behind explicit approval.

Channels: web, semantic search, GitHub, YouTube, RSS, Twitter/X, Reddit, Facebook, Instagram, XiaoHongShu, Bilibili, LinkedIn, V2EX, Xueqiu and podcast/transcription.

Native JARVIS tools added:
- `reach.doctor`
- `reach.agentReach.doctor`
- `reach.web.read`
- `reach.search.exa`
- `reach.github.search`
- `reach.rss.read`
- `reach.youtube.transcript`
- `reach.social.search`
- `reach.install` (approval required)

## Security differences

JARVIS does not automatically extract browser cookies, automate logins, or copy credential stores. Login-backed channels may reuse an already-authorized local backend/session, but credentials remain outside LLM prompts and tool output. Installation of external/system packages remains approval-gated.

## Attribution

Architectural patterns and channel-selection research were derived from Agent-Reach by Panniantong, licensed under MIT. JARVIS implements its own TypeScript capability router rather than vendoring the upstream Python source.
