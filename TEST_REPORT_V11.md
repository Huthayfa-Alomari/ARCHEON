# JARVIS v1.1 Test Report

Date: 2026-09-19

## Scope
Reach Capability Layer added after reviewing Panniantong/Agent-Reach v1.5.0 architecture and docs.

## Added
- Ordered backend channel registry covering the 16 Agent-Reach platform categories.
- Native Reach doctor/probes.
- Optional upstream `agent-reach doctor --json` adapter.
- URL routing.
- Web reading with Jina Reader -> native safe-fetch fallback.
- Exa/mcporter semantic search.
- GitHub `gh` repository search.
- YouTube subtitle extraction via yt-dlp.
- RSS/Atom bounded reader.
- Read-only social search adapters.
- LinkedIn/Boss career routing.
- Approval-gated Agent-Reach install/update path.
- Credential/login boundary: JARVIS does not extract browser cookies or automate login.

## Validation
- `tsc --noEmit` was invoked.
- Full project typecheck cannot complete in this packaged environment because Next.js/React/@types/node dependencies are not installed.
- Filtering the compiler output for the newly added `src/lib/jarvis/reach/*` files showed no Reach-specific type errors other than the same missing Node type declarations caused by absent dependencies.
- No claim is made that a full Next.js production build succeeded.

## Runtime dependencies for optional channels
Actual channel availability is intentionally detected at runtime by `reach.doctor`. Optional upstream CLIs include `agent-reach`, `mcporter`, `gh`, `yt-dlp`, `twitter`, `opencli`, `rdt`, `bili`, and `boss`.

## Security
- HTTPS-only public fetch path.
- Existing SSRF/private-network blocking remains in `safe-net.ts`.
- No generic shell tool was added.
- External commands are fixed allow-listed templates.
- System installation is approval-gated.
- No automatic browser-cookie extraction or login automation is added.
