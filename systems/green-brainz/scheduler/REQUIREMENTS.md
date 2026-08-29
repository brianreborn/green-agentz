# Objective Scheduler (Drive Registry) — Refined Candidate Requirements

This document refines `REQ-8.1` and `REQ-8.2` from
`C:\LocalAI\papers\cognitive-architecture\COGNITIVE_REQUIREMENTS.md` without
modifying the source specification.

## Scope and identity

- The scheduler is a generic microkernel component. It contains no Qodesh- or
  Shalom-specific configuration; the hosting Shalom process supplies runtime
  state and capabilities.
- `green-*z` labels may be used as display names, but stable machine IDs remain
  semantic and are not renamed during tree integration.
- The scheduler chooses work. It does not execute tools, grant authority, or
  expand a task's scope.

## REQ-8.1 — Hierarchical Drive Registry

1. The registry MUST represent drives as an acyclic parent/child hierarchy with
   stable unique IDs, numeric rank, enabled state, and optional display name.
2. Candidate ordering MUST be deterministic: ancestor rank path, task priority,
   insertion order, then task ID.
3. Every background task MUST belong to an existing drive and carry its own
   eligibility and execution-budget rules. Drive membership MUST NOT confer
   capabilities or inherit task authority.
4. A task MUST declare a finite `maxAttempts`; repeated tasks MUST declare a
   positive cooldown. A task with an exhausted attempt budget is ineligible
   until explicitly re-armed.
5. Registry snapshots MUST be data-only so state can be inspected or persisted
   without exposing executable callbacks.

Suggested initial roots, expressed as labels rather than irreversible names:

1. `system-stability` (`green-stabilitz`)
2. `task-fulfillment` (`green-taskz`)
3. `epigenetic-optimization` (`green-dreamz`)

## REQ-8.2 — Safe Idle Promotion

1. Idle MUST be proven from caller-supplied state: the external user queue is
   empty and the Primary Agent has no active work.
2. Promotion MUST be pull-driven by an explicit `tryPromote()` call. The
   scheduler MUST NOT create timers, polling loops, or recursively execute work.
3. Each call MUST return at most one opaque task lease, and only one lease may be
   active at a time.
4. The scheduler MUST cap promotions within an idle epoch. Observing external
   activity begins a new epoch and MUST abort any active background lease.
5. Promotion MUST consume an attempt before dispatch. Success, failure,
   deferral, abandonment, and lease expiry MUST all settle deterministically.
6. User activity MUST take priority over background work. The lease's abort
   signal is advisory to the executor; the host remains responsible for actual
   process/tool cancellation.
7. Eligibility MUST verify task-local capability requirements, `notBefore`,
   cooldown, enabled state, and finite budget before promotion.
8. No promoted payload may bypass the host's normal policy, authorization,
   anti-loop, or Cognitive Seizure controls.

## Non-goals

- No self-authored goals or permissions.
- No unattended infinite autonomy.
- No tool execution inside the scheduler.
- No coupling to gateway/monitor implementation details.
- No durable persistence format in this candidate.

