# Green IRQ Candidate Requirements

This refines `COGNITIVE_REQUIREMENTS.md` section 6 into behavior that can be
implemented against the current Green-Roomz gateway. It does not rename or
modify Green-Roomz, Shalom, the system monitor, or the top-level orchestrator.

## Terms

- **Primary generation**: the single in-flight model inference for one session.
- **IRQ event**: a trusted, structured kernel notice with token, source,
  priority, bounded detail, ID, and ordering metadata.
- **Preemption**: aborting the request signal used by the active upstream fetch.
- **Priority injection**: prepending pending IRQ events as a transient `system`
  message to a replacement or subsequent inference request.

## Refined requirements

- **IRQ-1 — Request-neutral controller:** The controller MUST NOT own HTTP
  routes, model processes, routing policy, or monitor privileges. Integration
  MUST occur by dependency injection and the existing `AbortSignal` seam.
- **IRQ-2 — Session scope:** An active generation and its pending IRQs MUST be
  keyed by the already-issued Green-Roomz session ID. A session MUST have at
  most one primary generation lease.
- **IRQ-3 — Composed cancellation:** A generation lease MUST combine client
  disconnect cancellation with controller cancellation. The first abort reason
  MUST win and listeners MUST be released when the generation ends.
- **IRQ-4 — Mid-generation preemption:** A trusted catastrophic event or
  Streaming Agent prediction MUST synchronously abort the active generation's
  composed signal. The model process itself MUST remain resident; preemption is
  request cancellation, not process termination.
- **IRQ-5 — Honest injection semantics:** Because the current llama HTTP API
  cannot mutate a prompt after decoding begins, injection MUST NOT splice bytes
  into a partially emitted stream. Preemption MUST retain the IRQ for the
  replacement or next inference, where it is prepended to context before the
  upstream fetch begins.
- **IRQ-6 — Bounded priority queue:** Pending IRQs MUST be strictly bounded.
  Higher numeric priority MUST be retained and consumed first; equal priorities
  MUST preserve arrival order. An IRQ evicted by the bound MUST NOT preempt a
  generation.
- **IRQ-7 — One-shot consumption:** Once injected, an IRQ MUST be removed from
  pending state so it is not silently replayed on every turn.
- **IRQ-8 — Non-mutating context:** Injection MUST return a new request object
  and MUST NOT alter the caller's messages. The IRQ message MUST precede other
  messages and identify every event's token, priority, source, and ID.
- **IRQ-9 — Trust boundary:** Public inference payloads MUST NOT be able to
  create IRQ events. Only an authenticated internal control plane may call
  `inject`, `preempt`, or `cancel`. Tokens, sources, priorities, and detail size
  MUST be validated and control characters removed.
- **IRQ-10 — Lifecycle bounds:** Idle controller state MUST expire and the
  number of tracked sessions MUST be bounded. Active generations MUST never be
  evicted merely to satisfy capacity.
- **IRQ-11 — Observability:** The integration MUST emit lifecycle facts through
  existing observation facilities: queued, preempted/cancelled, injected, and
  completed. It MUST NOT log unrestricted prompt text or IRQ detail.
- **IRQ-12 — Failure contract:** A preempted response MUST be distinguishable
  from client cancellation. If no response bytes have been emitted, an
  integration MAY restart internally once. After streaming bytes have been
  emitted, it MUST end the stream and require an explicit client resume/retry;
  the retained IRQ is then applied to that request.

## Explicit non-goals for this candidate

- Killing, unloading, or reprioritizing a resident llama process.
- Adding an unauthenticated `/interrupt` gateway endpoint.
- Rewriting Nexus routing, the policy queue, or streaming proxy framing.
- Pretending that a backend supports live KV-cache prompt mutation.
- Changing product, agent, repository, or Shalom configuration names.

## Acceptance criteria represented by focused tests

1. Client abort reaches the composed generation signal.
2. Preemption aborts the active request and retains its IRQ.
3. Idle-session IRQs queue without reporting a false preemption.
4. The bounded queue is priority ordered and FIFO for ties.
5. Context injection is one-shot, bounded, and non-mutating.
6. Cancellation is distinguishable and does not inject context.
7. Concurrent primary leases for one session are rejected.
8. Invalid event shapes fail at the controller boundary.
9. Idle state expires while active leases remain tracked.
