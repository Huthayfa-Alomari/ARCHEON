# ARCHEON v1.5 — Autonomous Cognition

ARCHEON v1.5 adds bounded proactive cognition on top of v1.4 Mission Control.

## New cognition layers

- **Authority Governor** — autonomy is explicit, disabled by default, and bounded by levels 0–4.
- **Belief Graph** — statements carry confidence plus supporting/opposing evidence refs and contested/rejected states.
- **Inner Thought Queue** — questions, hypotheses, reflections, goals, research ideas, and maintenance tasks are prioritized by importance, urgency, expected value, confidence, estimated cost, and risk.
- **Curiosity Engine** — creates questions from uncertain/contested beliefs and claims.
- **Reflection Engine** — turns failed research jobs and failure memories into follow-up work.
- **Goal Generator** — detects blocked missions and creates unblocking goals.
- **Idle/Night Cycle** — performs reflection and memory-maintenance scans during configured idle cycles.
- **Cognition Worker** — optional local worker that runs periodic bounded cycles while ARCHEON is running/configured.

## Autonomy levels

- **0 — Reactive only:** no autonomous cycle work.
- **1 — Reflective:** reflection and maintenance only.
- **2 — Proactive planning:** adds curiosity and goal generation.
- **3 — Autonomous research:** may queue bounded low-risk research work.
- **4 — Pre-authorized operations:** reserved for bounded low-risk operations; it still cannot bypass Approval Gateway, Lockdown, device permissions, live-trading gates, secret isolation, or self-merge controls.

## Immutable authority boundaries

Autonomous cognition never grants itself:
- approval-gated tool authority,
- live trading authority,
- permission grants,
- secret access,
- production writes,
- autonomous medical treatment,
- autonomous self-merge.

## Commands

```text
/cognition
/autonomy on 3
/autonomy off
/thoughts
/beliefs
/think
/night
/command
/security
/lockdown
```

Enabling autonomy is approval-gated.

## Worker

After ARCHEON is configured:

```powershell
npm run cognition:worker
```

The worker reads `.env.local`, wakes at the configured interval, checks Authority Governor and Lockdown, and runs one bounded cognition cycle.

Environment:

```env
JARVIS_COGNITION_INTERVAL_SECONDS=300
JARVIS_COGNITION_IDLE_EVERY=12
```

The interval is clamped to at least 60 seconds.

## Important scope

This is operational autonomy, not consciousness. ARCHEON can proactively inspect its internal state, generate questions/goals, review failures, reprioritize work, and initiate bounded research within configured authority. External high-impact actions remain separately governed.
