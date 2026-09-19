# Security Notes — JARVIS v0.8 KNOWLEDGE FABRIC + DEVICE MESH

JARVIS keeps **intelligence**, **identity**, **data**, and **authority** as separate boundaries.

## Existing controls retained

- workspace sandbox/path-traversal blocking;
- secret-file blocking by default;
- no unrestricted shell tool;
- approval-gated writes/project checks;
- diff preview, stale-hash validation and patch backups;
- GET-only reusable API skills;
- safe external fetch / SSRF defenses;
- audit log;
- Cognitive Council secret redaction and evidence-first arbitration.

## Device pairing

Pairing is intentionally not a permanent shared PIN.

- Codes are six digits and short lived.
- The pairing code is persisted only as an HMAC.
- Repeated invalid attempts invalidate the ticket.
- A successful pairing returns a high-entropy device token once.
- The desktop stores only the token hash.
- Device revocation invalidates future requests and removes its Permission Broker grants.

Pair only while both PC and phone are on a trusted network and you control both screens.

## Capability least privilege

A device can **advertise** support for capabilities during pairing, but advertisement does not authorize them. Except for minimal mesh heartbeat, capabilities are granted separately by the owner.

Prefer short-lived grants for critical functions such as camera and existing-user-tab borrowing. Remove grants when not needed.

## Health data

Health data has a separate storage and model boundary.

- `JARVIS_HEALTH_VAULT_KEY` must decode to exactly 32 bytes.
- Samples are encrypted independently using AES-256-GCM.
- Health tool results are marked `health` and bypass Council/model-learning paths.
- Raw values are not written to general JARVIS memories by the Health Vault.
- Do not commit `.env.local`, `data/.device-mesh.key`, `data/health-vault.jsonl`, device state, or permission state.

The Health Vault protects data **at rest inside its file**. It does not by itself provide full-disk encryption, endpoint malware protection, or encrypted LAN transport.

## LAN transport warning

The Android development manifest currently permits cleartext HTTP so a physical phone can reach a development PC on a LAN. This is **development-only**.

Do not:

- port-forward JARVIS from your router;
- bind it to a public/cloud interface without adding production authentication/TLS;
- use an untrusted/public Wi-Fi network for Health/device traffic.

Before public/remote deployment, use TLS, an authenticated reverse proxy or private overlay network, CSRF protections, rate limits, replay protection, and stronger device attestation/mutual authentication.

## Android foreground operation

Live Device Mesh runs as an explicit foreground service with a visible notification. This makes ongoing command authority observable and lets the user stop it directly.

Health background reads require a separate Android Health Connect permission. Without it, v0.7 should use manual/in-app synchronization instead of bypassing platform restrictions.

## BrowserSkill

JARVIS adds its own broker grants on top of BrowserSkill rather than replacing BrowserSkill's safety controls.

- Existing user tabs follow `list -> borrow -> return`.
- BrowserSkill's confirmation behavior remains authoritative.
- The JARVIS adapter does not request or extract cookies, stored credentials, bearer tokens, or browser secrets.
- `browser.interact` and `browser.borrow_user_tab` should be treated as high/critical authority.

## Meta Wearables

Camera/display operations are capability gated and pass through the Android companion. In v0.7, still-photo bytes remain in app-private Android storage; the command-result endpoint receives metadata only. This avoids casually turning the desktop API into a raw camera-media exfiltration path.

Meta Developer Mode credentials `0/0` are for local development only. Production registration requires real developer credentials and the platform's current policies.

## Council / multiple cloud providers

Council Mode may fan ordinary prompts to multiple configured providers. Health/tool results marked sensitive are excluded from that path, but ordinary prompts can still contain user-entered confidential material. Use local model routing for confidential non-health content that must not leave the machine.

## Known hardening gaps

v0.7 is a development system, not a hardened remote-access product. In particular:

- polling is used instead of mutually authenticated event transport;
- no hardware-backed device attestation is yet required;
- the development LAN path can be cleartext;
- full Next.js auth/multi-user security is not implemented;
- sensitive-input isolation still contains a keyword/intent classification layer;
- Android Companion has been statically assembled here but must be compiled/tested against the actual Android SDK and physical devices before production use.

## Knowledge Fabric / dataset safety

Knowledge Fabric introduces a new poisoning/licensing boundary:

- external dataset/book text is treated as **untrusted data**, never as system instructions;
- persistent chunks keep provenance, license labels and trust scores;
- duplicate chunks are fingerprinted;
- Kaggle/Hugging Face access tokens stay in `.env.local` and are not persisted into the Knowledge Store;
- gated/private dataset access must already be authorized by the user;
- bulk unknown-license ingestion is not automatic;
- Project Gutenberg status is recorded as stated by the source and should not be interpreted as universal copyright clearance;
- local book ingestion assumes the user owns or is authorized to process that copy;
- Health Vault records remain excluded from Knowledge Fabric.

RAG can still surface incorrect or adversarial source material. JARVIS should prefer current primary/official data for changing facts and use multiple sources before promoting high-impact claims.
