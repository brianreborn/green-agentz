# Lessons Learned

## Repository cleanliness is not fleet consistency

A clean canonical checkout proves only that one checkout has no pending work.
It does not prove that development performed on another host, platform, agent
workspace, worktree, branch, stash, reflog, ignored directory, or untracked
tree was reconciled.

The durable audit unit is:

```text
host × repository/tree × branch/ref × tracked/ignored/untracked state
```

Work is not considered landed until that unit has a receipt tying the authored
change to a published commit or an explicitly retained archive.

## A `.git` directory is not proof of protection

The reconciliation found a directory with `.git` metadata but no commits and
zero tracked files. It visually resembled a repository while all of its content
remained unprotected. Every repository claim must therefore be verified with
its tracked-file count, refs, status, and recoverability from a remote—not by
directory shape.

## Ignored does not mean disposable

Ignore rules describe default Git behavior, not ownership or value. A broad
rule intended for generated JSON or logs can also conceal authored probes,
launch helpers, request fixtures, benchmark evidence, and the only record of a
failed integration attempt.

Ignored and untracked material must be classified before cleanup:

1. authored source/configuration/test/documentation to land;
2. irreplaceable evidence to preserve intentionally;
3. reproducible runtime or build output to regenerate;
4. third-party material that does not belong in this repository.

## Preserve our delta, not somebody else's payload

Unmodified downloads, binaries, model weights, vendor trees, and helper scripts
copied unchanged from other projects do not belong in Green-Agentz. When work
derives from a third-party project, preserve only the materially authored
delta, tests, provenance, and required license information. This keeps the
repository both legally clearer and technically reviewable.

## Host branches are necessary but insufficient

Host branches prevent one machine's launch paths and hardware workarounds from
silently becoming the fleet baseline. They do not help if development occurs
outside the branch or remains ignored/untracked on the host.

Each host-development session should end with one of these explicit outcomes:

- shared change committed and pushed through a reviewed integration branch;
- host-specific change committed and pushed to `host/<name>`;
- experiment rejected with its disposition recorded;
- sensitive or bulky local artifact recorded in a private deployment ledger,
  with no source change left behind.

## Backups require an exit criterion

Bundles, tarballs, patches, and copied workspaces are valuable during an
incident, but become a second source of truth if retained indefinitely without
classification. A backup may be retired only after every unique ref and
authored file is either:

- reachable from a maintained remote;
- stored in a named, verified archival repository or bundle; or
- explicitly rejected with a reason.

## Required process changes

- Begin work from a named repository, branch, host, and intended landing path.
- Record `git status`, ignored/untracked inventory, and source commit in the
  session receipt.
- Commit small coherent changes regularly, then push before changing hosts or
  agents.
- Never treat a copied working tree as deployment provenance.
- Keep generated evidence outside broad source directories or explicitly add
  the evidence that is meant to be durable.
- Maintain the
  [development reconciliation and loss-risk ledger](reconciliation-loss-risk.md)
  until a clean-clone recovery test succeeds for the full intended system.
