# Session auto-compaction with Green skills in place

Status: expected composition. **Current host behavior is not that
composition.** Grok already auto-compacts this session. Green-Zkillz,
Green-Brainz, and Green-Roomz do not intercept it.

This is Agentz documentation. Do not copy it into `green-roomz`.

## 0. Current assurances (dream vs fugue)

Two different recoveries, only one of which is wired to this Grok
session.

| | **Dream state** (required) | **Fugue state** (system compact) |
|---|---|---|
| Trigger | MFL working set full, or first stutter | Grok context % hits auto-compact threshold |
| What happens to admitted items | **Stay in attention.** New admits are refused (`nap`, `fugue_prevented`). | **Evicted from the model working set.** Turns become a recap + segment files. |
| Idle work | Host `tryPromote()` on drive `epigenetic-optimization` (`green-dreamz`) | None. Grok runs a summarizer. Skills are not consulted. |
| Durable store | Dreamcatcher impress (integration). Git/GitHub if the host writes. | `updates.jsonl`, `compaction/segment_*.md`. Not cognitive memory. |
| Who implements it today | `MemoryFeedbackLoop.admit` / `observeAction` + scheduler drive registry. **In-process tests only.** | Grok Build TUI. Already fired in this session. |

**Assurances you may currently expect from Grok auto-compact**

- It **will** run without Green care if the context window fills. qodesh
  `~/.grok/config.toml` does not set `compaction_mode`,
  `auto_compact_threshold_percent`, or disable compact. Defaults apply.
- When it runs, treat it as **fugue of the Grok working set**: ordinary
  recall of prior turns is gone from the model. This session already did
  that (436 turns → one recap; the approved try-out prompts were not in
  the recap).
- Disk is not the working set. `updates.jsonl` and segments remain, so a
  later agent can grep. That is scoped lookup after partition, not
  attention.
- Skill **catalog** is re-injected from `[skills].paths` every turn.
  Compact does not uninstall `green-zkillz`. It also does not remember
  which stage ran, or verbatim recipes that were never impressed.
- Grok cross-session memory is **off** (`[memory]` absent,
  `GROK_MEMORY` unset). `/flush` does not run for you.
- `green-dreamz` is **not** scheduled when Grok compact fires. MFL nap
  is **not** called. Roomz does not own this (MFL-1).

**Assurances you may currently expect from Green-Brainz (only if some
host actually calls the modules)**

- `admit` on a full working set returns `nap` / `working_set_full` /
  `fugue_prevented` and **does not drop** keys already in attention
  (`memory-feedback-loop.test.mjs`).
- That nap hints drive `epigenetic-optimization` (`NAP_HINT_DRIVE`).
  Default registry labels it `green-dreamz`. The scheduler still will
  not run a dream cycle unless the host is idle and calls `tryPromote()`.
- `fr-fr-freezer` climbs nap → fridge → freezer → seizure on repeated
  action hashes. Keys tagged `goal` stay integrated through seizure.
- Wraparound derives a new key; the parent stays disintegrated.

**What you must not expect**

- That Grok compact is a dream cycle.
- That skills in `[skills].paths` can veto or replace auto-compact.
- That admitted Grok-turn context survives compact the way MFL admitted
  keys survive nap.
- That a recap is first-hand origin. It is at best a derived wraparound
  of the transcript, produced by a different model call, with no
  Dreamcatcher provenance.

Until a host intercepts the Grok threshold, **care means impress before
the window fills** (git, GitHub, `STATUS` / `PIPELINE` receipts,
`.runtime/` cache). After compact, rehydrate from those artifacts. Do
not trust the recap as the working set.

## 0.1 How: fully integrate without a compact syscall

We cannot `syscall` Grok Build auto-compact. Skills, MCP, and Brainz
are not on that path. IRQ-5 is the same fact on llama: you cannot splice
bytes into a decode already in flight. In-place compaction of a live
context is not a Green primitive and must not be the plan.

