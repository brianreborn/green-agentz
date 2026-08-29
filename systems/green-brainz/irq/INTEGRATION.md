# Green-Roomz Integration Seams (No Source Changes Applied)

The current tree already carries `request.abortSignal` through the relevant
paths. The smallest integration is to construct one `InterruptController` in
the Green-Roomz composition root and add an optional `interrupts` dependency to
`Gateway`.

## Generation lease

After `handleDirectAlias` or `handleChatTurn` has an `issuedSession`, create a
lease and pass `lease.signal` anywhere that currently receives
`request.abortSignal`:

```js
const lease = this.interrupts.begin(issuedSession, {
  signal: request.abortSignal,
});
try {
  // apply pending context before prepareInferenceBody/consultNexus
  // pass lease.signal to policy.acquire, ensure, consultNexus, peek, and proxy
} finally {
  lease.end();
}
```

This seam covers:

- `gateway.mjs`: policy admission, Nexus consultation, native fetch,
  specialist peek, resident completion, and `proxyJson`.
- `nexus.mjs`: `consultNexus` -> `postNexus` -> `fetchImpl` already accepts a
  signal.
- `process-manager.mjs`: `ensure`, `start`, `startProfile`, and readiness sleep
  already accept a signal. An IRQ abort during cold start stops only the newly
  owned start attempt; ready resident processes remain alive.
- `proxy.mjs`: `proxyJson` already supplies the signal to fetch and retry sleep.

Do not overwrite `request.abortSignal`; keeping a separate lease makes the
request/client signal and the kernel IRQ signal independently observable.

## Context application

Call `interrupts.applyPending(issuedSession, body)` before preparing a backend
payload. Use the returned body for both Nexus trajectory evaluation and the
selected model so that routing does not ignore critical context. Emit only IRQ
IDs/tokens/priorities in monitor observations.

For an internal non-streaming retry, retain the original body, catch an abort
whose signal reason has `code === 'irq_preempted'`, end the old lease, apply
pending context, create a new lease, and dispatch at most once. Do not retry a
stream after response bytes have been written.

## Trusted control plane

Expose `preempt`, `inject`, and `cancel` only to an authenticated internal
kernel/Streaming Agent adapter. The public OpenAI-compatible request body and
the current logical monitor endpoint are not an IRQ authority. The gateway's
current rights mask permits post/observe/snapshot but not lockdown/reboot; this
candidate does not broaden those rights.

## Session lifecycle

The Green-Roomz `SessionLedger` owns identity binding and public session
validity. The IRQ controller deliberately does not duplicate authentication.
The adapter must validate the session in the ledger before raising an IRQ. Its
TTL and capacity should normally match `SessionLedger` (`1 hour`, `2048`).
