# Green-Agentz System Overview

## Compact architecture

```text
Green-Agentz
├── Green-Roomz       inference gateway, routing, sessions, native runtimes
├── Green-Zkillz      portable `/skill` capability layer
├── Green-Shepherdz   protected monitor system (reserved extraction)
│   ├── Sentinel      observe and correlate
│   ├── Council       evaluate and authorize
│   └── Warden        mediate bounded effects
└── Green-Fleetz      future fleet/swarm coordination boundary
```

The names describe ownership boundaries. They do not imply that every component
is already a separate daemon or repository.

## Ecosystem architecture

```mermaid
flowchart TB
    Operator[Operator or suitable agent]
    Agentz[Green-Agentz\nproject and orchestration]
    Roomz[Green-Roomz\ninference runtime]
    Zkillz[Green-Zkillz\n/skill capability layer]
    Shepherdz[Green-Shepherdz\nprotected monitor boundary]
    Fleetz[Green-Fleetz\nfuture fleet and swarm boundary]

    Operator --> Agentz
    Agentz -->|bind and run compatible skills| Zkillz
    Agentz -->|request inference and receive receipts| Roomz
    Roomz -->|copy-only observations| Shepherdz
    Zkillz -->|auditable operation proposals| Shepherdz
    Fleetz -.->|host profiles and bounded impressions| Agentz
    Shepherdz -.->|policy decisions; never prompt authority| Agentz
```

## Responsibility boundary

```mermaid
flowchart LR
    subgraph Cognitive[Agentz cognitive plane]
        Goals[Goals and sessions]
        Memory[Dreamcatcher memory]
        Skills[Zkillz bindings]
    end

    subgraph Inference[Roomz inference plane]
        Gateway[Gateway]
        Router[Alias and modality routing]
        Native[Native runtimes and sidecars]
    end

    subgraph Protection[Shepherdz protection plane]
        Sentinel[Sentinel]
        Council[Council]
        Warden[Warden]
    end

    subgraph Fleet[Future fleet plane]
        Profiles[Host profiles]
        Swarm[Swarm coordination]
        Receipts[Deployment receipts]
    end

    Goals --> Gateway
    Memory -->|bounded context| Gateway
    Skills -->|authorized request| Gateway
    Gateway --> Router --> Native
    Gateway -->|events| Sentinel --> Council --> Warden
    Profiles --> Gateway
    Swarm -->|provenance-preserving impressions| Memory
    Native -->|physical model receipt| Receipts
```

## Boundary rules

1. Green-Roomz owns inference lifecycle, not durable cognitive memory.
2. Green-Zkillz binding grants no authority by itself.
3. Sentinel observation does not authorize Warden effects.
4. Cognitive attention cannot cross security or identity boundaries.
5. Green-Fleetz remains a planning boundary until its swarm and host ownership
   are jointly specified.
