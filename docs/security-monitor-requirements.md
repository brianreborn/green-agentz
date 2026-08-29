# Green-Roomz security-monitor microkernel

**Status:** requirements (locked in discussion 2026-08-28 PT)  
**Normative language:** RFC 2119 (`MUST`, `MUST NOT`, `SHOULD`, `MAY`)  
**Glossary:** *kernel* means a monitor module, not a CUDA launch. *Stream* means a CUDA (or vendor) copy/compute stream.

## 1. Scope

### 1.1 In scope
Userspace (and later PQFreeBSD) security monitors for green-roomz nodes: desktop (qodesh, shalom) and Android (stock Galaxy Note 9 first, rooted Pixel 8 + KernelSU later). Same mailbox federation on every node.

### 1.2 Out of scope (this project)
- Custom RPC, protobuf, IDL, or Cap’n Proto
- Implementing UEFI or reflashing firmware NTP (PQFreeBSD)
- Yarrow; a second RNG mixer
- Hardware-fault repair via reboot (TODO later)
- Wipe-algorithm recipes
- Wiring `reboot` / `secure_reboot` inside the green-roomz 8080 process
- CUDA 6.5 / sm_1.1 llama; GGUFs on the 8600 GT
- Big GGUFs on Android (no 4B/7B/VL). At most 0.5B router later
- Parking a resident detector as a CUDA launch on GPU SMs

## 2. IPC

1. The only IPC SHALL be the existing mailbox envelope.  
   Fields: `seq`, `kind`, `source`, `ticket`, `ts`, `payload`, `target` (`machine` | `ifX` | `all-nics`).
2. Unique identifiers (`ticket`, enroll id, `boot-id`, `seq`) MUST be 64-bit values. On sm_1.1, `seq` MUST be two 32-bit words `{hi, lo}` with `lo` the ring atomic. Ring index wrap MUST NOT be treated as identity.
3. Ring algorithms MUST be 32-bit lock-free (`atomicAdd` and/or Lamport SPSC). Implementations MUST NOT require 64-bit atomics.
4. Slots SHOULD be 16-byte aligned, power-of-two capacity. Fat payloads MUST be replaced by a hash.
5. Inter-monitor communication MUST be copy-only. Shared mappings and a common heap MUST NOT be used.
6. GPU path MUST work on Tesla sm_1.1 through modern SMs: global 32-bit atomic plus `threadfence_system` on mapped pinned host memory, or `cudaMemcpyAsync` / the 1.1 copy engine into a private slot.
7. Drain MUST be broadcast (listeners do not steal). `push` MUST be non-blocking. The hot ring MAY drop-oldest when full except as in §2.8.
8. Pre-approved upcalls MUST use dedicated small slots so drop-oldest on the hot ring cannot erase them.
9. Path: GPU copy → OS waitable fd (or syscall) → green-roomz poll. Hardware-direct MAY be used if there is no OS. Management VLAN or configured side-channel MUST be used; worker data plane MUST NOT.
10. NTP samples, if posted, MUST be one `post` with many listeners. They MUST NOT be flooded onto the GPU ring.

## 3. Upcalls

1. Monitors MUST issue upcalls into green-roomz with `post` / `wait` / `reply` only.
2. Envelope: `{kind: upcall, ticket, payload: {agent, op}}`.
3. green-roomz poll IS `wait`. If `op` is on a pre-approved allowlist, the agent SHALL run and `reply`; otherwise `reject`.
4. Pre-approved MUST mean a fixed allowlist (config or policy `label`), not a method name invented at runtime.

## 4. Duties and trusted calls

Each module MUST export a tiny call set, not POSIX. Workers and SAD cores MUST `post` grades; they MUST NOT invoke respond calls directly.

