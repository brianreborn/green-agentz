---
name: green-bootstrap
description: Synthesize Makefile and runtime env files from a green-probe status array, enforce CI non-interactive logs, and proxy compiler output. Triggers include green-bootstrap, bootstrap the workspace, synthesize Makefile from probe, CI detection for green-agency, or compiler-output filter.
metadata:
  type: workflow
  version: "1.0"
---

# Green Bootstrap

Requires a `STATUS` line from `green-probe`. If missing, run probe first.

Route compiler/Make tails through `scripts/compiler-proxy.sh`, then intern exact diagnostics against `../green-agency/assets/gdict-errors-1.0.0.txt` (`gdict-static`) before anything reaches the model.

## REQ-SK01-01 — Configuration synthesis

Write only files justified by the probe:

- `Makefile` — `probe`, `index`, `syntax`, `format`, `manuscript`, `check` targets that call the green-agency scripts. Do not add package managers or container pulls.
- `.env.green` — `GREEN_WORKSPACE`, `GREEN_HOST_TIER`, `GREEN_FS`, `GREEN_IDENTITY`. Never store secrets.
- Use `green-agency/scripts/safe-write.sh` so existing files get a `.bak`.

Match bounds from the status array. If `fs=NONE` or `writable=false`, do not write files; print the proposed Makefile in chat instead.

## REQ-SK01-02 — CI detection

Run `scripts/detect-ci.sh`. If `CI=true`:

- No interactive pauses, confirmations, or `read` loops
- Diagnostics go to stderr (the scripts already do this)
- Treat the session as non-TTY

## REQ-SK01-03 — Style flags

Inject `check` into the Makefile:

```
check:
	find . -name '*.sh' -print0 | xargs -0 -r bash -n
	find . -name '*.py' -print0 | xargs -0 -r python3 -m py_compile
```

Do not add formatters the host does not already have.

## REQ-SK01-04 — Parameter strictness

If a requested capability needs a value the user and local config both lack (deploy credentials, remote owner/repo, X post body, API keys), halt with:

```
ERROR_TOKEN: MISSING_PARAM NAME
```

Do not invent credentials. Connected GitHub/X tools count as present credentials for those channels.

## REQ-SK01-05 — Compiler proxy

On any compile or iterative fix loop:

1. Capture the raw log to a temp file (not into the model context).
2. Run `scripts/compiler-proxy.sh LOGFILE`.
3. Feed the JSON matrix to the model, never the raw tail.
4. If the proxy returns `ERROR_MUTATION_FAILED`, stop the loop and report the token. Do not retry the same patch.

## Output

```
BOOTSTRAP makefile=<path|SKIP> env=<path|SKIP> ci=<true|false> missing=<NONE|tokens>
```
