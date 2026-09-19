# JARVIS v0.7 — DEVICE MESH Architecture

## Design objective

v0.7 turns the desktop JARVIS process into the policy hub of a distributed personal system without granting universal device authority. Each integration is an adapter behind a capability boundary.

## Runtime layers

```text
UI / Voice
   |
Agent API
   |
   +-- Built-in commands
   +-- Tool planner
   +-- Cognitive Council / single-model answer path
   |
Tool Registry
   |
   +-- Existing safe workspace/API tools
   |
   +-- Device Mesh tools -------------------------------+
   |                                                   |
   +-- BrowserSkill adapter                            |
                                                       |
Approval Gateway + Permission Broker                   |
   |                                                   |
   |                                  +----------------v----------------+
   |                                  | Device Mesh Core                |
   |                                  | pair/auth/heartbeat/queue       |
   |                                  +----------------+----------------+
   |                                                   |
   |                                      authenticated commands/results
   |                                                   |
   |                                  +----------------v----------------+
   |                                  | Android Companion               |
   |                                  | foreground mesh service         |
   |                                  +-------------+-------------------+
   |                                                |
   |                         +----------------------+------------------+
   |                         |                                         |
   |                 Health Connect                              Meta DAT SDK
   |                         |                                         |
   |                 phone/watch data                           Meta glasses
   |                         |
   |                 encrypted ingest
   |                         |
   +-----------------> Health Vault
```

## Authority model

Every cross-device operation can cross several independent gates:

1. **Tool risk / Approval Gateway** — is this an action that requires explicit user approval?
2. **Permission Broker** — does this principal/device currently hold the exact capability?
3. **Device authentication** — does the Android request carry a valid per-device bearer token?
4. **Android OS permissions** — has Android/Health Connect allowed the local sensor/data access?
5. **Provider-specific confirmation** — BrowserSkill/Meta platform confirmations remain in force.

Advertising a capability during pairing never grants it. The advertised list describes what a device can technically support; the Permission Broker describes what it may currently do.

## Device Mesh Core

Persistent state: `data/device-mesh.json`.

- Pairing tickets use a random pairing ID plus a six-digit code.
- The code is stored as an HMAC, expires quickly, and is invalidated after repeated failures.
- Successful pairing returns a random bearer token to the device once.
- JARVIS stores only the token hash.
- Heartbeats update liveness/capability metadata.
- Commands progress through `queued -> claimed -> completed|failed`.
- Revoking a device invalidates its token and removes broker grants.

The mesh signing/verification secret is read from `JARVIS_DEVICE_MESH_SECRET` or generated into the ignored local file `data/.device-mesh.key`.

## Permission Broker

Persistent state: `data/device-permissions.json`.

Capabilities are exact strings, for example:

```text
mesh.heartbeat
device.notifications.push
device.vibrate
health.heart_rate.read
health.blood_pressure.read
health.oxygen_saturation.read
health.steps.read
health.sleep.read
meta.camera.capture
meta.camera.stream
meta.display.render
browser.observe
browser.navigate
browser.interact
browser.borrow_user_tab
```

Grants can expire. Requests are recorded separately from grants, so a newly paired device cannot self-authorize by asking for more capabilities.

## Health Vault

Persistent encrypted state: `data/health-vault.jsonl`.

Each Health sample is encrypted independently with AES-256-GCM. The 256-bit key is supplied by `JARVIS_HEALTH_VAULT_KEY`; it is not written into project state by the vault.

The envelope stores only the cryptographic material needed to decrypt plus a non-reversible fingerprint used for deduplication. Health queries return `sensitivity: health`, causing the agent/approval routes to return the data directly rather than forwarding it to Council models or learning stores.

The Health Vault is intentionally separate from:

- `data/memory.json`;
- `data/learning.json`;
- `data/cognitive-memory.json`;
- `data/model-performance.json`.

## Android Companion

`android-companion/` is a native Kotlin project targeting Android SDK 36.

### Foreground Device Mesh service

When explicitly started, a visible foreground service:

- sends heartbeats;
- polls for commands;
- dispatches them to local device/Meta adapters;
- returns bounded JSON results.

The foreground notification is part of the authority/visibility model, not cosmetic UI.

### Health Bridge

The Health Bridge uses Android Health Connect. Manual sync reads the selected recent records and submits them to the desktop Health Vault. WorkManager provides periodic background sync only when the user grants the background-read permission.

Watch data reaches JARVIS when the watch/vendor writes compatible records into Health Connect. v0.7 therefore treats Android as the gateway rather than assuming a proprietary direct watch protocol.

### Meta Wearables bridge

The companion initializes Meta Wearables DAT and owns the device session. Commands received over Device Mesh are translated to DAT camera/display actions. Photo bytes remain local in v0.7; desktop command results contain metadata only.

## BrowserSkill adapter

BrowserSkill runs locally on the desktop and is represented as the principal `local:browser-skill` in the Permission Broker.

The adapter supports:

- status;
- session start/stop;
- navigation to HTTP/HTTPS URLs;
- semantic observation;
- click/fill by fresh element reference;
- user-tab listing, borrowing and returning.

JARVIS authorization and BrowserSkill authorization are separate. Granting `browser.borrow_user_tab` in JARVIS does not suppress BrowserSkill's own confirmation UI.

## Sensitive context boundary

The agent API detects explicit Health/Device Mesh/BrowserSkill flows and avoids retrieving or learning general memories for those turns. Tool results marked `private` or `health` are returned directly rather than placed in model prompts.

This is a strong default boundary, not a substitute for production data-loss-prevention. Future v1.0 hardening should move sensitive-context classification to structured intent metadata rather than relying partly on input classification.

## Council remains unchanged

v0.6 Cognitive Council still handles ordinary reasoning:

1. independent answers;
2. anonymous cross-examination;
3. evidence-first arbitration;
4. cognitive/performance memory and explicit feedback.

Council intelligence never implicitly grants Device Mesh capabilities.

## v0.9 Research & Trading Intelligence

```text
Knowledge Fabric / Domain Sources
            |
      Research Hypothesis
            |
      Strategy / Experiment
            |
  OOS + Walk-Forward + Bootstrap
       |                 |
   REJECTED          VALIDATED
                         |
                    Paper Permit
                         |
                    Live Permit
                         |
                   MT5 Risk Gate
                         |
                     order_check
                         |
                     order_send

Telegram ---> secret + chat allowlist ---> command layer ---> same Trading Permit / Risk Gate
```

The trading permit is delegated authority with an explicit expiry. A live order cannot bypass the permit, symbol/volume allowlists, explicit stop-loss, per-trade equity risk check, or daily realized-loss kill switch.

## v1.3 Autonomous Research Factory

`research/factory.ts` persists a resumable queue and interleaves regime analysis, bounded experiment matrices, Strategy Genome evolution, and Champion/Challenger aggregation. `research/genome.ts` supports cross-family `hybrid-vote` strategies. `tracing.ts` records local tool execution events for observability. `agentic-stack.ts` records reviewed external agent infrastructure patterns without introducing hard dependencies.
