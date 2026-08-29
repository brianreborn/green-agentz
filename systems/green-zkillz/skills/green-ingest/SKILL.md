---
name: green-ingest
description: Index a workspace tree or collect prose and code turn-by-turn, then run lightweight native syntax checks before assembly. Triggers include green-ingest, ingest the workspace, recursive directory index, interactive text ingestion, or syntax-validate sources for green-agency.
metadata:
  type: workflow
  version: "1.0"
---

# Green Ingest

Choose the path from the latest probe `host_tier` / `fs` values.

Do not dump recursive `find` listings into context. Index lines go through REQ-SYS-06 / GDICT (`../green-agency/assets/`). Prose and comments stay uncompressed.

## REQ-SK02-01 — Enhanced host (recursive index)

When `fs` is `READ_ONLY` or `READ_WRITE`:

1. Confirm the root is readable (REQ-SYS-02). Honor a live `REQ-SYS-02` cache token.
2. Run `scripts/index-tree.sh ROOT --max 400`.
3. Keep the `tree_root` summary plus the listing. If `truncated=true`, say so and do not re-run `find` with a higher cap unless the user asks.
4. Skip `.git`, `node_modules`, `.venv`, `target`, `dist`, `build`, `.runtime`, `__pycache__`.

## REQ-SK02-02 — Degraded host (interactive ingest)

When `host_tier=STATELESS_CHAT` or `fs=NONE`:

- Ask for one artifact per turn (path label + body).
- Record accepted items in the conversation state (REQ-SYS-01). Do not invent a second copy of the skill file as storage.
- Stop when the user says the set is complete.

## REQ-SK02-03 — Syntax validation

For each ingested file or pasted body written to a temp path, run `scripts/syntax-check.sh FILE`.

Accept `OK` and `SKIP`. Reject `FAIL` — do not assemble a failing unit into `MANUSCRIPT.json` until the user overrides.

Native checkers only (`bash -n`, `python3 -m py_compile`, `json.load`, `cc -fsyntax-only`, `rustc --emit=metadata` when present). No new linter packages.

## Output

```
INGEST mode=<tree|interactive> files=N pass=N fail=N skip=N
```

List failing paths as `ERROR_TOKEN: SYNTAX_FAIL path`.