**Fully integrated** means MFL `impress()`: the item leaves *attention*
and becomes an immutable Dreamcatcher record (`integration`). That is
the opposite of keeping it in the Grok window. After impress, throwing
the window away is not loss. Loss is only possible while state still
lives only in attention (Grok turns, unimpressed admits).

So the work is: **write-through the working set into Dreamcatcher faster
than any host can fugue it.** Grok compact then becomes a cache miss.
The compact syscall we *can* own is not Grok `/compact`. It is **start
a new generation, possibly on a different model, with bounded recall of
already-integrated keys.** Any sufficiently advanced agent that can
choose a model and open an empty context already has that syscall.

### Why model switch is the owned compact

| Unowned (do not wait for) | Owned (implement) |
|---|---|
| Grok `/compact` / auto-compact | New session, new Roomz request, or different alias/weights |
| Mutate llama KV / splice mid-decode | Preempt or end the generation; next fetch gets injected context (IRQ-5 / IRQ-8) |
| Recap as origin | Wraparound: derived context, parent stays in the store, `originAgentHash` preserved |
| Skills vetoing Grok compact | Skills impress receipts; host `tryPromote()` on `green-dreamz` |

A model switch is always available once two inference surfaces exist
(Grok vs Roomz, two Roomz aliases, raw-llama vs gateway, even one
model with an empty prompt). The agent does not need the old model's
permission. It needs the store to already hold the working set.

Grok can remain the operator IDE. It must not remain the cognitive
substrate. Switching "completely" means the loop that *admits* and
*impresses* runs where we own generation leases (Roomz + Brainz). Grok
fugue is then someone else's cache eviction.

### Three layers, in order

1. **Write-through (now, even on this Grok host).** Every fact that
   must survive is impressed while it is still in attention: git,
   GitHub, `STATUS`/`PIPELINE` receipts, and — when Brainz is called —
   `MemoryFeedbackLoop.impress`. Treat the Grok window as a write-through
   cache. This is what "record that" already did for the try-out
   prompts. Operator markdown is not a substitute for Dreamcatcher, but
   it is the only impress this host can do until an adapter calls
   `remember()`.

2. **Nap before the unowned compact (Brainz host).** Keep the MFL
   attention budget **strictly smaller** than the model context window.
   `admit` then naps (`fugue_prevented`) while Grok still has headroom.
   Idle `tryPromote()` on `epigenetic-optimization` (`green-dreamz`)
   impresses admitted keys. Dream is consolidation into the store, not
   a summarizer. `goal`-tagged keys stay integrated through later
   fridge/freezer/seizure.

3. **Owned compact = new generation / model switch (Roomz).** After
   impress, the host may drop the live prompt. Next request: Roomz asks
   Agentz for bounded recall (already in
   `docs/architecture/runtime-request-flow.md`); Roomz does not own the
   records (MFL-1, MFL-17). Optional: switch alias or weights. That
   reset is wraparound, not fugue. Public `:8080` still must not IRQ
   (IRQ-9).

### What the host loop looks like

```text
on event:
  express → admit
  if nap (working_set_full or stutter):
      stop admitting
      if idle: tryPromote(green-dreamz)  # impress admitted → integration
      if still pressure: new generation and/or model switch
          inject recallOrdinary(integrated) within token budget
          do not inject partitioned/contained
          do not send the old transcript as origin
  never: wait for Grok auto-compact to "save" attention
```

`impress()` already removes the key from the MFL working set after the
store has the record. That is success. The Grok window can vanish.

### What we will not do

- Teach Grok compact to be a dream cycle.
- Store durable cognition in `~/.grok/memory` or in Roomz RAM admission
  (`src/memory.mjs` is physical weights, not MFL).
