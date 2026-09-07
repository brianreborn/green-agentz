# green-brainz

Microkernel components for the agency runtime — the "kernel" layer the
green-roomz nexus (green-beanz microkernel) and specialist kernels build on.

- `irq/`       — generation-lease / interrupt controller (untrusted-event boundary, fail-closed capacity)
- `memory/`    — Dreamcatcher store plus Memory Feedback Loop (phases, nap/fugue, fridge/freezer stutter, seizure)
- `scheduler/` — timer-free cooperative scheduler: lease expiry settles work, bounded ret/cooldown
- `host/`      — write-through impress host (`CognitiveHost`): nap instead of dropping attention, idle `green-dreamz` promotion, bounded recall for the next generation

Roomz imports this tree through `GREEN_BRAINZ_ROOT` (see `host/load.mjs`). Do not copy it into green-roomz.

```text
node --test systems/green-brainz/irq/irq-controller.test.mjs
node --test systems/green-brainz/memory/dreamcatcher-memory.test.mjs
node --test systems/green-brainz/memory/memory-feedback-loop.test.mjs
node --test systems/green-brainz/scheduler/scheduler.test.mjs
node --test systems/green-brainz/host/cognitive-host.test.mjs
```
