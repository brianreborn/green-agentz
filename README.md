# Green-Agentz

Green-Agentz is the integration repository for the Green agent fleet.

## Current subsystem imports

- `systems/green-roomz`: shared inference gateway and runtime, imported from
  `brianreborn/green-roomz` `main`.
- `systems/green-zkillz`: portable skills and capability pack, imported from
  the repository currently hosted as `brianreborn/green-agency`.
- `systems/green-shepherdz`: reserved for the protected monitor system. Its
  Sentinel, Council, and Warden boundaries require joint review before code is
  extracted from the historical Green-Roomz location.

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