- Copy Brainz into Roomz. Import by `GREEN_BRAINZ_ROOT` (Roomz #10).
- Pretend a recap is `integration`. It is an unauthenticated derived
  document until something calls `remember()` on its payload.

Implemented on Agentz `systems/green-brainz/host/cognitive-host.mjs`
(`CognitiveHost.observeTurn` write-through impress, `dream()` /
`tryPromote` on `green-dreamz`, `injectBoundedRecall`). Roomz loads it
only when `GREEN_BRAINZ_ROOT` is set (`src/brainz.mjs`). Grok compact
is still unowned fugue.

Follow-up: Agentz #14 remaining host-watch of Grok's own window. Roomz
#10 IRQ lease on every hop is started but not every proxy path.

## 1. Three windows people confuse

| Window | Owner | What fills it | What "full" means | What recovery is |
|---|---|---|---|---|
| Grok session context | Grok Build TUI | System prompt, skill *catalog*, loaded `SKILL.md` bodies, user turns, tool I/O | `context_window` × `session.auto_compact_threshold_percent` | `/compact` or auto-compact. Disk logs stay. |
| MFL attention set | Green-Brainz `MemoryFeedbackLoop` | Admitted keys, token estimate of their payloads | `attentionItemLimit` / `attentionTokenBudget` | **nap** (`working_set_full` / stutter). Does not drop admitted items. |
| Roomz inference body | Green-Roomz gateway | Stock frames + kernel + bounded recall + user | Model context / hop budget | Honest 400, HANDOFF, or skip. Not a chat summarizer. |

Auto-compact is the first row. Skills and MFL are not a second summarizer
inside Grok. They are the reason the first row must **impress** (write
durable artifacts) instead of hoping the recap remembered a recipe.

Grok memory (`~/.grok/memory`, `/flush`) is a fourth, experimental store.
It is not the Agentz cognitive store. Project facts belong in git and
GitHub issues. `/flush` before compact is optional host hygiene, not
Dreamcatcher integration.

## 2. What Grok actually does today

From `~/.grok/docs/user-guide/17-sessions.md` and
`26-config-reference.md`, plus this session's on-disk layout.

Trigger: context use crosses the model/session auto-compact threshold.
Manual: `/compact` or `/compact [extra instructions]`. Plan mode keeps a
"still planning" reminder.

Modes (`features.compaction_mode`):

- `summary` — LLM recap replaces old turns.
- `transcript` — keep more raw turns.
- `segments` — write `compaction/segment_NNNN.md` plus `INDEX.md`, then
  seed the next prompt from that index + recap. `features.compaction_detail`
  (`none` / `minimal` / `balanced` / `verbose`) controls how much verbatim
  lands in segments. `features.two_pass_compaction` (default true) is a
  second pass over the same history.

On disk, under `~/.grok/sessions/<cwd>/<session-id>/`:

```text
updates.jsonl              authoritative ACP log (not compacted away)
chat_history.jsonl         model-facing turns
compaction/INDEX.md        segment table
compaction/segment_*.md    frozen history slices
compaction_checkpoints/    restore points
recap_requests/            payloads sent to the recap model
last_recap_main_turn       index of the last recapped user turn
```

After compact, the model does **not** re-read 400 turns. It gets a recap
plus the recent tail. `updates.jsonl` remains the recoverability layer
(this is how the try-out prompts were recovered after the first compact
in this session).

Skills are **re-discovered from disk every turn**. The catalog in the
system reminder is names + one-line descriptions + `SKILL.md` paths. The
skill **body** is injected only when Grok decides the skill applies, or
when the user types `/green-zkillz`. Compact does not uninstall skills.
It can forget *that a skill already ran*, *which stage it stopped at*,
and *verbatim user-approved recipes that were never written to git*.

This session's first compact is the specimen: `segment_000.md` was
~520 KB / 436 turns; `INDEX.md` keywords were nearly useless
(`"User", "overview", "zkillz"`); the try-out prompt list the user had
just approved was **not** in the recap. Recovery required grepping
`updates.jsonl`. That is the failure mode this document exists to name.

## 3. What the skills already compact (before Grok does)

Green-Zkillz is already a compression pipeline for **control-plane**
text. Auto-compact must not fight it.

| Skill / tool | Compact-like rule | Why |
|---|---|---|
| `green-probe` | Keep the one-line `STATUS` array. Never dump probe JSON into the model. Short-circuit `.runtime/probe_cache.json` (REQ-SYS-04). | Identity is a receipt, not a transcript. |
| `green-bootstrap` | CI non-interactive logs; compiler proxy. | Raw compiler spew is the usual context killer. |
| `green-ingest` | Tree index or turn-by-turn ingest; syntax check. | The index is the durable map; file bodies stay on disk. |
| `green-format` | `MANUSCRIPT.json` chapter map; non-destructive make. | Structure outlives chat. |
| `green-deploy` | Publish only with explicit intent. Flat `MANUSCRIPT.md` is the degraded export. | Deploy is integration to an external store. |
| `green-zkillz` orchestrator | Four-line pipeline receipt (`PIPELINE` / `HOST` / `ARTIFACTS` / `ERRORS`). | The recap should prefer this receipt over tool logs. |
| GDICT | Intern STATUS enums, compiler diagnostics, path stems. **Do not compress human prose.** | Control plane only. Hash-like strings refused. LRU + Bloom in `.runtime/`. |
| `output-proxy.sh` | Collapse raw logs before they reach the model. | Same job as compact, earlier and cheaper. |
| `safe-write.sh` | Permission check + `.bak` + audit line (REQ-SYS-01, REQ-SYS-03). | Writes are the impress step. |

Host-tier degradation (from `green-zkillz/SKILL.md`):

| `host_tier` | After compact |
|---|---|
| `SUPERGROK_ENGINE` | Full pipeline. Re-read `STATUS` from cache if TTL valid. |
| `AGY_SANDBOX` | Local writes. No interactive pauses if `CI` is set. |
| `STATELESS_CHAT` | No writes. Compact is fatal for unrehearsed artifacts: prompt the user for each one. |

`asserted_blindness` is true only when the session is stateless, has no
memory, and has no connected-account tools. A compacted SuperGrok session
is **not** blind: disk, git, and GitHub still exist.

## 4. Expected composition (the mapping)

Treat Grok auto-compact as an **attention-budget event** on the *host*
working set. Map it onto MFL vocabulary without claiming Grok implements
MFL.

| Host event | MFL analog | Expected Green behavior |
|---|---|---|
| Context approaching threshold | working set filling | **nap**: stop admitting more chat-only state. Finish in-flight writes. Do not start a new pipeline stage that only exists in the prompt. Hint drive remains `epigenetic-optimization` (host `tryPromote()` = git commit, GitHub issue, `MANUSCRIPT.json`, probe cache). |
| Auto-compact / `/compact` fires | **fridge** (partition) of old turns | Ordinary recall of those turns is gone from the model. Scoped lookup is `updates.jsonl` / `segment_*.md`. Do not treat the recap as the record. |
| Recap omits a constraint or recipe | fridge that should have been an impress | Next turn **rehydrates from disk** (docs, issues, receipts), not from the recap's vibe. |
| Recap is wrong (invents a decision) | would-be **freezer** if we trusted it | Do not thaw a false recap into attention. Prefer git SHA, issue text, `STATUS` line. |
| Identical tool loops while recovering from compact | `fr-fr-freezer` stutter | Hash the action. 2nd identical → nap, 3rd → fridge, 4th → freezer, 5th → **seizure** (hard pause, `SeizurePauseError`). ABAB cycles jump to freezer. Keys tagged `goal` stay integrated. |
| User-approved recipe / standing constraint | key tagged `goal` | Survive nap, fridge, freezer, seizure. Examples below. |
| Wraparound after a compact | new derived record | The recap is a **derived** document. Parent turns stay in `updates.jsonl` (disintegrated from the model, not erased). Do not relabel the recap as first-hand origin. `originAgentHash` may pass through `remember()` without rewriting provenance. |

IRQ-9 still holds: public `:8080` chat must not inject IRQ events.
Grok auto-compact is a host scheduler event, not an IRQ from Roomz.

MFL-20: a `/skill` may *request* a transition through an Agentz-owned
API. Skill binding alone grants no memory authority. Compact must not
grant the recap model authority to rewrite phase history.

MFL-1: Roomz must not own durable cognitive state. Compacting a Grok
session that was driving Roomz must not dump working-set contents into
the gateway body.

## 5. What must survive a compact (goal-tagged)

These are standing constraints for this project. A recap that drops them
is a defect, not a successful compress.

1. **Identity.** Canonical repo `brianreborn/green-agentz`. Capability
   name Green-Zkillz. Green-Agency is retired; do not open new work
   there. Roomz is `brianreborn/green-roomz`.
2. **No vendor copy.** Do not copy Agentz trees into Roomz. Import Brainz
   by `GREEN_BRAINZ_ROOT` / later submodule (Roomz #10, Agentz #3).
3. **Install recipe** the user approved: clone +
   `python scripts/green-zkillz/install-skills.py`. Canonical page:
   `docs/green-zkillz/QUICK-INSTALL.md`.
4. **Unfinished user asks** until git/GitHub has them. "Record that
   please" was one. Compact must not retire an open ask.
5. **Issue numbers that gate work:** Agentz #2–#12, Roomz #6/#9/#10, as
   currently open. Do not re-file duplicates.
6. **SHAs and tags that name published bytes:** `green-zkillz-v0.1.0-alpha`
   at `a564c10`; MFL at `60f3af5`; quality suite at `741ca71`.
7. **Pipeline stop rules.** Deploy is explicit. Probe keeps STATUS only.
   GDICT does not compress prose.
8. **MFL machine phases** (derivation / attention / integration /
   partition / containment / disintegration) and the stutter protocol id
   `fr-fr-freezer`. fridge = partition, freezer = containment.
9. **Host facts that change behavior:** qodesh is Windows, PowerShell 5,
   no `pwsh`, no `gh` unless installed; Git Bash for skill scripts (#10).
10. **Live eval flags:** `EVAL_LIVE=1`, `EVAL_CLOUD=1` + `XAI_API_KEY`.
    Default `node --test eval/quality/quality.test.mjs` is in-process.

A compact recap may *point at* these (path, issue URL, SHA). It must not
paraphrase them into something weaker ("maybe copy skills into Roomz").

## 6. What must not survive in the model context

Drop from the post-compact prompt (they remain on disk):

- Full `probe.sh` JSON, GDICT tables, compiler logs, `node --test` chatter
- Directory listings, `git log` dumps, Actions job logs
- Intermediate grep of session files while recovering a recipe
- Skill **bodies** that are not the active skill (reload from `SKILL.md`)
- Bundled game/pdf/pptx skill catalogs that are not in use
- Roomz policy kernel text except the alias currently being called
- Pairwise J transcripts except the path to `eval/quality/results/`

The four-line zkillz receipt is the intended substitute for "what did
probe/bootstrap/ingest/format/deploy do?"

## 7. Skill reload after compact (expected sequence)

Every post-compact turn, before inventing procedure:

1. Trust the skill **catalog** in the system reminder (names, paths).
   `install-skills.py` already pointed `[skills].paths` at
   `…/green-agentz/skills`. Compact does not undo that.
2. If the user named a green-* skill, **read that `SKILL.md` again**.
   Do not rely on a recap of the skill.
3. Run `green-probe` only if STATUS is missing or cache TTL expired.
   Keep the STATUS line. That is REQ-SYS-04 meeting auto-compact.
4. Rehydrate pipeline stage from artifacts, not recap:
   - `.runtime/probe_cache.json` → probe done
   - Makefile / env present → bootstrap done
   - ingest index present → ingest done
   - `MANUSCRIPT.json` → format done
   - git remote SHA / GitHub release → deploy done
5. If the recap and the artifacts disagree, **artifacts win**. The recap
   is derived (`wraparound`), not origin.
6. Do not re-run deploy because the recap forgot "stop before deploy".

Bundled skills (`review`, `design`, `create-skill`, …) follow the same
rule: compact forgets in-progress orchestrator state unless it was
written to the skill's scratch files. The review skill already does this
(`scratch_dir` + `REVIEW_ID`). Green skills should do the same with
`.runtime/` and git.

## 8. Two-pass compact, Green-aware (expected, not implemented in Grok)

Grok's `two_pass_compaction` is generic. If we ever supply
`/compact [context]` or a compaction-tool hint, the instruction should
be:

**Pass 1 — inventory durables.** List paths and issue URLs that already
impress the work (QUICK-INSTALL, MFL.md, QUALITY-COMPARISON.md, SHAs,
open issues). Do not summarize those files; name them.

**Pass 2 — residual working set.** Keep only: current user query,
unfinished todos, the ten goal-tagged constraints in §5, active skill
name, last STATUS line, last PIPELINE receipt. Everything else is
fridge: available via `updates.jsonl` / git.

`features.compaction_verbatim_input` should stay true for user-approved
recipes (the try-out prompt list). Verbatim user text that was an
acceptance ("I like that, record that") is not eligible for paraphrase.

Do not set `compaction_mode=transcript` as the long-term plan; this
session already showed a 520 KB segment that still needed a recap.
`segments` + a Green-aware pass-2 is the intended shape.

## 9. Subagents, Roomz, and IRQ

- Subagent transcripts are child sessions. Compact of the parent must
  keep the **subagent id**, the one-line outcome, and the path of any
  file the child wrote. Do not keep the child's tool stream.
- Roomz stock prompts (`compileStockPrompt` / `injectSystemPolicy`) are
  re-injected per request from `policies/` + frames. They are not Grok
  session memory. If frames are missing, the host fail-safes to raw
  kernels — a compact recap must not claim frames were present.
- IRQ is a trusted control plane. Auto-compact of this Grok session must
  never become `inject` / `preempt` on `:8080`.
- Quality eval: in-process cases do not HTTP. Live `EVAL_LIVE=1` is a
  Roomz window, not a Grok compact. Skipping a missing peer is not a
  compact failure.

## 10. Operator playbook (qodesh)

When the status line shows context near the auto-compact threshold:

1. If the user just approved something that exists only in chat, **write
   it** (this is impress / `tryPromote()`). That is why QUICK-INSTALL
   exists.
2. Optionally `/flush` if Grok memory is enabled; still write git.
3. Let auto-compact run. Treat the recap as derived.
4. On the next turn, re-read skills from disk and continue from
   artifacts.
5. If recovery starts repeating the same grep/tool hash, stop
   (seizure): ask the user rather than looping.

Manual `/compact preserve green-zkillz receipts, issue numbers, and
QUICK-INSTALL prompts` is valid extra instruction. It is not a
substitute for impress.

## 11. Acceptance (when this is working)

- After auto-compact, Grok still lists `green-zkillz` / `green-probe` in
  the skill catalog without reinstall.
- Probe is a STATUS line or a cache hit, never a JSON dump.
- A user-approved try-out recipe is in `docs/green-zkillz/QUICK-INSTALL.md`
  and on a GitHub issue, so a recap miss is recoverable in one read.
- Recap does not invent a Roomz copy or revive green-agency.
- Repeated identical recovery actions climb `fr-fr-freezer` instead of
  filling the new window with the same tool stream.
- Goals tagged in §5 are still in the agent's working set; tool logs
  are not.
