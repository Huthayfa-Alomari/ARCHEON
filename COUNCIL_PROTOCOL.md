# Council Protocol

## Goal

Use model diversity to find contradictions and improve answer robustness without confusing consensus with truth.

## Modes

| Mode | Behavior |
|---|---|
| `off` | single adaptive model |
| `auto` | council on questions likely to benefit from comparison/reasoning |
| `always` | normal questions use council whenever at least the minimum number of models are configured |
| `manual` | council only when the user starts with `/council ask ...` |

## All-model behavior

`JARVIS_COUNCIL_MAX_MODELS=0` means all currently configured routes allowed by `JARVIS_MODEL_ROUTING`.

Examples:

- routing=`china` -> only configured Chinese-origin routes join;
- routing=`free` -> only free/local routes join;
- routing=`local` -> only Ollama routes join;
- routing=`auto`, max=0 -> every configured eligible route joins.

## Failure tolerance

Council does not require every model to answer. A provider may time out, hit quota or return an error. Successful members continue as long as `JARVIS_COUNCIL_MIN_MODELS` can be satisfied at selection time and at least one answer ultimately succeeds.

## Confidence vs consensus

- **Consensus**: how much the peer-review process converged.
- **Confidence**: arbiter assessment after considering evidence and disagreement.
- Neither number proves factual correctness.

For time-sensitive or externally verifiable facts, JARVIS should collect fresh tool/API/web evidence before arbitration.

## Cost control

All-model councils can multiply token usage by the number of models plus the critique round. To reduce spend:

```env
JARVIS_COUNCIL_MAX_MODELS=4
JARVIS_COUNCIL_CRITIQUE_ROUND=true
```

or use `auto` instead of `always`.
