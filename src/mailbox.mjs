import { createHash } from 'node:crypto';

/**
 * Mailbox envelope (PQ-style). Same shape for this Node ring, a future CUDA
 * mapped ring, and a PQFreeBSD MAC monitor — producers speak this, not a GGUF:
 *
 * {
 *   seq:     number,            // monotonic publish sequence
 *   kind:    string,            // success | agent_unavailable | route_exhausted | ...
 *   source:  string,            // effectiveAlias or producer id
 *   ticket:  string,            // session / correlation id
 *   ts:      number,            // Date.now()
 *   payload: object | string    // small object, or sha256 hex if a long string
 * }
 *
 * SPSC by default (one producer, one drainer). MPSC is the same envelope:
 * additional producers just call push(); JS serializes them. Extra monitors
 * register via onEvent() and see every drained slot (broadcast, not steal).
 * push() is non-blocking: drop-oldest when full, return immediately, never
 * wait for drain. Drain runs on setImmediate so the user path is not stalled.
 */

function nextPow2(n) {
  const v = Math.max(2, Number(n) || 2);
  return 1 << Math.ceil(Math.log2(v));
}

function clonePayload(payload) {
  if (payload == null) return {};
  if (typeof payload === 'string') {
    if (payload.length <= 256) return payload;
    return createHash('sha256').update(payload).digest('hex');
  }
  if (typeof payload === 'object' && !Array.isArray(payload)) return { ...payload };
  return payload;
}

export class Mailbox {
  constructor({ capacity = 256, recentLimit = 64, onEvent, autoDrain = true } = {}) {
    this.capacity = nextPow2(capacity);
    this.mask = this.capacity - 1;
    this.slots = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.seq = 0;
    this.pushed = 0;
    this.dropped = 0;
    this.drained = 0;
    this.autoDrain = autoDrain !== false;
    this.listeners = [];
    if (typeof onEvent === 'function') this.listeners.push(onEvent);
    this.recentLimit = Math.max(1, Number(recentLimit) || 64);
    this.recentBuf = [];
    this._drainScheduled = false;
  }

  onEvent(fn) {
    if (typeof fn !== 'function') return () => {};
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== fn);
    };
  }

  stats() {
    return {
      capacity: this.capacity,
      size: this.size,
      pushed: this.pushed,
      dropped: this.dropped,
      drained: this.drained,
      seq: this.seq,
      listeners: this.listeners.length,
    };
  }

  recent(limit = this.recentLimit) {
    const n = Math.max(0, Math.min(this.recentBuf.length, Number(limit) || this.recentLimit));
    return this.recentBuf.slice(-n).map((event) => ({ ...event, payload: event.payload }));
  }

  push(partial = {}) {
    const event = {
      seq: this.seq + 1,
      kind: String(partial.kind ?? ''),
      source: String(partial.source ?? ''),
      ticket: String(partial.ticket ?? ''),
      ts: Number.isFinite(partial.ts) ? Number(partial.ts) : Date.now(),
      payload: clonePayload(partial.payload),
    };
    if (this.size === this.capacity) {
      this.tail = (this.tail + 1) & this.mask;
      this.size -= 1;
      this.dropped += 1;
    }
    this.slots[this.head] = event;
    this.head = (this.head + 1) & this.mask;
    this.size += 1;
    this.seq = event.seq;
    this.pushed += 1;
    this.recentBuf.push(event);
    if (this.recentBuf.length > this.recentLimit) this.recentBuf.splice(0, this.recentBuf.length - this.recentLimit);
    if (this.autoDrain) this._scheduleDrain();
    return { ok: true, seq: event.seq, dropped: this.dropped, size: this.size };
  }

  drain(callback) {
    const out = [];
    const listeners = typeof callback === 'function' ? [callback, ...this.listeners] : this.listeners;
    while (this.size > 0) {
      const event = this.slots[this.tail];
      this.slots[this.tail] = undefined;
      this.tail = (this.tail + 1) & this.mask;
      this.size -= 1;
      this.drained += 1;
      out.push(event);
      for (const listener of listeners) {
        try { listener(event); } catch {}
      }
    }
    return out;
  }

  _scheduleDrain() {
    if (this._drainScheduled) return;
    this._drainScheduled = true;
    setImmediate(() => {
      this._drainScheduled = false;
      this.drain();
    });
  }
}
