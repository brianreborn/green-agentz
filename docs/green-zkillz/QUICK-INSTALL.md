# Quick install and try-out — green-zkillz

Easiest reliable install is a clone plus one Python command. Do not unzip
into a green-roomz tree and do not copy skills around.

```powershell
git clone https://github.com/brianreborn/green-agentz.git
cd green-agentz
python scripts/green-zkillz/install-skills.py
```

That merges this clone's `skills/` into Grok `[skills].paths`. It does not
copy files. On qodesh this is already:

```text
[skills]
paths = ["C:/Users/brian/Documents/green-agentz/skills"]
```

A new Grok session (any cwd) then sees `green-zkillz`, `green-probe`, and
the rest. Unix/macOS is the same three commands (`python3` is fine).

## Needs

- Git
- Python 3.10+ (no pip packages)
- Node 22+ only if you run Brainz or `eval/quality` tests
- Skill **markdown** works in Grok immediately
- Skill **scripts** (`probe.sh`, GDICT, and the rest) want Git Bash on
  Windows ([#10](https://github.com/brianreborn/green-agentz/issues/10)).
  Do not port the pipeline to PowerShell unless Git Bash cannot run
  probe/bootstrap. WSL is optional, not required.

`install-skills.py` prints:

```text
GREEN_BRAINZ_ROOT=.../systems/green-brainz
GREEN_WORKSPACE=.../green-agentz
GDICT_STATIC=.../skills/green-zkillz/assets
```

Set those in the shell if you will run skill scripts. They are not required
for Grok to load `SKILL.md`.

This is **operator** install. It is not a live Roomz `:8080` with MFL or
IRQ. Roomz stays its own checkout (`brianreborn/green-roomz`). Do not
vendor Brainz or skills into Roomz.

## Example prompts

Paste into Grok after install. Substitute the clone path if it is not
qodesh.

1. **Probe only**
   `Run green-probe on C:\Users\brian\Documents\green-agentz. Keep the STATUS line; do not dump probe JSON.`

2. **Full pipeline, no publish**
   `Run green-zkillz on this repo. Stop before deploy. Do not push or post to X.`

3. **Ingest + format a named tree**
   `green-ingest then green-format for systems/green-brainz/memory only. Do not deploy.`

4. **Quality eval (local, no cloud)**
   `From the green-agentz repo, run: node --test eval/quality/quality.test.mjs and summarize pass/skip.`

5. **MFL / stutter (in-process, not live gateway)**
   `Show how fr-fr-freezer would treat five identical tool calls, and what nap vs fridge vs freezer vs seizure does to a goal-tagged memory.`

If a Roomz gateway is already up on `127.0.0.1:8080` (separate from the
skill install):

6. `Write a Python function named hello that returns 42.` — expect code
   specialist routing.
7. `draw a small red circle` — expect image-generation intent, not a fake
   PNG from a text model.
8. `/vision` with no image — expect 400, not a hallucinated caption.

Live Roomz vs raw-llama vs Grok is opt-in:

```powershell
cd C:\Users\brian\Documents\green-agentz
$env:EVAL_LIVE=1
# optional: $env:EVAL_CLOUD=1; $env:XAI_API_KEY="..."
node eval/quality/runner.mjs --json eval/quality/results/latest.json
```

## Smoke (Git Bash)

```bash
export GREEN_WORKSPACE=/tmp/green-smoke
mkdir -p "$GREEN_WORKSPACE"
skills/green-probe/scripts/probe.sh
skills/green-zkillz/scripts/gdict-lru.sh usage compress
```

Do not commit `.runtime/`. Details:
[skills/green-zkillz/references/INSTALL.md](../../skills/green-zkillz/references/INSTALL.md).

Optional pack zip (not required to try skills):
`python scripts/green-zkillz/archive.py`.

How Grok auto-compact should treat these skills:
[session compaction](../architecture/session-compaction.md).
