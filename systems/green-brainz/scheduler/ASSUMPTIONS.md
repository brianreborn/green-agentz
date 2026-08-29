# Source assumptions and integration notes

## Read-only sources inspected

- `C:\LocalAI\android-pack\grz-termux\src\scheduler.mjs`
- `C:\LocalAI\android-pack\grz-termux\package.json`
- `C:\LocalAI\android-pack\grz-termux\bin\green-roomz.mjs`
- `C:\LocalAI\papers\cognitive-architecture\COGNITIVE_REQUIREMENTS.md`
- `C:\LocalAI\papers\cognitive-architecture\README.md`
- `C:\LocalAI\papers\cognitive-architecture\agent-memory-architecture.md`

## Assumptions

1. The existing `PolicyGate` remains the gateway's heavy-inference concurrency
   gate. This candidate does not replace or alter it; eventual integration can
   export both kernels from `scheduler.mjs` or split them after tree unification.
2. No existing repository tests cover the source scheduler; the project test
   command is Node's built-in `node --test`.
3. “Idle” cannot safely be inferred by this module. The host must provide both
   external queue depth and Primary Agent activity.
4. A scheduler lease is a planning/dispatch token, not permission. The executor
   must re-apply normal Shalom host policy, tool authorization, anti-loop, and
   interrupt controls.
5. Task rules are task-scoped. Drive hierarchy affects ordering and enablement
   only; it does not grant or inherit capabilities.
6. Finite attempts and finite promotions per idle epoch intentionally refine the
   source phrase “continuous autonomous operation” into bounded, observable
   progress. Continued work requires explicit host ticks and eventually a new
   idle epoch or an explicit re-arm.
7. The `green-*z` names are display labels only until repository integration
   resolves naming and ownership. Stable IDs remain descriptive.
8. The active identity is Shalom. This candidate contains no agent-specific
   identity, endpoint, port, or Qodesh configuration.

## Integration seam

The host should:

1. observe queue/Primary state;
2. call `tryPromote()` once from its existing event loop;
3. dispatch the returned opaque payload through the normal authorized pathway;
4. honor the lease abort signal;
5. call `settle()` with the outcome.

The candidate deliberately creates no timer and invokes no task payload.