| Call | Owner | Allowed callers |
| --- | --- | --- |
| `post` | IPC | workers, GPU gate, every monitor, green-roomz |
| `wait` | IPC | ticket owner |
| `reply` | IPC | handler of that ticket |
| `emit` | logger | IPC (auto), any monitor |
| `read` | logger | admin, respond (assist) |
| `check` | policy | IPC on hops, SAD |
| `label` | policy | isolate, IPC |
| `map` `unmap` `grant` | isolate | place, respond (on lockdown) |
| `bind` `yield` | place | IPC / scheduler |
| `begin` `end` | gate | GPU worker via IPC |
| `down` `up` | network | SAD/policy via `post` (user map) |
| `freeze` `thaw` | network or respond (`target`) | same as `down` |
| `sleep` `wake` | network or place (APM) | same |
| `reset` | network or respond | not logger, NTP, entropy |
| `halt` | respond or network | voted or mapped threat |
| `snapshot` | OS via IPC | from `up` or `frozen` only |
| `lockdown` | respond | **respond after vote only** |
| `reboot` | respond | **respond after majority vote** |
| `secure_reboot` | respond | **respond after majority; overrides reject** |
| entropy credit | entropy | sniffer + voluntary feed (never raw bits on the ring) |

`lockdown`, `reboot`, and `secure_reboot` MUST NOT be callable by SAD, workers, logger, or the 8080 process.

## 5. State graph

Not any-to-any. Same graph for `target=machine` and `target=ifX`.

- `up` ↔ `down` (admin)
- `freeze` ↔ `thaw` only from `up` (forensic; RAM/DMA held)
- `sleep` ↔ `wake` only from `up` (APM)
- `freeze` ↔ `sleep` MUST NOT exist
- `halt` from `up`/`down`/`frozen`/`sleep`; only exit is `reset` then `down`
- `reset` from any state except mid-`reset`; then `down`
- `snapshot` is an **action** from `up` or `frozen`, not a state
- Highest-grade `secure_reboot` bypasses this graph

Reject SHALL be `{kind: reject, from, to, reason}` on the same ticket, idempotent, logged, not voted. Only `secure_reboot` MAY override a reject.

Network semantics:

- `freeze`: DMA/queue freeze; IFF_UP MAY stay
- `sleep`: NIC APM; ring activity 0
- `reset`: actual driver/firmware/bus reset
- `down` / `up`: IFF_UP (this IS `ifconfig ifX down` / `up`). MUST NOT be aliased to freeze
- Carrier loss is IFF_RUNNING, distinct
- `halt` of an if is detach/destroy

## 6. Isolation and respond

1. Isolate is not automatically shutdown. The user MUST be able to map isolate per threat to: network `down`, `freeze`, encrypt volumes, `lockdown`, `halt`, or `secure_reboot`.
2. `lockdown` SHALL fail-closed hops, park GPU gate, drop new work, and securely wipe **swap (or zram) and unused filesystem space**.
3. `secure_reboot` SHALL wipe RAM then reset. It is the **default** at the highest breach grade.
4. `freeze` preserves RAM (forensic). `sleep` is OS/APM.
5. Snapshot-then-`freeze` is the forensic order. Snapshot-then-`secure_reboot` SHOULD NOT be the default.
6. Hardware-fault repair via partial reboot is a later TODO.
7. These respond calls MUST live outside 8080 so a compromised gateway cannot panic the box.

## 7. Identity and audit

1. Calls MUST snapshot identity idempotently onto the envelope: pid, tid, creation time, boot-id, parent pid+start, jail/prison, auid vs euid, optional caller vnode generation, monotonic + wall clock, OS-volunteered ring/CPL (missing = user), Capsicum-style rights mask.
2. Passwords, tokens, cookies, and keys MUST NOT appear in the payload.
3. Same ticket MUST yield the same snapshot with no extra side effects.
4. Enabling custom audit is an extra listener, not a new scrape.
5. Logger is a dedicated append-only hash-chained sink, NOT the 256-slot hot ring. No `lockdown`/`reboot` rights. Fail-open if disk full. Log flood MUST NOT starve voters.
6. Admins are recognized **only** from OS creds on the envelope (`uid 0` / `wheel` / Windows admin / `AID_ROOT`). No separate monitor login. Extra ability: `read`, enable audit, edit threat-to-action map, `up`/`down`/`snapshot`. Not a shell. Not solo `secure_reboot`.

## 8. Cores, SAD, federation

