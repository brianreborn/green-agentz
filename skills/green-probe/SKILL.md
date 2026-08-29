---
name: green-probe
description: Introspect host tier, file-descriptor privileges, and identity posture for the green-agency pipeline. Triggers include green-probe, probe the sandbox, host tier attestation, environment introspection, SuperGrok vs AGY sandbox check, or short-circuit probe cache refresh.
metadata:
  type: workflow
  version: "1.0"
---

# Green Probe

Run before any other green-agency skill.

Encode the `STATUS` line with `gdict-static` from `../green-agency/assets/gdict-1.0.0.txt` (do not dump probe JSON into context). Record usage via `../green-agency/scripts/gdict-lru.sh record` when token counts are known.

## Procedure

1. Set `GREEN_WORKSPACE` to the active project root (`/home/workdir/artifacts` in this engine unless the user names another tree).
2. If `.runtime/probe_cache.json` exists, parse it. If `short_circuit_tokens.REQ-SK00-01.status` is `PASS` and `ttl_expiry` is in the future, print the cached `STATUS` line and stop (REQ-SYS-04).
3. Otherwise execute `scripts/probe.sh`. Do not paste its JSON into the model context — keep the one-line `STATUS` array plus `DEPS` and `DEFAULTS`.
4. Classify identity posture from live evidence only:
   - Connected GitHub/X OAuth or tokens present → `API_OAUTH_TOKEN`
   - SuperGrok/Antigravity tool surface without raw secrets → `SYSTEM_PROMPT_ENFORCED`
   - No routing possible → `NONE`
   - Never claim `CRYPTOGRAPHIC_ENCLAVE` unless a real enclave attestation is in hand
5. `asserted_blindness` is `true` only when the session is stateless chat with no memory and no connected-account tools.
6. Enforce intelligent defaults (REQ-SK00-04). Do not auto-install unsigned codecs, npm trees, or bulky SDKs. Record any requested third-party package under `verified_dependencies` only after origin and signature status are known. Default `signature_verified` to `false`.

## Host tiers

Detect in this order, first match wins:

- Writable `/home/workdir` plus Grok connected tools → `SUPERGROK_ENGINE`
- Isolated Linux with project-local writes (`CI`, `GITHUB_ACTIONS`, or a writable workspace) → `AGY_SANDBOX`
- No filesystem write → `STATELESS_CHAT`

## Cache

Schema is `references/cache-schema.json` (REQ-SYS-05). `global_state_hash` is a SHA-256 (or SHAKE256 if available) hex digest of the attestation blob. Do not fabricate ML-DSA keys.

Append one audit line to `.runtime/audit.log` on every live probe (REQ-SYS-01).

## Output

One status array the rest of the pipeline can consume:

```
STATUS host_tier=... fs=... net=... sandbox=... identity=... writable=... hash=... cache=...
```
