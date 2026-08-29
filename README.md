# Green-Agentz

Green-Agentz is the integration repository for the Green agent fleet.

## Project model

- **Green-Agentz** is the project and top-level repository. It succeeds the
  historical Green-Agency project name.
- **Green-Zkillz** is the portable capability layer inside Green-Agentz. Its
  capabilities are applied to suitable agents through `/skill` commands; it is
  not a sibling daemon or independent runtime.
- `systems/green-roomz` is the shared inference gateway and runtime, imported
  from `brianreborn/green-roomz` `main`.
- `systems/green-shepherdz`: reserved for the protected monitor system. Its
  Sentinel, Council, and Warden boundaries require joint review before code is
  extracted from the historical Green-Roomz location.

The existing `systems/green-zkillz` subtree is a provenance-preserving import
of the repository currently hosted as `brianreborn/green-agency`. Its skill
content will move into the Green-Agentz project layout after root-file and
legacy-trigger conflicts are classified.

## Host branches

Host-specific launchers, manifests, measured profiles, and workarounds belong
on `host/<name>` branches. Shared behavior belongs on `main` and reaches host
branches through reviewed merges.

## Provenance rules

1. Byte-identical files are imported once.
2. Same-path files with different hashes remain separate until reviewed.
3. Runtime logs, model weights, generated caches, and device dumps are not
   source artifacts.
4. The unrelated historical `green-roomz` `master` lineage is retained as a
   Git reference, not copied into the canonical source tree.
5. No host overlay may silently modify another host's configuration.
