# Memory Feedback Loop Requirements

Status: architecture requirements. These requirements refine the staged
Dreamcatcher memory kernel; they do not rename or modify Green-Roomz runtime
memory admission.

## Design provenance

The source concept is the signed Note Tweet titled `THE MEMORY FEEDBACK LOOP`
from 2024-02-06:

- Tweet ID: `1754979624331694582`
- Note Tweet ID: `1754979624184934400`
- Six phases: Expression, Access, Impression, Repression, Suppression, and
  Oppression
- Operational glosses: derivation, attention, integration, partition,
  containment, and disintegration
- The membranes are malleable through attention, and loop direction is not
  fixed.

The local X archive preserves the complete clear-signed text. Signature
verification is still pending; the design must not treat the post's signing key
as a runtime agent-identity key.

## Scope and ownership

- **MFL-1 — Agentz ownership:** The cognitive memory lifecycle belongs to the
  Green-Agentz memory subsystem. Green-Roomz may inject bounded recalled context
  and issue inference receipts, but must not own durable cognitive state.
- **MFL-2 — Distinct physical memory:** Green-Roomz runtime RAM admission and
  model placement are unrelated to this lifecycle and must retain a distinct
  module name and API.
- **MFL-3 — Membranes are cognitive:** A membrane controls whether information
  is reachable by derivation, attention, recall, or integration. It is not an
  authentication, authorization, capability, or process-isolation boundary.

## Phase model

The implementation must use the operational terms as stable machine values.
The expressive terms remain documentation labels.

| Index | Expressive label | Machine phase | Required meaning |
|---:|---|---|---|
| 0 | Expression | `derivation` | A candidate thought or memory is externalized without becoming durable merely by being expressed. |
| 1 | Access | `attention` | A bounded working set admits the item for current cognition. |
| 2 | Impression | `integration` | An immutable experiential record and its associations become durably reachable. |
| 3 | Repression | `partition` | Ordinary recall excludes the item, while an authorized scoped lookup may still retrieve it. |
| 4 | Suppression | `containment` | Policy denies recall and context injection until an authorized release event occurs. |
| 5 | Oppression | `disintegration` | Active associations are removed or decayed and the item becomes unreachable through ordinary recall. |

- **MFL-4 — Coordinate, not clock:** `N modulo 6` identifies a phase. It must
  not force every memory through a fixed forward sequence.
- **MFL-5 — Direction is explicit:** Every transition records its source phase,
  destination phase, direction, reason, actor fingerprint, session correlation,
  and timestamp. Policy may permit forward, reverse, or direct transitions.
- **MFL-6 — No in-place relabeling:** A transition appends an immutable event.
  It does not rewrite the memory record, its origin, or earlier phase history.
- **MFL-7 — Wraparound derives:** Wraparound from disintegration to derivation
  creates a new derived record referencing its parents. It must not silently
  resurrect or relabel the disintegrated record.

## Attention and permeability

- **MFL-8 — Bounded attention:** Attention is a bounded control signal and
  working-set budget. It may affect recall eligibility and ranking only within
  the caller's authorized scope.
- **MFL-9 — Policy ceiling:** Increased attention may make a cognitive membrane
  more permeable, but cannot bypass containment, identity isolation, capability
  checks, Shepherdz policy, or host sandboxing.
- **MFL-10 — Deterministic eligibility:** Given the same records, policy,
  attention budget, relevance inputs, and clock, eligibility and ranking must be
  deterministic.
- **MFL-11 — Bounded injection:** Recalled items admitted to attention must obey
  a finite item and token budget. The primary model emits no memory-management
  tokens merely to maintain this state.

## Persistence, provenance, and audit

- **MFL-12 — Two immutable histories:** The system stores immutable
  content-addressed memory records and an append-only transition history. Phase
  events do not duplicate or mutate record payloads.
- **MFL-13 — Origin survives movement:** Forking, inheritance, partitioning,
  containment, disintegration, and wraparound preserve origin fingerprints and
  parent references. A receiver never relabels inherited memory as first-hand.
- **MFL-14 — Containment is not deletion:** Containment preserves the record and
  audit trail. Release requires a new authorized event.
- **MFL-15 — Disintegration is initially logical:** Disintegration removes
  associative reachability or records a tombstone. Physical erasure requires a
  separately specified retention and destruction policy.
- **MFL-16 — Authentication remains separate:** Hashes provide integrity and
  provenance correlation, not authenticated authorship. Authorship claims need
  a separately specified public-key registry and signer interface.

## Component interfaces

- **MFL-17 — Roomz interface:** Green-Roomz supplies authenticated session
  correlation, current modality, requested/effective/physical model receipts,
  and a bounded context-injection seam.
- **MFL-18 — IRQ interface:** Repeated rapid action or transition hashes may
  trigger deterministic containment of the active working set. IRQ handling
  must preserve the foundational goal and durable audit trail.
- **MFL-19 — Scheduler interface:** The scheduler supplies bounded background
  work, priorities, and cancellation. It must not invent phase transitions or
  weaken containment.
- **MFL-20 — Zkillz interface:** A `/skill` may request a transition through an
  Agentz-owned API. Skill binding alone grants no memory authority.
- **MFL-21 — Shepherdz interface:** Green-Shepherdz may observe, veto, contain,
  or require quorum for security-relevant transitions. Cognitive state never
  grants Sentinel, Council, or Warden authority.
- **MFL-22 — Future swarm interface:** Swarm or Green-Fleetz exchange sends
  bounded provenance-preserving impressions, not another agent's raw working
  context. The receiver applies its own policy, inherited weighting, and
  membrane state.

## Anti-loop requirements

- **MFL-23 — Transition-loop detection:** The orchestrator detects compressed
  repetition in recent actions and phase transitions without an LLM judgment.
- **MFL-24 — Localized recovery:** A detected loop may contain the active
  working set and recent episodic path while preserving durable goals,
  provenance, and audit history.
- **MFL-25 — Escalation:** Repeated recovery events within one session trigger a
  bounded hard pause requiring human intervention or an explicitly authorized
  consolidation cycle.

## Acceptance tests

1. All six indices map to stable machine phases and wrap deterministically.
2. Allowed reverse and direct transitions work without rewriting history.
3. Attention changes ranking within policy but cannot release a contained item.
4. Partitioned items are absent from ordinary recall and available only through
   an authorized scoped query.
5. Containment and release are separate auditable events.
6. Disintegration removes ordinary reachability without erasing provenance.
7. Wraparound creates a derived record with parent references.
8. Forked and swarm-received records remain inherited and retain origin
   fingerprints through every phase.
9. Recall and context injection remain bounded and deterministic.
10. Repetition detection contains a local loop without deleting the goal or
    granting additional authority.

## Non-goals

- Inferring human psychological causes from machine state.
- Treating expressive labels as diagnoses of a user or agent.
- Letting attention override security policy.
- Broadcasting complete session context to a swarm.
- Using the design-source PGP identity as an operational trust root.
