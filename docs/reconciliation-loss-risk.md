# Development Reconciliation and Loss-Risk Ledger

Status: active loss-prevention audit. Do not delete or consolidate a listed
tree until its disposition is recorded here and the preserved result is
recoverable from a clean clone or an explicitly retained archive.

## Inclusion boundary

Preserve and reconcile:

- original or materially modified source code;
- requirements, architecture, tests, configuration, and launch integration;
- authored patches or deltas to third-party work, with provenance and license;
- unpublished Git commits, branches, tags, stashes, and reflog-only work;
- ignored or untracked files containing authored logic or irreplaceable
  development evidence.

Do not import:

- unmodified downloads or source copied from other people;
- model weights, executables, libraries, archives, installers, or other
  binaries;
- vendor trees, package caches, build output, runtime caches, or generated
  logs that can be reproduced;
- unmodified helper scripts derived from another project.

When third-party-derived work was materially modified, preserve the authored
delta and attribution rather than a redundant upstream payload.

## Required audit unit

Every development surface is audited as:

```text
host × repository/tree × branch/ref × tracked/ignored/untracked state
```

A clean canonical checkout does not prove another host or agent workspace was
clean. Each reachable host must report its repository status, ignored files,
untracked files, local refs, stashes, reflogs, and source-like files outside
Git before it is considered reconciled.

## Host checklist

| Host/surface | State | Required review |
|---|---|---|
| Shalom canonical Green-Agentz | Clean and published at `5833e61`; 251 filesystem files equal 251 tracked files | Continue external-tree and historical-ref review |
| Shalom reconciliation workspace | In progress | Classify faux repository, unique scripts, bundles, patches, and backups below |
| Qodesh | Offline/unreachable in current audit | Audit `C:\Users\brian\Documents\green-roomz`, `C:\LocalAI`, ignored/untracked files, local refs, stashes, reflogs, scheduled-task scripts, and agent outputs |
| Godslove | Awaiting operator bring-up | Locate every checkout/worktree and audit Git plus source-like files outside Git |
| Note 9 / Termux | Not yet live-audited | Audit `~/green-roomz`, authored files under `~/grz-runtime`, and `/data/local/tmp/grz`; exclude copied binaries and model weights |
| Pixel 8 / Android | Not yet live-audited | Locate Termux/app/ADB development trees and audit authored deltas only |
| Other fleet targets | No development tree proven yet | Record whether code was authored locally; do not infer from host branches |
| Agent/session workspaces | In progress | Audit dated Codex outputs, review trees, patches, transcripts, and unpublished commits |

## Confirmed Shalom findings

### Canonical checkout

- `work/green-agentz` currently has no ignored or untracked file contents.
- Two empty directories cannot survive Git and contain no data:
  `systems/green-zkillz/scripts/` and
  `systems/green-zkillz/.github/workflows/`.
- Broad Green-Roomz rules such as `data/*.json`, request/response captures,
  headers, and logs can silently hide future evidence. Existing matching files
  are already tracked and clone-safe; future files require explicit review.

### False repository / ignored payload

`work/_reconcile-backup-2026-08-29/snapshot-2026-08-28-green-roomz`
contains a `.git` directory but has no commits and tracks zero files. It must
be treated as an unprotected directory, not a repository.

Current inventory:

- 100 nonignored files;
- 42 ignored files (about 99 KB): 22 logs, three serve/health JSON records,
  eight request/response captures, four HTTP-header captures, three helper
  PowerShell scripts, one note, and one PID;
- most runtime evidence is reproducible, but helper scripts and unique authored
  probes must be reviewed before the snapshot or its archive is retired.

### Unique or potentially unique authored material

- Two requirements baselines totaling about 73 KB were recovered from the
  2026-08-28 Codex output workspace after searches confirmed that neither
  existed in any active Agentz or Roomz ref. They are now preserved under
  [`docs/requirements/`](requirements/README.md) for semantic reconciliation.
- `work/_reconcile-backup-2026-08-29/snapshot-2026-08-28-unique/` contains
  E3 probe/download scripts and several operations helpers not byte-identical
  to current Green-Agentz files.
- `work/_reconcile-backup-2026-08-29/localai-dirty-tracked/uncommitted.diff`
  preserves a four-file dirty state. Three substantive source/config results
  appear in Git history; the runtime log is evidence only. The recorded stash
  object is not present in the current Green-Agentz object database.
- `work/shalom-start.ps1` is an unprotected launcher variant. Its distinct
  behavior accepts HTTP 4xx as ready, unlike the tracked launcher. Treat it as
  likely obsolete, but do not delete it before explicit disposition.

### Recovery archives

Seven Git bundles in `work/_reconcile-backup-2026-08-29/` pass
`git bundle verify`. They preserve older or divergent Agentz, Roomz, Zkillz,
and session refs. They are recovery assets until every unique ref is reachable
from a maintained remote or a deliberately retained archival repository.

The `green-agency-session.bundle` contains a commit not present in the current
Green-Agentz object database, but that commit is also published in the private
`brianreborn/green-agency-session-2026-08-26` repository. Its eventual public,
private, or archival disposition remains open.

### Other Shalom development trees

`C:\Users\brian\Documents\green-roomz` is a separate current checkout with
ignored cutover evidence and one untracked partial result. The newest unique
records are `data/verify-cutover.json`, `verify-cutover.log`,
`serve-cutover.log`, and `verify2.txt`. They document real 503, Vulkan OOM,
timeout, and partial-probe outcomes. They are not production source, but their
disposition as durable test evidence remains open.

`C:\LocalAI` is a legacy deployment repository at local commit `d99e2d3` on
`host/shalom-deployed-legacy`. That commit and its annotated archive tag are
not on a recorded remote ref; a verified `localai.bundle` currently provides
the recovery boundary. The resulting launcher source is already semantically
present in Green-Agentz, but the ref and dropped-stash provenance must remain
protected until archived deliberately.

Strict source classification found 29 untracked authored or materially changed
files (about 80 KB) in `C:\LocalAI` that are not byte- or EOL-equivalent to
Green-Agentz. They fall into these review groups:

- provisioning/download/finalization scripts;
- Python gateway and model-switch prototypes;
- Shalom network, firewall, share, and launch helpers;
- Nexus routing probes and patch experiments under `_tmp`;
- EAGLE3 probes and McAfee UI-automation helpers;
- one materially modified `llama.cpp-0.3.0/tools/ui/CMakeLists.txt`, which must
  be preserved as an attributed patch/delta rather than by vendoring the
  upstream llama.cpp tree.

The Android arm64 pack, llama build output, models, runtimes, downloads,
virtual environments, caches, binaries, and unmodified upstream material are
explicitly excluded even though they are locally large. They are reproducible
or third-party payloads, not Green-Agentz source.

## Reconciliation gates

- [ ] Complete all reachable host audits.
- [ ] Inventory all dated Codex and agent workspaces.
- [ ] Compare every source-like external file by content and semantics against
      canonical Git history.
- [ ] Review ignored helper scripts separately from generated evidence.
- [ ] Verify every unique commit/ref is present on a maintained remote or in a
      named retained archive.
- [ ] Port accepted authored deltas in small reviewable commits with tests.
- [ ] Record rejected artifacts and the reason they do not belong.
- [ ] Perform a clean-clone recovery test from published sources plus retained
      archives.
- [ ] Only then remove redundant staging or backup trees.
