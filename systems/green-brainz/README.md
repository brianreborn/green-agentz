# green-brainz

Microkernel components for the agency runtime — the "kernel" layer the
green-roomz nexus (green-beanz microkernel) and specialist kernels build on.

- `irq/`       — generation-lease / interrupt controller (untrusted-event boundary, fail-closed capacity)
- `memory/`    — dreamcatcher memory: provenance-bound records, first-hand vs inherited ranking, deferred eviction
- `scheduler/` — timer-free cooperative scheduler: lease expiry settles work, bounded ret/cooldown

Each component is standalone (`node --test` in its dir). Staged here from
`op/work/kernel-staging` during the 2026-08-29 tree reconciliation.
