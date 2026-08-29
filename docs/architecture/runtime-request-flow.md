# Runtime Request Flow

This document describes the current Green-Agentz runtime seam. Green-Roomz
owns local inference routing and process lifecycle; Agentz owns skills and
cognitive memory; Green-Shepherdz observes and constrains security-sensitive
events. Future Green-Fleetz/swarm coordination remains outside this request
path.

```text
client
  |
  v
gateway :8080 -- authenticate/correlate --> session store
  |                                      |
  | detect modality + requested alias    +--> bounded Agentz context
  v
registry/status -- truthful capability check
  |
  +--> monitor mailbox (observe/contain/veto when required)
  |
  +--> owned process manager -- ready --> native backend or sidecar
                                      |
                                      v
                         response + inference receipt
```

## Boundaries and invariants

- A request has one session correlation, one routing decision, and one
  inference receipt. Hops and fallbacks are recorded rather than hidden.
- `model` is a functional alias. The receipt also records the physical model
  or sidecar that actually served the request.
- A manifest declaration is not proof of availability. Runtime/artifact
  checks must produce the exposed status.
- Gateway-accepted input describes the protocol surface; it does not grant a
  native capability that the selected backend does not implement.
- A cold process may be started only by the owned process manager after
  admission and health checks. Unavailable capability returns a truthful error;
  it must not silently become a different modality.
- Attention and memory context are bounded inputs. They never grant skill,
  filesystem, identity, or Shepherdz authority.

## Request routing

The gateway makes the routing decision before it forwards inference. Explicit
alias locking is deterministic; otherwise the nexus may select a routable
specialist according to policy. Security-monitor traffic uses its mailbox path.

```mermaid
flowchart TD
    A[Client request] --> B[Gateway :8080]
    B --> C{Authenticate and validate}
    C -- reject --> C1[4xx response]
    C -- accept --> D[Create or reuse session]
    D --> E[Detect modality and parse request]
    E --> F{Security monitor alias?}
    F -- yes --> G[Append monitor event to mailbox]
    F -- no --> H{Explicit routable alias locked?}
    H -- yes --> I[Use requested alias]
    H -- no --> J{Modality hard rule?}
    J -- yes --> K[Use compatible modality alias]
    J -- no --> L[Ask resident nexus for route]
    I --> M[Registry status check]
    K --> M
    L --> M
    G --> N[Return monitor receipt]
    M --> O{Capability available?}
    O -- no --> P[Truthful unavailable response]
    O -- cold --> Q[Admission and owned process start]
    O -- ready --> R[Invoke selected backend]
    Q --> S{Healthy before deadline?}
    S -- no --> T[Bounded retry or error receipt]
    S -- yes --> R
    R --> U[Emit response and inference receipt]
    P --> U
    T --> U

    classDef boundary fill:#e9f5f2,stroke:#267a68,color:#123;
    classDef error fill:#fff1f0,stroke:#b33,color:#300;
    class F,G,N boundary;
    class C1,P,T error;
```

## Sessions and bounded context

Sessions carry identity, modality, selected alias, and correlation. Agentz
memory can provide bounded context through its interface, but Roomz does not
own durable cognitive records.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant G as Green-Roomz Gateway
    participant S as Session Store
    participant A as Agentz Context
    participant R as Router/Backend

    C->>G: Request + credentials + optional session id
    G->>S: Authenticate and create/reuse session
    S-->>G: session id, identity, policy scope
    G->>A: Request bounded context for session
    A-->>G: Context items within item/token budget
    G->>R: Request + bounded context + session correlation
    R-->>G: Native response + physical model identity
    G->>S: Append request/route/result metadata
    G-->>C: Response + session and inference receipt headers
```

Session reuse does not authorize cross-identity memory access. A fork or
swarm-received impression retains its origin and inherited weighting; the
receiver applies its own policy before context injection.

## Capability truthfulness

The registry exposes what is callable on this host at this moment. Native
capabilities, accepted protocol modalities, and availability are separate
fields.

```mermaid
flowchart LR
    A[Manifest alias] --> B[Validate schema and policy]
    B --> C[Check runtime command]
    B --> D[Check required artifacts]
    B --> E[Check backend/sidecar descriptor]
    C --> F[Registry status]
    D --> F
    E --> F
    F --> G{All required checks pass?}
    G -- no --> H[availability: unavailable\nwith reasons]
    G -- yes, process absent --> I[availability: cold]
    G -- yes, process healthy --> J[availability: ready]
    H --> K[/v1/models and /health]
    I --> K
    J --> K
    K --> L[Client chooses a truthful route]
    M[Gateway-accepted input] --> N[Protocol validation only]
    N -. never implies .-> J
