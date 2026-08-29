import { randomUUID } from 'node:crypto';

const TOKEN_PATTERN = /^\[[A-Z][A-Z0-9_]{0,62}\]$/;
const SOURCE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class InterruptConflictError extends Error {
  constructor(sessionId) {
    super(`Session ${sessionId} already has an active primary generation`);
    this.name = 'InterruptConflictError';
    this.code = 'irq_generation_conflict';
  }
}

export class InterruptPreemptionError extends Error {
  constructor(event) {
    super(`Generation preempted by ${event.token} from ${event.source}`);
    this.name = 'InterruptPreemptionError';
    this.code = 'irq_preempted';
    this.event = event;
  }
}

export class InterruptCancellationError extends Error {
  constructor(reason = 'cancelled') {
    super(`Generation cancelled: ${reason}`);
    this.name = 'InterruptCancellationError';
    this.code = 'irq_cancelled';
  }
}

function boundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function nonEmptyString(value, name, maximum) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`);
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!clean || clean.length > maximum) throw new TypeError(`${name} must contain at most ${maximum} characters`);
  return clean;
}

function assertSessionId(sessionId) {
  return nonEmptyString(sessionId, 'sessionId', 256);
}

function linkSignals(signals) {
  const controller = new AbortController();
  const listeners = [];
  const abortFrom = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };

  for (const signal of signals.filter(Boolean)) {
    if (!(signal instanceof AbortSignal)) throw new TypeError('signal must be an AbortSignal');
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    const listener = () => abortFrom(signal);
    signal.addEventListener('abort', listener, { once: true });
    listeners.push([signal, listener]);
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
      listeners.length = 0;
    },
  };
}

function normalizeEvent(input, sequence, clock, limits) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('interrupt must be an object');
  }
  const token = input.token ?? '[CRITICAL_IRQ]';
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new TypeError('interrupt token must look like [CRITICAL_IRQ]');
  }
  const source = input.source ?? 'kernel';
  if (typeof source !== 'string' || !SOURCE_PATTERN.test(source)) {
    throw new TypeError('interrupt source must be a lowercase slug');
  }
  const priority = boundedInteger(input.priority ?? 255, 'priority', 0, 255);
  const detail = nonEmptyString(input.detail, 'detail', limits.maxDetailChars);
  return Object.freeze({
    id: input.id == null
      ? randomUUID()
      : (typeof input.id === 'string' && ID_PATTERN.test(input.id)
        ? input.id
        : (() => { throw new TypeError('interrupt id contains unsupported characters'); })()),
    token,
    source,
    priority,
    detail,
    createdAt: clock(),
    sequence,
  });
}

function eventOrder(left, right) {
  return right.priority - left.priority || left.sequence - right.sequence;
}

export function injectInterruptContext(body, events, { maxEvents = 5 } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('body must be an object');
  boundedInteger(maxEvents, 'maxEvents', 1, 32);
  if (!Array.isArray(events) || events.length === 0) return { ...body };

  const selected = events.slice().sort(eventOrder).slice(0, maxEvents);
  const notices = selected.map((event) =>
    `${event.token} priority=${event.priority} source=${event.source} id=${event.id}\n${event.detail}`,
  );
  const message = Object.freeze({
    role: 'system',
    content: [
      'Green IRQ kernel notice. Re-evaluate the current task before taking another action.',
      ...notices,
    ].join('\n\n'),
  });
  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  return { ...body, messages: [message, ...messages] };
}

/**
 * Request-neutral cognitive interrupt controller.
 *
 * It owns no HTTP routes and no model processes. A gateway creates a generation
 * lease, passes lease.signal through its existing call graph, and always ends
 * the lease in a finally block. Trusted control-plane code may queue an IRQ or
 * preempt the active lease. Pending IRQ context is consumed exactly once by the
 * replacement or next generation.
 */
export class InterruptController {
  constructor({
    maxPending = 5,
    maxSessions = 2048,
    maxDetailChars = 1024,
    sessionTtlMs = 3_600_000,
    clock = Date.now,
  } = {}) {
    this.maxPending = boundedInteger(maxPending, 'maxPending', 1, 32);
    this.maxSessions = boundedInteger(maxSessions, 'maxSessions', 1, 65_536);
    this.maxDetailChars = boundedInteger(maxDetailChars, 'maxDetailChars', 1, 16_384);
    this.sessionTtlMs = boundedInteger(sessionTtlMs, 'sessionTtlMs', 1, Number.MAX_SAFE_INTEGER);
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.clock = clock;
    this.sessions = new Map();
    this.sequence = 0;
  }

  #state(sessionId, create = true) {
    const id = assertSessionId(sessionId);
    this.expire();
    let state = this.sessions.get(id);
    if (!state && create) {
      if (this.sessions.size >= this.maxSessions) this.#evictOldestIdle();
      if (this.sessions.size >= this.maxSessions) {
        throw new Error('IRQ session capacity is exhausted by active generations');
      }
      state = { active: null, pending: [], lastTouched: this.clock() };
      this.sessions.set(id, state);
    }
    if (state) state.lastTouched = this.clock();
    return state;
  }

  #evictOldestIdle() {
    let oldest;
    for (const [id, state] of this.sessions) {
      if (state.active) continue;
      if (!oldest || state.lastTouched < oldest.state.lastTouched) oldest = { id, state };
    }
    if (oldest) this.sessions.delete(oldest.id);
  }

  begin(sessionId, { signal, requestId = randomUUID(), priority = 0 } = {}) {
    const id = assertSessionId(sessionId);
    const state = this.#state(id);
    if (state.active) throw new InterruptConflictError(id);
    boundedInteger(priority, 'priority', 0, 255);
    const irqController = new AbortController();
    const linked = linkSignals([signal, irqController.signal]);
    const generation = {
      requestId: nonEmptyString(requestId, 'requestId', 128),
      priority,
      startedAt: this.clock(),
      irqController,
      signal: linked.signal,
      dispose: linked.dispose,
    };
    state.active = generation;

    let ended = false;
    return Object.freeze({
      requestId: generation.requestId,
      signal: generation.signal,
      end: () => {
        if (ended) return false;
        ended = true;
        generation.dispose();
        const current = this.sessions.get(id);
        if (current?.active === generation) current.active = null;
        if (current) current.lastTouched = this.clock();
        return true;
      },
    });
  }

  inject(sessionId, input) {
    const state = this.#state(sessionId);
    const event = normalizeEvent(input, this.sequence++, this.clock, {
      maxDetailChars: this.maxDetailChars,
    });
    state.pending.push(event);
    state.pending.sort(eventOrder);
    const retained = state.pending.slice(0, this.maxPending);
    const accepted = retained.includes(event);
    state.pending = retained;
    return { accepted, event };
  }

  preempt(sessionId, input) {
    const state = this.#state(sessionId);
    const queued = this.inject(sessionId, input);
    const active = state.active;
    const preempted = Boolean(queued.accepted && active && !active.signal.aborted);
    if (preempted) active.irqController.abort(new InterruptPreemptionError(queued.event));
    return { ...queued, preempted, requestId: preempted ? active.requestId : null };
  }

  cancel(sessionId, reason = 'cancelled') {
    const state = this.#state(sessionId, false);
    const active = state?.active;
    if (!active || active.signal.aborted) return false;
    active.irqController.abort(new InterruptCancellationError(nonEmptyString(reason, 'reason', 256)));
    return true;
  }

  consume(sessionId) {
    const state = this.#state(sessionId, false);
    if (!state?.pending.length) return [];
    const events = state.pending;
    state.pending = [];
    return events;
  }

  applyPending(sessionId, body) {
    const events = this.consume(sessionId);
    return { body: injectInterruptContext(body, events, { maxEvents: this.maxPending }), events };
  }

  status(sessionId) {
    const state = this.#state(sessionId, false);
    return {
      active: state?.active ? {
        requestId: state.active.requestId,
        priority: state.active.priority,
        startedAt: state.active.startedAt,
        aborted: state.active.signal.aborted,
      } : null,
      pending: state?.pending.map((event) => ({ ...event })) ?? [],
    };
  }

  expire() {
    const threshold = this.clock() - this.sessionTtlMs;
    for (const [id, state] of this.sessions) {
      if (!state.active && state.lastTouched <= threshold) this.sessions.delete(id);
    }
  }
}
