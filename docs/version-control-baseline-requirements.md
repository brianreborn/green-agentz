# Version-Control Baseline Requirements

Status: candidate cross-project baseline. Green-Agentz is the first adopter;
future projects should inherit automated checks through Green-Zkillz rather
than copying policy text by hand.

## Identity and scope

- **VCS-01 — Canonical identity:** Every work session MUST identify the project
  repository, source commit, branch, host, and intended landing destination.
- **VCS-02 — One project name:** Historical aliases MAY remain as redirect or
  provenance records but MUST NOT remain active alternative triggers,
  directories, packages, or release identities.
- **VCS-03 — Host isolation:** Host-specific paths, profiles, launch methods,
  and workarounds MUST live on a named `host/<name>` branch or explicit private
  overlay. They MUST NOT silently change the shared baseline.

## Complete work-state accounting

- **VCS-04 — Full status:** A cleanliness claim MUST account for tracked
  changes, untracked files, ignored files, stashes, reflog-only commits, local
  branches/tags, linked worktrees, submodules/subtrees, and source-like files
  outside the repository used during the session.
- **VCS-05 — Fleet scope:** A clean checkout on one host MUST NOT be presented
  as fleet consistency. Each host or agent workspace that performed
  development requires its own audit receipt.
- **VCS-06 — Real repository proof:** The presence of `.git` metadata is
  insufficient. A repository audit MUST record tracked-file count, refs,
  current commit, upstream relationship, and remote recoverability.

## Artifact boundary

- **VCS-07 — Authored material:** Original or materially modified source,
  requirements, configuration, tests, launch integration, and provenance MUST
  be landed or explicitly rejected.
- **VCS-08 — Third-party exclusion:** Unmodified third-party downloads,
  binaries, model weights, vendor trees, caches, build output, and copied
  helper scripts MUST NOT be committed as project source.
- **VCS-09 — Delta preservation:** Material modifications to third-party work
  MUST preserve the authored delta, tests, attribution, and required license
  information instead of importing a redundant upstream payload.
- **VCS-10 — Ignore review:** Ignore rules MUST NOT be treated as disposition.
  Ignored and untracked files require classification as authored work,
  durable evidence, reproducible output, sensitive local state, or excluded
  third-party material.

## Landing and recovery

- **VCS-11 — Session receipt:** A development session MUST end with a receipt
  containing host, source commit, resulting commit/ref or rejection record,
  status summary, ignored/untracked summary, tests, and push/archive outcome.
- **VCS-12 — Published durability:** Work is landed only when reachable from a
  maintained remote or a named verified archive. A local commit alone is not a
  durability boundary.
- **VCS-13 — Backup exit criterion:** A copied tree, patch, tarball, or bundle
  MUST remain protected until every unique authored file and ref is landed,
  archived intentionally, or rejected with a reason.
- **VCS-14 — Clean-clone proof:** Each release or promotion gate MUST prove that
  the intended source system can be recovered from a clean clone plus
  explicitly declared private/local artifacts. No undocumented working tree
  may be required.

## Automation and inheritance

- **VCS-15 — Machine-readable policy:** Projects SHOULD declare the baseline
  version and permitted project-specific exceptions in a machine-readable
  manifest.
- **VCS-16 — Preflight:** An inherited preflight SHOULD fail or hold when work
  begins from an unnamed branch/host, when another worktree is dirty, or when
  ignored source-like files lack disposition.
- **VCS-17 — Landing gate:** CI SHOULD validate session receipts, provenance,
  forbidden artifact types, branch policy, and clean-clone recovery.
- **VCS-18 — Exception visibility:** Exceptions MUST name an owner, rationale,
  scope, and expiration/review condition. Silent exceptions are forbidden.

## Initial implementation path

1. Complete the current
   [development reconciliation ledger](reconciliation-loss-risk.md).
2. Derive a versioned manifest schema and receipt schema from the observed
   host/workspace cases.
3. Implement read-only Green-Zkillz preflight and audit commands.
4. Add landing-gate CI only after the checks can distinguish authored deltas
   from generated and third-party material without destructive guesses.
5. Adopt the baseline in additional projects through explicit version pins.
