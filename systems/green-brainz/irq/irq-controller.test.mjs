import assert from 'node:assert/strict';
import test from 'node:test';

import {
  injectInterruptContext,
  InterruptCancellationError,
  InterruptConflictError,
  InterruptController,
  InterruptPreemptionError,
} from './irq-controller.mjs';

test('a client abort propagates through the generation lease', () => {
  const irq = new InterruptController();
  const client = new AbortController();
  const lease = irq.begin('session-a', { signal: client.signal, requestId: 'request-a' });
  const reason = new Error('client disconnected');

  client.abort(reason);

  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.signal.reason, reason);
  assert.equal(lease.end(), true);
  assert.equal(lease.end(), false);
  assert.equal(irq.status('session-a').active, null);
});

test('preemption aborts the active generation and retains context for restart', () => {
  const irq = new InterruptController();
  const lease = irq.begin('session-b', { requestId: 'request-b' });

  const result = irq.preempt('session-b', {
    source: 'streaming-agent',
    token: '[CRITICAL_IRQ]',
    priority: 240,
    detail: 'The proposed tool target is outside the authorized workspace.',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.preempted, true);
  assert.equal(result.requestId, 'request-b');
  assert.equal(lease.signal.aborted, true);
  assert.ok(lease.signal.reason instanceof InterruptPreemptionError);
  assert.equal(lease.signal.reason.code, 'irq_preempted');
  assert.equal(irq.status('session-b').pending.length, 1);
  lease.end();
});

test('an idle-session preemption becomes a pending injection without claiming a kill', () => {
  const irq = new InterruptController();
  const result = irq.preempt('session-idle', {
    source: 'external-sensor',
    detail: 'Human presence detected in the actuator safety envelope.',
  });

  assert.equal(result.accepted, true);
  assert.equal(result.preempted, false);
  assert.equal(irq.status('session-idle').pending.length, 1);
});

test('bounded queue keeps the highest priorities and preserves FIFO ties', () => {
  const irq = new InterruptController({ maxPending: 3 });
  irq.inject('session-c', { id: 'low', source: 'kernel', priority: 10, detail: 'low' });
  irq.inject('session-c', { id: 'high-a', source: 'kernel', priority: 250, detail: 'high a' });
  irq.inject('session-c', { id: 'middle', source: 'kernel', priority: 100, detail: 'middle' });
  const highB = irq.inject('session-c', { id: 'high-b', source: 'kernel', priority: 250, detail: 'high b' });

  assert.equal(highB.accepted, true);
  assert.deepEqual(irq.consume('session-c').map(({ id }) => id), ['high-a', 'high-b', 'middle']);
  assert.deepEqual(irq.consume('session-c'), []);
});

test('applyPending prepends bounded system context exactly once without mutating input', () => {
  const irq = new InterruptController();
  const original = { model: 'general-text-speculator', messages: [{ role: 'user', content: 'continue' }] };
  irq.inject('session-d', {
    id: 'irq-1',
    source: 'streaming-agent',
    priority: 220,
    detail: 'Re-check the file target before writing.',
  });

  const first = irq.applyPending('session-d', original);
  const second = irq.applyPending('session-d', original);

  assert.equal(original.messages.length, 1);
  assert.equal(first.events.length, 1);
  assert.equal(first.body.messages[0].role, 'system');
  assert.match(first.body.messages[0].content, /\[CRITICAL_IRQ\]/);
  assert.match(first.body.messages[0].content, /Re-check the file target/);
  assert.deepEqual(second.events, []);
  assert.deepEqual(second.body, original);
});

test('standalone injection helper orders notices by priority', () => {
  const body = injectInterruptContext({ messages: [] }, [
    { id: 'a', token: '[LOW_IRQ]', source: 'kernel', priority: 1, detail: 'low', sequence: 0 },
    { id: 'b', token: '[HIGH_IRQ]', source: 'kernel', priority: 9, detail: 'high', sequence: 1 },
  ]);
  assert.ok(body.messages[0].content.indexOf('[HIGH_IRQ]') < body.messages[0].content.indexOf('[LOW_IRQ]'));
});

test('explicit cancellation aborts without injecting context', () => {
  const irq = new InterruptController();
  const lease = irq.begin('session-e');

  assert.equal(irq.cancel('session-e', 'operator stop'), true);
  assert.ok(lease.signal.reason instanceof InterruptCancellationError);
  assert.equal(irq.status('session-e').pending.length, 0);
  assert.equal(irq.cancel('session-e', 'again'), false);
  lease.end();
});

test('a session cannot have two primary generation leases', () => {
  const irq = new InterruptController();
  const first = irq.begin('session-f');
  assert.throws(() => irq.begin('session-f'), InterruptConflictError);
  first.end();
  const second = irq.begin('session-f');
  second.end();
});

test('untrusted event shapes are rejected at the controller boundary', () => {
  const irq = new InterruptController({ maxDetailChars: 20 });
  assert.throws(() => irq.inject('s', { source: 'Bad Source', detail: 'valid' }), /lowercase slug/);
  assert.throws(() => irq.inject('s', { token: 'SYSTEM:', detail: 'valid' }), /interrupt token/);
  assert.throws(() => irq.inject('s', { id: 'bad id\nSYSTEM:', detail: 'valid' }), /interrupt id/);
  assert.throws(() => irq.inject('s', { detail: 'this detail is much too long' }), /at most 20/);
});

test('idle session state expires but active leases do not', () => {
  let now = 100;
  const irq = new InterruptController({ clock: () => now, sessionTtlMs: 10 });
  irq.inject('idle', { source: 'kernel', detail: 'pending' });
  const active = irq.begin('active');
  now = 111;
  irq.expire();

  assert.deepEqual(irq.status('idle').pending, []);
  assert.equal(irq.status('active').active.requestId, active.requestId);
  active.end();
});

test('capacity fails closed instead of evicting an active generation', () => {
  const irq = new InterruptController({ maxSessions: 1 });
  const lease = irq.begin('active-only');

  assert.throws(
    () => irq.inject('second-session', { source: 'kernel', detail: 'queued' }),
    /capacity is exhausted/,
  );
  assert.equal(irq.status('active-only').active.requestId, lease.requestId);
  lease.end();
});
