import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DriveRegistry,
  IdleDriveScheduler,
  createDefaultDriveRegistry,
} from './scheduler.mjs';

function fakeClock(initial = 1_000) {
  let now = initial;
  return {
    clock: () => now,
    advance: (milliseconds) => { now += milliseconds; },
  };
}

test('hierarchical drive rank deterministically precedes task priority', () => {
  const registry = new DriveRegistry();
  registry.registerDrive({ id: 'stability', rank: 0 });
  registry.registerDrive({ id: 'stability.recovery', parentId: 'stability', rank: 3 });
  registry.registerDrive({ id: 'dreaming', rank: 2 });
  registry.registerTask({ id: 'dream', driveId: 'dreaming', kind: 'dream', priority: -100 });
  registry.registerTask({ id: 'recover', driveId: 'stability.recovery', kind: 'repair', priority: 100 });

  assert.equal(registry.selectCandidate().id, 'recover');
});

test('disabled ancestor disables descendant work', () => {
  const registry = new DriveRegistry();
  registry.registerDrive({ id: 'parent' });
  registry.registerDrive({ id: 'child', parentId: 'parent' });
  registry.registerTask({ id: 'work', driveId: 'child', kind: 'work' });
  registry.setDriveEnabled('parent', false);

  assert.equal(registry.selectCandidate(), null);
});

test('task-local capabilities are required and are not supplied by drive membership', () => {
  const registry = createDefaultDriveRegistry();
  registry.registerTask({
    id: 'compact-memory',
    driveId: 'epigenetic-optimization',
    kind: 'dream-cycle',
    requiredCapabilities: ['dreamcatcher:write'],
  });

  assert.equal(registry.selectCandidate({ capabilities: [] }), null);
  assert.equal(
    registry.selectCandidate({ capabilities: ['dreamcatcher:write'] }).id,
    'compact-memory',
  );
});

test('scheduler promotes at most one opaque lease and never executes the payload', () => {
  const registry = createDefaultDriveRegistry();
  let executed = false;
  registry.registerTask({
    id: 'safe-work',
    driveId: 'task-fulfillment',
    kind: 'test',
    payload: { command: 'do-not-run' },
  });
  const scheduler = new IdleDriveScheduler(registry);

  assert.deepEqual(scheduler.tryPromote(), { promoted: false, reason: 'not-idle' });
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  const result = scheduler.tryPromote();

  assert.equal(result.promoted, true);
  assert.deepEqual(result.lease.task.payload, { command: 'do-not-run' });
  assert.equal(executed, false);
  assert.deepEqual(scheduler.tryPromote(), { promoted: false, reason: 'lease-active' });
});

test('external activity preempts an active idle lease and consumes finite budget', () => {
  const registry = createDefaultDriveRegistry();
  registry.registerTask({
    id: 'background',
    driveId: 'epigenetic-optimization',
    kind: 'dream',
    maxAttempts: 1,
  });
  const scheduler = new IdleDriveScheduler(registry);
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  const { lease } = scheduler.tryPromote();

  scheduler.observeExternalState({ queueDepth: 1, primaryActive: false });

  assert.equal(lease.signal.aborted, true);
  assert.equal(lease.signal.reason, 'external-activity');
  assert.equal(registry.snapshot().tasks[0].status, 'exhausted');
  assert.equal(scheduler.state().activeLease, null);
});

test('idle epoch budget prevents an uncontrolled promotion loop', () => {
  const registry = createDefaultDriveRegistry();
  registry.registerTask({ id: 'one', driveId: 'task-fulfillment', kind: 'work' });
  registry.registerTask({ id: 'two', driveId: 'task-fulfillment', kind: 'work' });
  const scheduler = new IdleDriveScheduler(registry, { maxPromotionsPerIdleEpoch: 1 });
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  const first = scheduler.tryPromote();
  scheduler.settle(first.lease.id, 'succeeded');

  assert.deepEqual(scheduler.tryPromote(), {
    promoted: false,
    reason: 'idle-epoch-budget-exhausted',
  });

  scheduler.observeExternalState({ queueDepth: 1, primaryActive: false });
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  assert.equal(scheduler.tryPromote().promoted, true);
});

test('repeating work has cooldown and a finite attempt budget', () => {
  const time = fakeClock();
  const registry = createDefaultDriveRegistry({ clock: time.clock });
  registry.registerTask({
    id: 'bounded-dream',
    driveId: 'epigenetic-optimization',
    kind: 'dream',
    repeat: true,
    maxAttempts: 2,
    cooldownMs: 500,
  });
  const scheduler = new IdleDriveScheduler(registry, {
    clock: time.clock,
    maxPromotionsPerIdleEpoch: 2,
  });
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  const first = scheduler.tryPromote();
  scheduler.settle(first.lease.id, 'succeeded');

  assert.deepEqual(scheduler.tryPromote(), { promoted: false, reason: 'no-eligible-task' });
  time.advance(500);
  const second = scheduler.tryPromote();
  scheduler.settle(second.lease.id, 'succeeded');
  assert.equal(registry.snapshot().tasks[0].status, 'completed');
});

test('lease expiry settles work without timers or recursive scheduling', () => {
  const time = fakeClock();
  const registry = createDefaultDriveRegistry({ clock: time.clock });
  registry.registerTask({
    id: 'expiring',
    driveId: 'system-stability',
    kind: 'probe',
    maxAttempts: 2,
    cooldownMs: 50,
  });
  const scheduler = new IdleDriveScheduler(registry, {
    clock: time.clock,
    leaseDurationMs: 100,
    maxPromotionsPerIdleEpoch: 2,
  });
  scheduler.observeExternalState({ queueDepth: 0, primaryActive: false });
  const { lease } = scheduler.tryPromote();
  time.advance(100);

  assert.equal(scheduler.state().activeLease, null);
  assert.equal(lease.signal.aborted, true);
  assert.equal(registry.snapshot().tasks[0].lastOutcome, 'expired');
});

test('payload and snapshots are clones rather than live mutable authority', () => {
  const registry = createDefaultDriveRegistry();
  const payload = { nested: { value: 1 } };
  registry.registerTask({
    id: 'clone',
    driveId: 'task-fulfillment',
    kind: 'inspect',
    payload,
  });
  payload.nested.value = 2;
  const selected = registry.selectCandidate();
  selected.payload.nested.value = 3;

  assert.equal(registry.snapshot().tasks[0].payload.nested.value, 1);
});

test('repeating tasks require a positive cooldown', () => {
  const registry = createDefaultDriveRegistry();
  assert.throws(() => registry.registerTask({
    id: 'spin',
    driveId: 'epigenetic-optimization',
    kind: 'bad-loop',
    repeat: true,
    maxAttempts: 2,
  }), /positive cooldownMs/);
});

