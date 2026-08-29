# Host bindings — keep skills generic

Skills must run on a model that has never seen this repo.

## Never hard-code in SKILL.md

| Kind | Example that leaked | Rule |
|------|---------------------|------|
| GitHub owner/repo | author/repo | `$GREEN_GIT_OWNER` / `$GREEN_GIT_REPO` or ask |
| X handle | any @handle | `$GREEN_X_HANDLE` or ask |
| Product host | vendor chat brand | Use `host_tier` enums only |
| Work root | vendor sandbox path | `$GREEN_WORKSPACE` only |
| Tool RPC names | host-specific function ids | “connected Git write tool” |
| Model names | any LLM product | Do not mention |

## Resolve order

1. Env: `GREEN_WORKSPACE`, `GREEN_GIT_OWNER`, `GREEN_GIT_REPO`, `GREEN_X_HANDLE`, `GDICT_STATIC`
2. `$GREEN_WORKSPACE/.runtime/site.json` (see `SITE.example.json`)
3. Ask once; do not invent an account

`green-agency` in paths is a folder name for scripts/assets.