1. Floor (do not steal): llama/GPU gate, IPC, logger, Fortuna, network, respond voters. NTP is the **OS** (w32time/ntpd); there is no NTP monitor core.
2. Leftover cores SHALL be allocated to diverse suspicious-activity-detection (SAD) cores (slightly different algorithms and views). SAD shrinks before the floor does.
3. SAD is first-order **network** defense (before llama/GPU). Default grades: watch/log, quarantine (`down`), stop (`lockdown`/`freeze`), wipe (`secure_reboot`). User maps each threat kind onto those verbs.
4. Each monitor SHOULD run on 1 core (2 if busy). Critical modules (respond, and policy if treated as critical) MUST default to 3 replicas and majority-vote (fuzzy-or/median for lockdown; majority for reboot). Slightly different algorithms. Vote is three `post`s of the same ticket, not shared state.
5. qodesh (Athlon II X2) SHALL use 1+1 (llama vs one monitor slice), not the 11–14 core blueprint. Note 9 (8 cores) MAY host SAD leftover; thermal MUST cap SAD.
6. No single node going down MAY defeat federation security. Votes among live peers only. Local `secure_reboot` MUST NOT wait on WAN. Dark region MUST NOT reboot live nodes. Logger / OS-NTP / entropy fail-open. Enroll issued by remaining peers, not one CA.
7. Machine identity is **peer-issued at enroll**, not MAC/hostname/disk UUID/SSH keys. Clone (same claimed id, different boot-id) forces re-enroll and revokes the old id. Duplicate MAC is a network-ring threat, not identity. Join uses boot-id plus peer nonce.

## 9. Entropy

1. One Fortuna core, CPU only, not on the 8600, not Yarrow, not one-of-each.
2. Sources: IRQ timing, mgmt-path NIC timestamps, GPU seq jitter, voluntary feed. Not worker packet payloads.
3. Mix locally. Mailbox carries credit/hash, never raw bits.
4. After first seed, never block. Unseeded only delays enroll. MUST NOT `secure_reboot` for entropy starvation.
5. Seed MUST NOT live only on a cloned disk image.

## 10. What may use GPU streams

**May:** gate `begin`/`end` around conv, mailbox copies, a time sample already in a slot.  
**MUST NOT** as a CUDA launch on SMs: respond, isolate, place, logger, Fortuna, NTP, network sockets, resident SAD.

NTP: OS owns it. Do not pin an SNTP thread. Do not put ntpd on the GPU. Do not reprogram UEFI for NTP.

## 11. Android

1. Same envelope, verbs, floor-then-SAD, vote, Fortuna-on-CPU, OS NTP, post/wait upcalls.
2. First platform: **stock Galaxy Note 9 + ADB** (unrooted). No `AID_ROOT` ⇒ no `secure_reboot`/`wipe`/`map`. ADB is mgmt (`adb reverse` to sidecar `:8199`). Android 10 ⇒ no AvF; Termux or adb+static node for gateway. Fingerprint SoC via sidecar; do not assume Snapdragon vs Exynos. Do not trip Knox.
3. First cut MUST use GPU in the **sidecar APK** (Vulkan/NNAPI). Node only `wait`s. No CUDA. qodesh “no Vulkan for llama” does not apply to the phone. Termux SHOULD NOT be expected to open `kgsl`/`mali`.
4. No big GGUFs on Android.
5. Later: rooted **Pixel 8 + KernelSU** — `AID_ROOT` verbs, cpuset, GPU nodes from Linux env. Titan M2/TEE still out of reach.
6. zram instead of swap for lockdown wipe. Thermal MUST cap SAD.

## 12. Performance constraints (qodesh)

- Two cores: keep 0.5B at `--threads 1` when a monitor slice is up.
- Do not busy-poll the fd (kqueue / IOCP).
- SAD MUST sample the network, not sit inline on every packet.
- 8600: one copy engine, PCIe 1.1 ~1.3 GB/s; hashes only on the mailbox.
- Gate `begin`/`end` MUST NOT wait on a vote.
- Logger async off the hot ring.
- Regional vote MUST NOT stall a local hop.

## 13. Platforms (context)

| Node | Role |
| --- | --- |
| qodesh | Win11, Athlon II X2, 8600 GT sm_1.1, 16 GB. CUDA streams for conv/GEMM. CPU llama. 1+1 cores. |
| shalom | Win, 7520U APU. CPU llama. Federation peer. |
| Note 9 | Stock, ADB, sidecar Vulkan first cut, no big models. |
| Pixel 8 | Later, KernelSU. |
