import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CognitiveHost,
  DREAM_CAPABILITY,
  NAP_HINT_DRIVE,
  resolveBrainzRoot,
} from './cognitive-host.mjs';

async function withHost(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'green-host-'));
  try {
    const host = await CognitiveHost.open({
      directory,
      actorAgentId: 'shalom',
      clock: () => '2026-09-07T12:00:00.000Z',
      ...options,
    });
    await run(host, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('resolveBrainzRoot prefers GREEN_BRAINZ_ROOT and otherwise this tree', () => {
  const fromEnv = resolveBrainzRoot({ GREEN_BRAINZ_ROOT: 'C:/tmp/brainz' });
  assert.match(fromEnv.replaceAll('\\', '/'), /C:\/tmp\/brainz$/i);
  const local = resolveBrainzRoot({}).replaceAll('\\', '/').replace(/\/$/, '');
  assert.match(local, /systems\/green-brainz$/);
});

test('write-through observeTurn impresses so the working set does not hold the turn', async () => {
  await withHost(async (host) => {
    const result = await host.observeTurn({
      sessionId: 's1',
      text: 'record the try-out prompts',
      tags: ['goal'],
    });
    assert.equal(result.status, 'integrated');
    assert.equal(host.loop.workingSet('s1').items.length, 0);
    assert.equal(host.loop.phaseOf(result.key), 'integration');
    const recall = await host.loop.recallOrdinary('main', 'shalom', { limit: 5 });
    assert.equal(recall.length, 1);
    assert.equal(recall[0].record.key, result.key);
  });
});

test('working-set overflow naps, dream impresses, then the pending turn integrates', async () => {
  await withHost(async (host) => {
    const first = await host.observeTurn({
      sessionId: 's1',
      text: 'keep me in attention',
      writeThrough: false,
    });
    assert.equal(first.status, 'admitted');
    assert.equal(host.loop.workingSet('s1').items.length, 1);

    const second = await host.observeTurn({
      sessionId: 's1',
      text: 'another admit',
      writeThrough: true,
    });
    assert.equal(second.status, 'integrated');
    assert.equal(second.dreamed.promoted, true);
    assert.deepEqual(second.dreamed.impressedKeys, [first.key]);
    assert.equal(host.loop.phaseOf(first.key), 'integration');
    assert.equal(host.loop.phaseOf(second.key), 'integration');
  }, { attentionItemLimit: 1, attentionTokenBudget: 10_000 });
});

test('idle tryPromote requires dreamcatcher:write and an empty user queue', async () => {
  await withHost(async (host) => {
    host.noteExternalState({ queueDepth: 1, primaryActive: false });
    const busy = await host.dream('s1');
    assert.equal(busy.promoted, false);
    assert.equal(busy.reason, 'not-idle');

    await host.observeTurn({ sessionId: 's1', text: 'held', writeThrough: false });
    const dreamed = await host.dream('s1', { queueDepth: 0, primaryActive: false });
    assert.equal(dreamed.promoted, true);
    assert.equal(dreamed.impressedKeys.length, 1);
  });
});

test('bounded recall injects integrated items and skips fridge', async () => {
  await withHost(async (host) => {
    const open = await host.observeTurn({ sessionId: 's1', text: 'visible fact' });
    const hidden = await host.observeTurn({ sessionId: 's1', text: 'partition me' });
    await host.loop.fridge('s1', hidden.key, 'shalom');
    const { body, injected } = await host.injectBoundedRecall(
      { messages: [{ role: 'user', content: 'hello' }] },
      { readerAgentId: 'shalom' },
    );
    assert.equal(injected, 1);
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /not first-hand origin/);
    assert.match(body.messages[0].content, new RegExp(open.key));
    assert.doesNotMatch(body.messages[0].content, new RegExp(hidden.key));
    assert.equal(body.messages[1].content, 'hello');
  });
});

test('dream promotion is refused without dreamcatcher:write', async () => {
  await withHost(async (host) => {
    assert.equal(NAP_HINT_DRIVE, 'epigenetic-optimization');
    host.noteExternalState({ queueDepth: 0, primaryActive: false });
    assert.deepEqual(host.scheduler.tryPromote({ capabilities: [] }), {
      promoted: false,
      reason: 'no-eligible-task',
    });
    assert.equal(host.scheduler.tryPromote({ capabilities: [DREAM_CAPABILITY] }).promoted, true);
  });
});
