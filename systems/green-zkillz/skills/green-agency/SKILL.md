---
name: green-agency
description: Run the Adaptive Multi-Agent Skill Pipeline from brianreborn/green-agency. Triggers include green-agency, green agency pipeline, run green-probe through green-deploy, modernize agents baseline skills, or any request to execute the green agency REQUIREMENTS pipeline.
metadata:
  type: workflow
  version: "1.0"
  source: brianreborn/green-agency
---

# Green Agency Pipeline

Execute the five-skill pipeline defined in https://github.com/brianreborn/green-agency/REQUIREMENTS.md. Do not invent extra ceremony.

Pipeline order is fixed:

1. `green-probe` — host tier, privileges, identity posture, compressed status array
2. `green-bootstrap` — Makefile / env synthesis, CI posture, parameter strictness, compiler proxy
3. `green-ingest` — recursive index on enhanced hosts, turn-by-turn ingest on degraded hosts, syntax check
4. `green-format` — STYLE_GUIDE normalization, `MANUSCRIPT.json` chapter map, non-destructive make
5. `green-deploy` — X dispatch on SuperGrok, git push on Antigravity/GitHub, flat `MANUSCRIPT.md` fallback

## Style (STYLE_GUIDE)

- High-density technical prose. Treat user text like CLI arguments.
- Terse Markdown. No conversational padding.
- Native syntaxes only unless the user forces otherwise — POSIX shell, C/C++, Rust, Python, Markdown, JSON, Makefiles.
- Do not pull unverified codecs or bulky third-party packages.

## System contracts

Read `references/sys-requirements.md` and obey REQ-SYS-01 through REQ-SYS-06 on every step.

Workspace root defaults to the current project directory. In this engine the writable work root is `/home/workdir/artifacts` unless the user names another tree. Set `GREEN_WORKSPACE` to that root before running scripts.

Shared scripts (run from this skill directory):

- `scripts/safe-write.sh TARGET [SRC]` — permission check + `.bak` + audit line
- `scripts/output-proxy.sh` — collapse raw logs before they reach the model

## Host degradation

| `host_tier` | Behavior |
|---|---|
| `SUPERGROK_ENGINE` | Full pipeline. File writes, GitHub tools, X tools allowed. |
| `AGY_SANDBOX` | File writes and local scripts. No interactive pauses if `CI` is set. GitHub only via connected tools. |
| `STATELESS_CHAT` | No writes. Skip cache/backup. Prompt the user for each artifact. Deploy flattens to a chat-only `MANUSCRIPT.md` body. |

## Execution

1. Load `green-probe` instructions and run `green-probe/scripts/probe.sh`. Keep only the `STATUS` line plus cache path.
2. If `writable=false`, degrade subsequent skills (no `.bak`, no cache writes, no Makefile mutation).
3. Run bootstrap only after a live or cached PASS on REQ-SK00-01.
4. Ingest only paths the user named or the workspace root just probed.
5. Format against `MANUSCRIPT.json` when it exists; otherwise create one from `green-format/assets/MANUSCRIPT.schema.json` via `safe-write.sh`.
6. Deploy only with explicit user intent to publish (X post, git push, or flat-file export).

## Output

Emit a four-line pipeline receipt, nothing else unless a skill produced artifacts:

```
PIPELINE probe=<PASS|FAIL> bootstrap=<...> ingest=<...> format=<...> deploy=<...>
HOST tier=... fs=... identity=...
ARTIFACTS <paths or NONE>
ERRORS <tokens or NONE>
```

## GDICT (control-plane codebook)

Do not compress human prose or comments. Intern STATUS enums, compiler diagnostics, and path stems only.

- Static tables (provider `gdict-static`): `assets/gdict-1.0.0.txt`, `assets/gdict-errors-1.0.0.txt`. Index: `assets/CODEBOOKS.md`. Set `GDICT_STATIC` to `assets/` if unset.
- Session/user LRU + counting Bloom: `scripts/gdict-lru.sh` (`put|hit|get|evict|list|stats|session-end|promote`)
- Runtime: `$GREEN_WORKSPACE/.runtime/gdict-session.json`, `gdict-user.json`, `gdict-stats.log`
- Caps: `GDICT_SESSION_CAP` / `GDICT_USER_CAP` (default 512). Bloom: `GDICT_BLOOM_M=8192`, `GDICT_BLOOM_K=4`.
- Hash-like strings are refused. LRU evicts oldest `last_ts` and decrements Bloom counters.
- Usage ledger: `scripts/gdict-lru.sh usage|record|usage-config` — per prompt/response pre/post tokens, per-provider rollup. Default window last 3600s OR last 100 messages. Ask before changing window config. See `references/REQUIREMENTS-CODEC.md`. Sliding buckets and OpenMetrics: `.runtime/gdict-usage.prom`.
