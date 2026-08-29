---
name: green-deploy
description: Publish green-zkillz artifacts on X, Git, or flatten chapters into MANUSCRIPT.md when the host is degraded. Triggers include green-deploy, publish to X, push manuscript to GitHub, or flat-file manuscript export.
metadata:
  type: workflow
  version: "1.1"
---

# Green Deploy

Do not publish without an explicit user request naming the channel (X, git/GitHub, or flat-file).

Do not commit `$GREEN_WORKSPACE/.runtime/gdict-session.json` or usage JSONL. Ship only `../green-agency/assets/` static codebooks.

## REQ-SK04-01 — X dispatch

Handle = `$GREEN_X_HANDLE` or `.runtime/site.json` `x_handle`. If empty, ask. Never invent a default handle.
Use whatever post tools the host exposes. If none, `ERROR_TOKEN: MISSING_PARAM X_POST_TOOL` and hand the user the text.

## REQ-SK04-02 — Version-control push

Owner/repo = `$GREEN_GIT_OWNER` / `$GREEN_GIT_REPO` or site.json. If empty, ask.
Push with the host Git write API. See `../green-zkillz/HOST-BINDINGS.md`.
Do not commit `.runtime/`, `*.bak`, or credentials.

## REQ-SK04-03 — Flat-file fallback

`bash scripts/flatten-manuscript.sh MANUSCRIPT.json MANUSCRIPT.md`

## Output

```
DEPLOY channel=<x|git|flat|NONE> result=<OK|FAIL|SKIP> ref=<url|path|NONE>
```
