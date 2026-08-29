# Security Monitor Component Map

Status: visibility and integration index. This preserves the existing module
designs in Green-Roomz while the eventual Green-Shepherdz extraction and exact
Sentinel, Council, and Warden boundaries await joint review.

## Design sources

- [Security monitor requirements](security-monitor-requirements.md)
- [Security monitor audit](security-monitor-audit.md)
- `src/mailbox.mjs`: bounded non-blocking gateway event mailbox
- `src/monitor/`: capability-safe monitor kernel modules
- `test/monitor-*.test.mjs`, `test/mailbox.test.mjs`: executable invariants

## Provisional component boundaries

The component names describe responsibility, not privilege inheritance. No
rename or code move is implied by this map.

### Sentinel — observe and correlate

| Module | Visible design responsibility |
|---|---|
| `mailbox.mjs` | Non-blocking ingress, bounded retention, drop-oldest accounting |
| `monitor/logger.mjs` | Append-only, redacted, chained observations |
| `monitor/identity.mjs` | Secret-free identity snapshots |
| `monitor/ids.mjs` | Full logical sequence identity; ring index is never identity |
| `monitor/entropy.mjs` | In-memory entropy accumulation without cloned host seeds |
| `monitor/ipc.mjs` | Copy-only hot and upcall rings with independent overflow behavior |

Sentinel may observe and report. Observation alone grants no mutation or host
control capability.

### Council — evaluate and authorize

| Module | Visible design responsibility |
|---|---|
| `monitor/policy.mjs` | Capability-aware policy evaluation |
| `monitor/gate.mjs` | Deterministic transition gating and rejection |
| `monitor/states.mjs` | Legal monitor-state transitions |
| `monitor/calls.mjs` | Allowlisted call shapes and caller boundaries |

Council decisions must remain auditable. Quorum, replica membership, vote TTL,
and recovery semantics remain unresolved requirements and must not be simulated
by a single-process success path.

### Warden — mediate bounded effects

| Module | Visible design responsibility |
|---|---|
| `monitor/respond.mjs` | Validate response proposals; dangerous verbs remain bounded or rejected |
| `monitor/isolate.mjs` | In-memory capability maps and isolation decisions |
| `monitor/network.mjs` | Symbolic network actions with explicit v1 prohibitions |
| `monitor/place.mjs` | In-memory worker/core placement and yielding |

Warden is an effect boundary, not an unrestricted executor. Unsupported actions
must reject rather than report a false success.

### Shared façade

`monitor/api.mjs` exposes the monitor domain without collapsing the three
responsibilities into one authority. It must preserve caller identity,
capability checks, state legality, and copy-only IPC semantics.

## Cross-cutting invariants

1. Gateway inference traffic cannot acquire Shepherdz authority.
2. Missing capability bits reject; they never become silent no-ops.
3. Public payloads cannot invoke lockdown, reboot, secure reboot, volume
   encryption, or destructive memory operations.
4. Secrets do not enter identity snapshots, logs, mailbox events, or receipts.
5. Monitor-to-monitor exchange is copy-only; no common mapped host/GPU ring is
   introduced by convenience.
6. Full logical sequence IDs remain distinct from bounded ring occupancy.
7. Unsupported platform effects remain explicit stubs until their OS adapters,
   recovery behavior, and authorization requirements are specified and tested.

## Extraction gate

Before moving these modules into `systems/green-shepherdz`, jointly review:

- exact Sentinel/Council/Warden ownership for each module;
- replica and quorum model;
- vote identity, expiry, reconnect, and stale-vote handling;
- per-host effect adapters and recovery paths;
- the enrollment and clone boundary for the first node;
- how memory containment events are observed without granting cognitive recall;
- compatibility imports so Green-Roomz does not break during extraction.
