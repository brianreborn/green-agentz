# Epigenetic Memory Kernel — Refined Candidate Requirements

Status: staging proposal. This does not rename or replace Green Roomz components.

## Source interpretation

The existing `green-roomz/src/memory.mjs` is a physical-memory admission module for
model runtimes. It is not an implementation of the Dreamcatcher described by
`COGNITIVE_REQUIREMENTS.md`; both concepts need distinct module names and APIs.

The candidate below refines REQ-2.1–2.3 and REQ-7.1–7.2 into testable behavior:

1. **Non-blocking eviction (REQ-2.1).** Enqueuing an eviction returns immediately
   with a ticket. Persistence occurs on a background promise queue. Callers that
   need a durability boundary can explicitly `await flush()`.
2. **Persistent copy-on-write state (REQ-2.2).** Memory records, radix-trie nodes,
   and commits are immutable, content-addressed objects. A fork creates only a new
   branch reference to the same commit. Updating a branch path-copies the nodes on
   one key path and reuses all unaffected objects.
3. **Epigenetics are separate from genetics (REQ-2.3).** The store persists only
   experiential records and their state graph. It has no model-weight API and does
   not mutate model artifacts.
4. **Origin provenance (refined REQ-7.1).** Every memory record stores a
   domain-separated SHA-256 fingerprint of the originating agent ID and a second
   SHA-256 digest binding that fingerprint to the record content. The immutable
   object's content address covers both. Raw agent IDs are not persisted.
5. **Authentication boundary.** A public hash is tamper-evident, but it is not a
   cryptographic signature and does not prove that the named agent authored the
   memory. Authentic signatures require a separately specified key registry and
   signer interface. This candidate does not manufacture that security boundary.
6. **Self versus inherited weighting (REQ-7.2).** At recall time, a memory is
   first-hand only when its stored origin fingerprint equals the requesting
   agent's fingerprint. A fork never relabels inherited memories. The default
   provenance multipliers are `1.0` first-hand and `0.6` inherited, and callers may
   lower (but not raise above first-hand) the inherited multiplier.
7. **Bounded output.** Recall requires a finite positive limit and returns no more
   than that number of ranked records. Ties are deterministic.
8. **Identity isolation.** No hostname, deployment persona, or default agent name
   is inferred. In particular, the candidate does not introduce a `qodesh`
   configuration; originating and requesting agent identities are explicit inputs.
9. **No prompt-policy mutation.** This kernel returns data and scores only. Any
   bounded system-context injection belongs to the gateway integration layer.

## Deferred integration requirements

- Specify an agent public-key registry and signed provenance envelope before
  claiming authenticated authorship.
- Add multiprocess branch-reference locking or compare-and-swap before allowing
  concurrent writers to the same branch.
- Connect queued eviction failures to gateway telemetry and retry policy.
- Define the associative relevance model used by the Streaming Agent. The staging
  kernel accepts a deterministic relevance callback and otherwise uses salience.

