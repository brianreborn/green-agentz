import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DreamcatcherStore,
  hashAgentId,
  verifyMemoryRecord,
  weightMemory,
} from './dreamcatcher-memory.mjs';

async function withStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'green-memory-'));
  try {
    const times = ['2026-08-29T12:00:00.000Z', '2026-08-29T12:00:01.000Z'];
    const store = new DreamcatcherStore(directory, { clock: () => times.shift() ?? '2026-08-29T12:00:02.000Z' });
    await run(store, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('fork is O(1) state sharing and later writes are copy-on-write', async () => {
  await withStore(async (store) => {
    await store.createBranch('shalom', 'shalom');
    await store.remember({
      branch: 'shalom',
      key: 'gateway-port',
      value: 8080,
      originatingAgentId: 'shalom',
    });

    const parentBefore = await store.inspectBranch('shalom');
    const fork = await store.forkBranch('shalom', 'green-child-session', 'green-child');
    assert.equal(fork.head, parentBefore.ref.head, 'fork shares the exact immutable commit');

    const sharedBefore = await store.reachableStateObjects('shalom');
    await store.remember({
      branch: 'green-child-session',
      key: 'local-runtime',
      value: 'llama.cpp',
      originatingAgentId: 'green-child',
    });
    const parentAfter = await store.inspectBranch('shalom');
    const childAfter = await store.inspectBranch('green-child-session');
    assert.equal(parentAfter.ref.head, parentBefore.ref.head, 'parent branch remains unchanged');
    assert.notEqual(childAfter.ref.head, parentAfter.ref.head, 'child gets a new commit');
    assert.equal((await store.get('shalom', 'local-runtime')), null);
    assert.equal((await store.get('green-child-session', 'gateway-port')).value, 8080);

    const childObjects = await store.reachableStateObjects('green-child-session');
    const sharedActiveObjects = [...sharedBefore].filter((hash) => childObjects.has(hash));
    assert.ok(sharedActiveObjects.length > 0, 'new active state reuses unaffected immutable objects');
  });
});

test('provenance binds normalized origin fingerprint and record content', async () => {
  await withStore(async (store, directory) => {
    await store.createBranch('main', 'shalom');
    const result = await store.remember({
      branch: 'main',
      key: 'identity',
      value: { host: 'shalom' },
      originatingAgentId: 'shalom',
      tags: ['identity'],
    });
    assert.equal(result.record.originAgentHash, hashAgentId('shalom'));
    assert.equal(verifyMemoryRecord(result.record), true);
    assert.equal(verifyMemoryRecord({ ...result.record, value: { host: 'qodesh' } }), false);

    const objectPath = join(directory, 'objects', result.memoryHash.slice(0, 2), `${result.memoryHash.slice(2)}.json`);
    const persisted = JSON.parse(await readFile(objectPath, 'utf8'));
    assert.equal('originatingAgentId' in persisted, false, 'raw agent identity is not persisted');
    assert.equal(persisted.originAgentHash, hashAgentId('shalom'));
  });
});

test('first-hand memories outrank equivalent inherited memories without relabeling', async () => {
  await withStore(async (store) => {
    await store.createBranch('shared', 'shalom');
    await store.remember({
      branch: 'shared',
      key: 'inherited-rule',
      value: 'from parent',
      originatingAgentId: 'green-parent',
    });
    await store.remember({
      branch: 'shared',
      key: 'lived-rule',
      value: 'observed here',
      originatingAgentId: 'shalom',
    });

    const recalled = await store.recall('shared', 'shalom', { limit: 2 });
    assert.deepEqual(recalled.map((item) => item.record.key), ['lived-rule', 'inherited-rule']);
    assert.equal(recalled[0].provenance, 'first-hand');
    assert.equal(recalled[0].score, 1);
    assert.equal(recalled[1].provenance, 'inherited');
    assert.equal(recalled[1].score, 0.6);
    assert.throws(
      () => weightMemory(recalled[1].record, 'shalom', { inheritedWeight: 1, firstHandWeight: 0.9 }),
      /must not exceed/,
    );
  });
});

test('queued eviction is deferred and flush establishes durability', async () => {
  await withStore(async (store) => {
    await store.createBranch('main', 'shalom');
    const queued = store.enqueueEviction({
      branch: 'main',
      key: 'evicted-constraint',
      value: 'keep localhost private',
      originatingAgentId: 'shalom',
    });
    const queuedSecond = store.enqueueEviction({
      branch: 'main',
      key: 'second-constraint',
      value: 'preserve enqueue order',
      originatingAgentId: 'shalom',
    });
    assert.match(queued.ticket, /^memory-\d+$/);
    assert.notEqual(queued.ticket, queuedSecond.ticket);
    await store.flush();
    assert.equal((await store.get('main', 'evicted-constraint')).value, 'keep localhost private');
    assert.equal((await store.get('main', 'second-constraint')).value, 'preserve enqueue order');
  });
});

test('recall is bounded and validates relevance scores', async () => {
  await withStore(async (store) => {
    await store.createBranch('main', 'shalom');
    for (const [key, salience] of [['a', 0.2], ['b', 0.9], ['c', 0.5]]) {
      await store.remember({ branch: 'main', key, value: key, salience, originatingAgentId: 'shalom' });
    }
    const recalled = await store.recall('main', 'shalom', { limit: 2 });
    assert.deepEqual(recalled.map((item) => item.record.key), ['b', 'c']);
    await assert.rejects(
      () => store.recall('main', 'shalom', { relevance: () => 2 }),
      /between 0 and 1/,
    );
  });
});
