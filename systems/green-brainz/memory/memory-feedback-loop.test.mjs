import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { DreamcatcherStore } from './dreamcatcher-memory.mjs';
import {
  EXPRESSIVE,
  MemoryFeedbackLoop,
  NAP_HINT_DRIVE,
  PHASES,
  STUTTER_PROTOCOL,
  SeizurePauseError,
  wrapPhase,
} from './memory-feedback-loop.mjs';

async function withLoop(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'green-mfl-'));
  try {
    const store = new DreamcatcherStore(directory, { clock: () => '2026-09-07T12:00:00.000Z' });
    await store.createBranch('main', 'shalom');
    const loop = new MemoryFeedbackLoop(store, { clock: () => '2026-09-07T12:00:00.000Z', ...options });
    await run(loop, store);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function impressKey(loop, key, { tags = [], value = key } = {}) {
  await loop.express('s1', { key, value, originatingAgentId: 'shalom', tags });
  const admitted = await loop.admit('s1', key, 'shalom');
  assert.equal(admitted.status, 'admitted');
  await loop.impress('s1', key, 'shalom', { branch: 'main' });
}

test('six phase indices wrap as a coordinate, not a forced clock', () => {
  assert.deepEqual(PHASES.map((_, i) => wrapPhase(i)), PHASES);
  assert.equal(wrapPhase(6), 'derivation');
  assert.equal(wrapPhase(-1), 'disintegration');
  assert.equal(EXPRESSIVE.partition, 'repression');
  assert.equal(EXPRESSIVE.containment, 'suppression');
});

test('attention cannot thaw containment', async () => {
  await withLoop(async (loop) => {
    await impressKey(loop, 'secret');
    await loop.fridge('s1', 'secret', 'shalom');
    await loop.freezer('s1', 'secret', 'shalom');
    await assert.rejects(() => loop.admit('s1', 'secret', 'shalom'), /expected derivation/);
    await assert.rejects(
      () => loop.reintegrate('s1', 'secret', 'shalom'),
      /not allowed/,
    );
    await loop.thaw('s1', 'secret', 'shalom');
    assert.equal(loop.phaseOf('secret'), 'partition');
  });
});

test('partitioned items are absent from ordinary recall and present in scoped recall', async () => {
  await withLoop(async (loop) => {
    await impressKey(loop, 'open');
    await impressKey(loop, 'hidden');
    await loop.fridge('s1', 'hidden', 'shalom');
    const ordinary = await loop.recallOrdinary('main', 'shalom', { limit: 10 });
    assert.deepEqual(ordinary.map((row) => row.record.key), ['open']);
    const scoped = await loop.recallScoped('main', 'shalom', { limit: 10, allowPartitioned: true });
    assert.deepEqual(scoped.map((row) => row.record.key).sort(), ['hidden', 'open']);
  });
});

test('containment is not deletion; release is a new event', async () => {
  await withLoop(async (loop, store) => {
    await impressKey(loop, 'held');
    await loop.fridge('s1', 'held', 'shalom');
    const freeze = await loop.freezer('s1', 'held', 'shalom');
    assert.equal(freeze.reason, 'freezer');
    assert.equal((await store.get('main', 'held')).value, 'held');
    assert.equal((await loop.recallOrdinary('main', 'shalom', { limit: 10 })).length, 0);
    const release = await loop.thaw('s1', 'held', 'shalom');
    assert.equal(release.reason, 'release');
    assert.notEqual(release.seq, freeze.seq);
  });
});

test('disintegration keeps provenance; wraparound derives a new key', async () => {
  await withLoop(async (loop, store) => {
    await impressKey(loop, 'old');
    await loop.fridge('s1', 'old', 'shalom');
    await loop.freezer('s1', 'old', 'shalom');
    await loop.disintegrate('s1', 'old', 'shalom');
    const parent = await store.get('main', 'old');
    assert.ok(parent.provenanceHash);
    assert.equal(loop.phaseOf('old'), 'disintegration');
    const wrap = await loop.wraparound('s1', 'old', 'shalom', { branch: 'main' });
    assert.equal(loop.phaseOf('old'), 'disintegration', 'parent is not resurrected');
    assert.equal(loop.phaseOf(wrap.derivedKey), 'derivation');
    assert.equal(wrap.remembered.record.originAgentHash, parent.originAgentHash);
    assert.notEqual(wrap.derivedKey, 'old');
  });
});

test('working-set overflow naps instead of dropping identity (fugue prevention)', async () => {
  await withLoop(async (loop) => {
    await loop.express('s1', { key: 'a', value: 'a', originatingAgentId: 'shalom' });
    await loop.express('s1', { key: 'b', value: 'b', originatingAgentId: 'shalom' });
    assert.equal((await loop.admit('s1', 'a', 'shalom')).status, 'admitted');
    const nap = await loop.admit('s1', 'b', 'shalom');
    assert.equal(nap.status, 'nap');
    assert.equal(nap.code, 'working_set_full');
    assert.equal(nap.reason, 'fugue_prevented');
    assert.equal(nap.hintDrive, NAP_HINT_DRIVE);
    assert.equal(loop.phaseOf('a'), 'attention');
    assert.equal(loop.phaseOf('b'), 'derivation');
    assert.equal(loop.workingSet('s1').items.length, 1);
  }, { attentionItemLimit: 1, attentionTokenBudget: 10_000 });
});

test('fr-fr-freezer stutter ladder: nap, fridge, freezer, seizure; goals survive', async () => {
  await withLoop(async (loop) => {
    await impressKey(loop, 'goal', { tags: ['goal'], value: 'keep-the-mission' });
    await impressKey(loop, 'looping', { value: 'say-it-again' });
    await loop.express('s1', { key: 'live', value: 'ws', originatingAgentId: 'shalom' });
    await loop.admit('s1', 'live', 'shalom');

    const action = { kind: 'tool', name: 'repeat' };
    const first = await loop.observeAction('s1', action, 'shalom');
    assert.equal(first.recovery, null);

    const nap = await loop.observeAction('s1', action, 'shalom');
    assert.equal(nap.recovery, 'nap');
    assert.equal(nap.protocol, STUTTER_PROTOCOL);
    assert.equal(loop.phaseOf('looping'), 'integration');

    const fridge = await loop.observeAction('s1', action, 'shalom');
    assert.equal(fridge.recovery, 'fridge');
    assert.equal(loop.phaseOf('looping'), 'partition');
    assert.equal(loop.phaseOf('goal'), 'integration');

    const freezer = await loop.observeAction('s1', action, 'shalom');
    assert.equal(freezer.recovery, 'freezer');
    assert.equal(loop.phaseOf('looping'), 'containment');
    assert.equal(loop.phaseOf('goal'), 'integration');

    const seizure = await loop.observeAction('s1', action, 'shalom');
    assert.equal(seizure.recovery, 'seizure');
    assert.equal(seizure.paused, true);
    assert.equal(loop.seized('s1'), true);
    assert.equal(loop.phaseOf('goal'), 'integration');
    await assert.rejects(() => loop.admit('s1', 'live', 'shalom'), SeizurePauseError);
  });
});

test('ABAB cycle is a loop: freezer without waiting for five identical hashes', async () => {
  await withLoop(async (loop) => {
    await impressKey(loop, 'path', { value: 'cycle' });
    await loop.observeAction('s1', { step: 'a' }, 'shalom');
    await loop.observeAction('s1', { step: 'b' }, 'shalom');
    await loop.observeAction('s1', { step: 'a' }, 'shalom');
    const hit = await loop.observeAction('s1', { step: 'b' }, 'shalom');
    assert.equal(hit.recovery, 'freezer');
    assert.equal(loop.phaseOf('path'), 'containment');
  });
});
