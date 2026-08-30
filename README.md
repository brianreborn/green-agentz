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

The Green-Zkillz capability bundles live at `skills/`. Their imported history
is retained from the repository currently hosted as
`brianreborn/green-agency`; `green-agency` remains a compatibility trigger
during migration.

## Architecture requirements

- [System overview](docs/architecture/system-overview.md) maps the Green-Agentz
  ecosystem and the boundaries between Agentz, Roomz, Zkillz, Shepherdz, and
  the future Fleetz integration surface.
- [Memory and monitor architecture](docs/architecture/memory-and-monitor.md)
  connects the osmotic memory-feedback loop to the protected Sentinel,
  Council, and Warden monitor boundaries.
- [Runtime request flow](docs/architecture/runtime-request-flow.md) follows a
  request through capability discovery, routing, backend execution, receipts,
  and failure handling.
- [Fleet deployment](docs/architecture/fleet-deployment.md) describes host
  overlays, branch responsibilities, deployment, and cross-host validation.
- [Memory Feedback Loop](docs/memory-feedback-loop-requirements.md) defines the
  six-phase cognitive memory lifecycle and its security boundaries.
- [Security monitor component map](systems/green-roomz/docs/security-monitor-component-map.md)
  makes the current Sentinel, Council, and Warden design surfaces visible while
  Green-Shepherdz extraction remains under joint review.
- [Security monitor requirements](systems/green-roomz/docs/security-monitor-requirements.md)
  records the normative requirements inherited by Green-Shepherdz.
- [Security monitor audit](systems/green-roomz/docs/security-monitor-audit.md)
  distinguishes implemented behavior from designs and open work.
- [Open ecosystem work](docs/TODO.md) tracks deferred integration, including
  the Green-Fleetz and swarm compatibility surface.

## Subsystem entry points

- [Green-Roomz](systems/green-roomz/README.md) is the executable local inference
  gateway. Its [known bugs](systems/green-roomz/docs/known-bugs.md),
  [fleet targets](systems/green-roomz/docs/fleet-targets.md), and
  [Shalom deployment](systems/green-roomz/deploy/shalom/README.md) are tracked
  beside the runtime.
- [Green-Brainz](systems/green-brainz/README.md) stages the tested microkernel
  components and their normative contracts: [IRQ](systems/green-brainz/irq/REQUIREMENTS.md),
  [epigenetic memory](systems/green-brainz/memory/REQUIREMENTS.md), and
  [objective scheduler](systems/green-brainz/scheduler/REQUIREMENTS.md).
- [Green-Zkillz](docs/green-zkillz/README.md) documents the adaptive `/skill`
  pipeline, including [installation](docs/green-zkillz/QUICK-INSTALL.md),
  [requirements](docs/green-zkillz/REQUIREMENTS.md), and
  [alpha release status](docs/green-zkillz/ALPHA.md). The installed capability
  layout is indexed under [skills](skills/README.md).

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