```

`native_capabilities_are_truthful` means the native list is backed by the
selected implementation, not merely by an input format the gateway can parse.
If a logical alias points at a text-only backend, it must not claim that a
vision, audio, embedding, or image-generation request was executed natively.

## Sidecars and resource safety

Sidecars are explicit, owned processes. Their lifecycle is independent of the
resident text nexus, and a failed or missing sidecar must not be hidden by
silently sending its request to a text model.

```mermaid
flowchart TD
    A[Request with image/audio/embedding/output modality] --> B[Resolve compatible alias]
    B --> C{Descriptor exists?}
    C -- no --> D[Unavailable: missing sidecar descriptor]
    C -- yes --> E[Check host capability and resource budget]
    E --> F{Admissible without unsafe concurrency?}
    F -- no --> G[Unavailable or queued with reason]
    F -- yes --> H{Owned process healthy?}
    H -- no --> I[Start one sidecar with pinned args]
    I --> J{Health deadline met?}
    J -- no --> K[Stop owned failed process and report error]
    J -- yes --> L[Invoke sidecar endpoint]
    H -- yes --> L
    L --> M[Record sidecar/model identity in receipt]
    D --> N[No modality fallback]
    G --> N
    K --> N
```

The resident CPU nexus may remain available while a sidecar is cold, but it
does not make that sidecar's capability ready. Admission, process ownership,
and cancellation prevent unrelated services from being started or terminated.

## Inference receipts

Receipts make alias switching and physical execution auditable. They are also
the seam used by memory and monitor components without allowing either to
rewrite the runtime result.

```mermaid
sequenceDiagram
    autonumber
    participant G as Gateway
    participant R as Registry/Router
    participant P as Process Manager
    participant B as Backend or Sidecar
    participant M as Agentz Memory
    participant W as Shepherdz Monitor

    G->>R: request id, session id, requested alias, modality
    R-->>G: effective alias, route reason, capability status
    G->>P: Ensure selected process is admitted and healthy
    P->>B: Forward normalized request
    B-->>P: response + physical model/engine identity
    P-->>G: backend result
    G->>M: bounded result/context receipt metadata
    G->>W: observation event with correlation and route facts
    G-->>G: append immutable receipt
    G-->>G: expose requested/effective/physical identities
```

At minimum, a receipt should correlate the request, session, requested alias,
effective alias, physical model or sidecar, route reason, modality,
availability decision, hop list, and timestamps. Hashes provide integrity and
correlation; they do not by themselves prove authorship.

## Monitor observation

The monitor path is asynchronous and bounded. Green-Shepherdz may observe,
contain, veto, or require quorum for security-relevant events. It cannot gain
authority from a memory item, a skill binding, or an inference response.

```mermaid
sequenceDiagram
    autonumber
    participant G as Green-Roomz Gateway
    participant Q as Security Monitor Mailbox
    participant S as Green-Shepherdz Policy
    participant A as Agentz Memory/Skills
    participant H as Host Process Boundary

    G->>Q: route, session, capability, process, and error event
    Q-->>G: bounded enqueue acknowledgement
    Q->>S: ordered observation with correlation id
    S->>S: evaluate policy and repetition/transition signals
    alt observation only
        S-->>A: record monitor result if authorized
    else contain or pause
        S->>H: request scoped containment or pause
        H-->>S: enforcement result
        S-->>G: veto/contain decision for correlated work
    else quorum required
        S-->>S: hold transition pending authorized quorum
    end
    G-->>Q: completion/error receipt
```

Monitor observation is not a replacement for host isolation, authentication,
or process ownership. Cognitive containment preserves the memory record and
audit trail; it does not authorize physical deletion or broaden the caller's
scope.

