/**
 * Host loop that makes Grok/Roomz compact irrelevant: write-through impress
 * into Dreamcatcher, nap instead of dropping attention, idle green-dreamz
 * promotion, bounded recall for the next generation. Roomz imports this
 * via GREEN_BRAINZ_ROOT — do not copy this tree into green-roomz.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { InterruptController } from '../irq/irq-controller.mjs';
import { DreamcatcherStore, canonicalJson, sha256 } from '../memory/dreamcatcher-memory.mjs';
import {
  MemoryFeedbackLoop,
  NAP_HINT_DRIVE,
  STUTTER_PROTOCOL,
  estimateTokens,
} from '../memory/memory-feedback-loop.mjs';
import {
  IdleDriveScheduler,
  createDefaultDriveRegistry,
} from '../scheduler/scheduler.mjs';

export { InterruptController };
export { NAP_HINT_DRIVE, STUTTER_PROTOCOL };

export const DREAM_TASK_ID = 'dream-cycle';
export const DREAM_CAPABILITY = 'dreamcatcher:write';

export function resolveBrainzRoot(env = process.env, fromUrl = import.meta.url) {
  if (env.GREEN_BRAINZ_ROOT) return resolve(env.GREEN_BRAINZ_ROOT);
  return resolve(fileURLToPath(new URL('..', fromUrl))).replace(/[\\/]+$/, '');
}

export async function importBrainz(root = resolveBrainzRoot()) {
  const hostPath = join(root, 'host', 'cognitive-host.mjs');
  if (!existsSync(hostPath)) {
    throw new Error(`GREEN_BRAINZ_ROOT has no host/cognitive-host.mjs: ${root}`);
  }
  return import(pathToFileURL(hostPath).href);
}

export class CognitiveHost {
  #seq = 0;
  #store;
  #loop;
  #scheduler;
  #actorAgentId;
  #branch;
  #writeThrough;
  #recallLimit;
  #recallTokenBudget;

  constructor({
    store,
    loop,
    scheduler,
    actorAgentId,
    branch = 'main',
    writeThrough = true,
    recallLimit = 4,
    recallTokenBudget = 512,
  }) {
    if (!(store instanceof DreamcatcherStore)) throw new TypeError('store must be a DreamcatcherStore');
    if (!(loop instanceof MemoryFeedbackLoop)) throw new TypeError('loop must be a MemoryFeedbackLoop');
    if (!(scheduler instanceof IdleDriveScheduler)) throw new TypeError('scheduler must be an IdleDriveScheduler');
    if (typeof actorAgentId !== 'string' || !actorAgentId.trim()) {
      throw new TypeError('actorAgentId is required');
    }
    this.#store = store;
    this.#loop = loop;
    this.#scheduler = scheduler;
    this.#actorAgentId = actorAgentId;
    this.#branch = branch;
    this.#writeThrough = writeThrough !== false;
    this.#recallLimit = recallLimit;
    this.#recallTokenBudget = recallTokenBudget;
  }

  get store() {
    return this.#store;
  }

  get loop() {
    return this.#loop;
  }

  get scheduler() {
    return this.#scheduler;
  }

  get branch() {
    return this.#branch;
  }

  static async open({
    directory,
    actorAgentId = 'green-roomz',
    branch = 'main',
    writeThrough = true,
    attentionItemLimit = 8,
    attentionTokenBudget = 2048,
    recallLimit = 4,
    recallTokenBudget = 512,
    clock,
  } = {}) {
    if (typeof directory !== 'string' || !directory.trim()) {
      throw new TypeError('directory is required');
    }
    const store = new DreamcatcherStore(directory, clock ? { clock } : {});
    await store.init();
    try {
      await store.createBranch(branch, actorAgentId);
    } catch (error) {
      if (!String(error?.message ?? '').includes('already exists')) throw error;
    }
    const loop = new MemoryFeedbackLoop(store, {
      clock: clock ?? (() => new Date().toISOString()),
      attentionItemLimit,
      attentionTokenBudget,
    });
    const registry = createDefaultDriveRegistry();
    registry.registerTask({
      id: DREAM_TASK_ID,
      driveId: NAP_HINT_DRIVE,
      kind: 'dream-cycle',
      requiredCapabilities: [DREAM_CAPABILITY],
      maxAttempts: 32,
      repeat: true,
      cooldownMs: 1,
    });
    const scheduler = new IdleDriveScheduler(registry);
    return new CognitiveHost({
      store,
      loop,
      scheduler,
      actorAgentId,
      branch,
      writeThrough,
      recallLimit,
      recallTokenBudget,
    });
  }

  async observeTurn({
    sessionId,
    text,
    action = { kind: 'chat' },
    tags = [],
    actorAgentId,
    writeThrough,
  }) {
    if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId is required');
    const actor = actorAgentId ?? this.#actorAgentId;
    const key = `turn:${sessionId}:${++this.#seq}:${sha256(canonicalJson({ text: text ?? '', action }))}`;
    const persist = writeThrough ?? this.#writeThrough;
    await this.#loop.express(sessionId, {
      key,
      value: { text: text ?? '', action },
      originatingAgentId: actor,
      tags,
    });
    let admitted = await this.#loop.admit(sessionId, key, actor);
    let dreamed = null;
    if (admitted.status === 'nap') {
      dreamed = await this.dream(sessionId, { queueDepth: 0, primaryActive: false });
      admitted = await this.#loop.admit(sessionId, key, actor);
      if (admitted.status === 'nap') {
        return {
          status: 'nap',
          key,
          protocol: STUTTER_PROTOCOL,
          hintDrive: NAP_HINT_DRIVE,
          dreamed,
          workingSet: this.#loop.workingSet(sessionId),
        };
      }
    }
    let impressed = null;
    if (persist && admitted.status === 'admitted') {
      impressed = await this.#loop.impress(sessionId, key, actor, { branch: this.#branch });
    }
    const stutter = await this.#loop.observeAction(sessionId, { ...action, seq: this.#seq }, actor);
    if (stutter.recovery === 'nap' && !dreamed?.promoted) {
      dreamed = await this.dream(sessionId, { queueDepth: 0, primaryActive: false });
    }
    return {
      status: impressed ? 'integrated' : admitted.status,
      key,
      admitted,
      impressed,
      stutter,
      dreamed,
      protocol: STUTTER_PROTOCOL,
    };
  }

  async dream(sessionId, state = null) {
    if (state && typeof state === 'object' && ('queueDepth' in state || 'primaryActive' in state)) {
      this.#scheduler.observeExternalState({
        queueDepth: state.queueDepth ?? 0,
        primaryActive: state.primaryActive ?? false,
      });
    }
    const promo = this.#scheduler.tryPromote({ capabilities: [DREAM_CAPABILITY] });
    if (!promo.promoted) return { ...promo, impressedKeys: [] };
    const impressedKeys = [];
    try {
      const items = this.#loop.workingSet(sessionId).items.filter((item) => item.phase === 'attention');
      for (const item of items) {
        await this.#loop.impress(sessionId, item.key, this.#actorAgentId, { branch: this.#branch });
        impressedKeys.push(item.key);
      }
      this.#scheduler.settle(promo.lease.id, 'succeeded');
      return { promoted: true, reason: 'dream-cycle', impressedKeys, leaseId: promo.lease.id };
    } catch (error) {
      this.#scheduler.settle(promo.lease.id, 'failed');
      throw error;
    }
  }

  async injectBoundedRecall(body, {
    readerAgentId,
    limit = this.#recallLimit,
    tokenBudget = this.#recallTokenBudget,
  } = {}) {
    const reader = readerAgentId ?? this.#actorAgentId;
    const rows = await this.#loop.recallOrdinary(this.#branch, reader, { limit });
    if (!rows.length) return { body, injected: 0, skipped: 'empty' };
    const lines = [];
    let tokens = 0;
    for (const row of rows) {
      const line = `${row.record.key}: ${canonicalJson(row.record.value)}`;
      const cost = estimateTokens(line);
      if (tokens + cost > tokenBudget) break;
      tokens += cost;
      lines.push(line);
    }
    if (!lines.length) return { body, injected: 0, skipped: 'token_budget' };
    const message = {
      role: 'system',
      content: [
        'Green integrated recall. Derived from Dreamcatcher; not first-hand origin.',
        ...lines,
      ].join('\n'),
    };
    const messages = Array.isArray(body?.messages) ? [...body.messages] : [];
    return { body: { ...body, messages: [message, ...messages] }, injected: lines.length, tokens };
  }

  noteExternalState({ queueDepth, primaryActive }) {
    return this.#scheduler.observeExternalState({ queueDepth, primaryActive });
  }
}
