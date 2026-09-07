/**
 * Cognitive lifecycle on top of Dreamcatcher. Phase history is append-only.
 * Attention never thaws containment. Store records are not relabeled in place.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { DreamcatcherStore, canonicalJson, hashAgentId, sha256 } from './dreamcatcher-memory.mjs';

export const PHASES = Object.freeze([
  'derivation',
  'attention',
  'integration',
  'partition',
  'containment',
  'disintegration',
]);

export const EXPRESSIVE = Object.freeze({
  derivation: 'expression',
  attention: 'access',
  integration: 'impression',
  partition: 'repression',
  containment: 'suppression',
  disintegration: 'oppression',
});

/** fridge = partition, freezer = containment. Chant is the stutter ladder. */
export const STUTTER_LADDER = Object.freeze(['nap', 'fridge', 'freezer', 'seizure']);
export const STUTTER_PROTOCOL = 'fr-fr-freezer';
export const NAP_HINT_DRIVE = 'epigenetic-optimization';

const ALLOWED = Object.freeze(new Set([
  'derivation>attention',
  'attention>integration',
  'attention>derivation',
  'attention>partition',
  'integration>attention',
  'integration>partition',
  'partition>integration',
  'partition>containment',
  'containment>partition',
  'containment>disintegration',
]));

export function phaseIndex(phase) {
  const index = PHASES.indexOf(phase);
  if (index < 0) throw new TypeError(`unknown phase: ${phase}`);
  return index;
}

export function wrapPhase(n) {
  if (!Number.isInteger(n)) throw new TypeError('phase coordinate must be an integer');
  return PHASES[((n % 6) + 6) % 6];
}

export function estimateTokens(value) {
  return Math.max(1, Math.ceil(Buffer.byteLength(canonicalJson(value), 'utf8') / 4));
}

function assertSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new TypeError('sessionId is required');
  return sessionId;
}

function directionOf(from, to) {
  if (from === 'disintegration' && to === 'derivation') return 'wraparound';
  const delta = (phaseIndex(to) - phaseIndex(from) + 6) % 6;
  if (delta === 1) return 'forward';
  if (delta === 5) return 'reverse';
  return 'direct';
}

export class SeizurePauseError extends Error {
  constructor(sessionId) {
    super(`session ${sessionId} is in seizure pause`);
    this.name = 'SeizurePauseError';
    this.code = 'mfl_seizure';
    this.sessionId = sessionId;
  }
}

export class MemoryFeedbackLoop {
  #store;
  #seq = 0;
  #phase = new Map();
  #payload = new Map();
  #working = new Map();
  #touched = new Map();
  #stutter = new Map();
  #seized = new Set();
  #goals = new Set();
  #clock;
  #itemLimit;
  #tokenBudget;
  #hashWindow;

  constructor(store, {
    clock = () => new Date().toISOString(),
    attentionItemLimit = 8,
    attentionTokenBudget = 2048,
    hashWindow = 8,
  } = {}) {
    if (!(store instanceof DreamcatcherStore)) throw new TypeError('store must be a DreamcatcherStore');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.#store = store;
    this.#clock = clock;
    this.#itemLimit = attentionItemLimit;
    this.#tokenBudget = attentionTokenBudget;
    this.#hashWindow = hashWindow;
  }

  get store() {
    return this.#store;
  }

  phaseOf(key) {
    return this.#phase.get(key) ?? null;
  }

  seized(sessionId) {
    return this.#seized.has(sessionId);
  }

  workingSet(sessionId) {
    const set = this.#working.get(sessionId);
    if (!set) return { items: [], tokens: 0, itemLimit: this.#itemLimit, tokenBudget: this.#tokenBudget };
    const items = [...set.values()];
    return {
      items: items.map(({ key, tokens }) => ({ key, tokens, phase: this.#phase.get(key) })),
      tokens: items.reduce((sum, item) => sum + item.tokens, 0),
      itemLimit: this.#itemLimit,
      tokenBudget: this.#tokenBudget,
    };
  }

  async express(sessionId, { key, value, originatingAgentId, tags = [], salience = 1, confidence = 1 }) {
    this.#assertAwake(sessionId);
    if (this.#phase.has(key)) throw new Error(`key already in lifecycle: ${key}`);
    this.#payload.set(key, { value, originatingAgentId, tags, salience, confidence, tokens: estimateTokens(value) });
    if (tags.includes('goal')) this.#goals.add(key);
    this.#touch(sessionId, key);
    return this.#append({
      key,
      from: null,
      to: 'derivation',
      direction: 'forward',
      reason: 'express',
      actorAgentId: originatingAgentId,
      sessionId,
    });
  }

  async admit(sessionId, key, actorAgentId) {
    this.#assertAwake(sessionId);
    this.#requirePhase(key, 'derivation');
    const payload = this.#payload.get(key);
    const set = this.#ensureWorking(sessionId);
    const tokens = payload?.tokens ?? 1;
    const used = [...set.values()].reduce((sum, item) => sum + item.tokens, 0);
    if (set.size >= this.#itemLimit || used + tokens > this.#tokenBudget) {
      return {
        status: 'nap',
        reason: 'fugue_prevented',
        code: 'working_set_full',
        protocol: STUTTER_PROTOCOL,
        hintDrive: NAP_HINT_DRIVE,
        workingSet: this.workingSet(sessionId),
      };
    }
    set.set(key, { key, tokens });
    this.#touch(sessionId, key);
    const event = await this.#transition({
      key, to: 'attention', reason: 'admit', actorAgentId, sessionId,
    });
    return { status: 'admitted', event, workingSet: this.workingSet(sessionId) };
  }

  async impress(sessionId, key, actorAgentId, { branch }) {
    this.#assertAwake(sessionId);
    this.#requirePhase(key, 'attention');
    const payload = this.#payload.get(key);
    if (!payload) throw new Error(`no payload to impress: ${key}`);
    const remembered = await this.#store.remember({
      branch,
      key,
      value: payload.value,
      originatingAgentId: payload.originatingAgentId,
      writerAgentId: actorAgentId,
      salience: payload.salience,
      confidence: payload.confidence,
      tags: payload.tags,
    });
    this.#working.get(sessionId)?.delete(key);
    this.#touch(sessionId, key);
    const event = await this.#transition({
      key, to: 'integration', reason: 'impress', actorAgentId, sessionId,
    });
    return { status: 'integrated', event, remembered };
  }

  async fridge(sessionId, key, actorAgentId) {
    return this.#transition({
      key, to: 'partition', reason: 'fridge', actorAgentId, sessionId,
    });
  }

  async freezer(sessionId, key, actorAgentId) {
    return this.#transition({
      key, to: 'containment', reason: 'freezer', actorAgentId, sessionId,
    });
  }

  async thaw(sessionId, key, actorAgentId) {
    this.#assertAwake(sessionId);
    return this.#transition({
      key, to: 'partition', reason: 'release', actorAgentId, sessionId,
    });
  }

  async reintegrate(sessionId, key, actorAgentId) {
    this.#assertAwake(sessionId);
    return this.#transition({
      key, to: 'integration', reason: 'reintegrate', actorAgentId, sessionId,
    });
  }

  async disintegrate(sessionId, key, actorAgentId) {
    this.#assertAwake(sessionId);
    this.#working.get(sessionId)?.delete(key);
    return this.#transition({
      key, to: 'disintegration', reason: 'disintegrate', actorAgentId, sessionId,
    });
  }

  async wraparound(sessionId, key, actorAgentId, { branch }) {
    this.#assertAwake(sessionId);
    this.#requirePhase(key, 'disintegration');
    const parent = await this.#store.get(branch, key);
    if (!parent) throw new Error(`no durable parent for wraparound: ${key}`);
    const derivedKey = `${key}::derived:${this.#seq + 1}`;
    const remembered = await this.#store.remember({
      branch,
      key: derivedKey,
      value: { derivedFrom: [key], parentProvenance: parent.provenanceHash },
      originAgentHash: parent.originAgentHash,
      writerAgentId: actorAgentId,
      tags: ['mfl-derived'],
    });
    this.#payload.set(derivedKey, {
      value: remembered.record.value,
      originatingAgentId: actorAgentId,
      originAgentHash: parent.originAgentHash,
      tags: ['mfl-derived'],
      salience: 1,
      confidence: 1,
      tokens: estimateTokens(remembered.record.value),
    });
    const parentEvent = await this.#append({
      key,
      from: 'disintegration',
      to: 'disintegration',
      direction: 'wraparound',
      reason: 'wraparound-emit',
      actorAgentId,
      sessionId,
      derivedKey,
      parentKeys: [key],
    });
    await this.#append({
      key: derivedKey,
      from: null,
      to: 'derivation',
      direction: 'wraparound',
      reason: 'wraparound-derived',
      actorAgentId,
      sessionId,
      derivedKey,
      parentKeys: [key],
    });
    return { derivedKey, remembered, parentEvent };
  }

  /**
   * Deterministic stutter / cycle detector. Identical repeats climb
   * nap → fridge → freezer → seizure. ABAB cycles jump to freezer.
   */
  async observeAction(sessionId, action, actorAgentId) {
    const id = assertSession(sessionId);
    const hash = sha256(canonicalJson(action));
    const state = this.#stutter.get(id) ?? { last: null, run: 0, recent: [], recoveries: 0 };
    if (state.last === hash) state.run += 1;
    else {
      state.last = hash;
      state.run = 1;
    }
    state.recent = [...state.recent, hash].slice(-this.#hashWindow);
    this.#stutter.set(id, state);

    if (this.#seized.has(id)) {
      return { recovery: 'seizure', paused: true, protocol: STUTTER_PROTOCOL, hash };
    }

    const cycle = isCompressedCycle(state.recent);
    let step = null;
    if (cycle) step = state.recoveries >= 1 ? 'seizure' : 'freezer';
    else if (state.run >= 5) step = 'seizure';
    else if (state.run === 4) step = 'freezer';
    else if (state.run === 3) step = 'fridge';
    else if (state.run === 2) step = 'nap';

    if (!step) return { recovery: null, hash, protocol: STUTTER_PROTOCOL };

    state.recoveries += 1;
    const applied = await this.#applyRecovery(id, step, actorAgentId);
    return { recovery: step, protocol: STUTTER_PROTOCOL, hash, ...applied };
  }

  async recallOrdinary(branch, readerAgentId, options) {
    const rows = await this.#store.recall(branch, readerAgentId, options);
    return rows.filter((row) => {
      const phase = this.#phase.get(row.record.key);
      return phase === 'integration' || phase === 'attention' || phase == null;
    });
  }

  async recallScoped(branch, readerAgentId, { allowPartitioned = false, allowContained = false, ...options } = {}) {
    const rows = await this.#store.recall(branch, readerAgentId, options);
    return rows.filter((row) => {
      const phase = this.#phase.get(row.record.key) ?? 'integration';
      if (phase === 'containment') return allowContained === true;
      if (phase === 'partition') return allowPartitioned === true;
      if (phase === 'disintegration') return false;
      return true;
    });
  }

  #assertAwake(sessionId) {
    const id = assertSession(sessionId);
    if (this.#seized.has(id)) throw new SeizurePauseError(id);
    return id;
  }

  #requirePhase(key, expected) {
    const current = this.#phase.get(key);
    if (current !== expected) throw new Error(`key ${key} is ${current}, expected ${expected}`);
  }

  #ensureWorking(sessionId) {
    let set = this.#working.get(sessionId);
    if (!set) {
      set = new Map();
      this.#working.set(sessionId, set);
    }
    return set;
  }

  #touch(sessionId, key) {
    let set = this.#touched.get(sessionId);
    if (!set) {
      set = new Set();
      this.#touched.set(sessionId, set);
    }
    set.add(key);
  }

  #recoveryKeys(sessionId) {
    const episodic = this.#touched.get(sessionId) ?? new Set();
    const working = this.#working.get(sessionId) ?? new Map();
    return [...new Set([...episodic, ...working.keys()])].filter((key) => !this.#goals.has(key));
  }

  async #applyRecovery(sessionId, step, actorAgentId) {
    const working = this.#recoveryKeys(sessionId);
    if (step === 'nap') {
      return {
        status: 'nap',
        reason: 'stutter',
        hintDrive: NAP_HINT_DRIVE,
        preservedGoals: [...this.#goals],
      };
    }
    if (step === 'fridge') {
      const events = [];
      for (const key of working) {
        if (this.#phase.get(key) === 'integration' || this.#phase.get(key) === 'attention') {
          this.#working.get(sessionId)?.delete(key);
          events.push(await this.fridge(sessionId, key, actorAgentId));
        }
      }
      return { events, preservedGoals: [...this.#goals] };
    }
    if (step === 'freezer') {
      const events = [];
      for (const key of working) {
        const phase = this.#phase.get(key);
        if (phase === 'containment') continue;
        if (phase === 'partition' || phase === 'integration' || phase === 'attention') {
          this.#working.get(sessionId)?.delete(key);
          if (phase !== 'partition') {
            await this.#transition({
              key, to: 'partition', reason: 'fridge', actorAgentId, sessionId, allowDirect: true,
            });
          }
          events.push(await this.freezer(sessionId, key, actorAgentId));
        }
      }
      return { events, preservedGoals: [...this.#goals] };
    }
    const events = [];
    for (const key of working) {
      const phase = this.#phase.get(key);
      if (phase === 'containment' || phase === 'disintegration') continue;
      this.#working.get(sessionId)?.delete(key);
      if (phase !== 'partition') {
        await this.#transition({
          key, to: 'partition', reason: 'seizure-fridge', actorAgentId, sessionId, allowDirect: true,
        });
      }
      events.push(await this.#transition({
        key, to: 'containment', reason: 'seizure', actorAgentId, sessionId,
      }));
    }
    this.#seized.add(sessionId);
    return { paused: true, events, preservedGoals: [...this.#goals] };
  }

  async #transition({ key, to, reason, actorAgentId, sessionId, derivedKey, parentKeys, allowDirect = false }) {
    this.#assertAwake(sessionId);
    const from = this.#phase.get(key);
    if (!from) throw new Error(`key is not in the lifecycle: ${key}`);
    const edge = `${from}>${to}`;
    const direction = directionOf(from, to);
    if (from === to) throw new Error(`no-op transition on ${key}`);
    if (from === 'containment' && to === 'attention') {
      throw new Error('attention cannot release containment');
    }
    if (!ALLOWED.has(edge) && !(allowDirect && direction === 'direct')) {
      throw new Error(`transition not allowed: ${edge}`);
    }
    if (direction === 'direct' && !allowDirect && !ALLOWED.has(edge)) {
      throw new Error(`direct transition requires allowDirect: ${edge}`);
    }
    if (to === 'derivation' && from === 'disintegration') {
      throw new Error('wraparound must create a derived key, not resurrect');
    }
    if (from === 'attention' && to !== 'attention') {
      this.#working.get(sessionId)?.delete(key);
    }
    return this.#append({
      key, from, to, direction, reason, actorAgentId, sessionId, derivedKey, parentKeys,
    });
  }

  async #append(event) {
    const seq = ++this.#seq;
    const record = Object.freeze({
      schema: 1,
      kind: 'mfl-transition',
      seq,
      key: event.key,
      from: event.from,
      to: event.to,
      direction: event.direction,
      reason: event.reason,
      actorHash: hashAgentId(event.actorAgentId),
      sessionId: event.sessionId,
      ts: this.#clock(),
      derivedKey: event.derivedKey ?? null,
      parentKeys: event.parentKeys ? Object.freeze([...event.parentKeys]) : null,
    });
    if (event.to && event.to !== event.from) this.#phase.set(event.key, event.to);
    await mkdir(this.#store.directory, { recursive: true });
    await appendFile(join(this.#store.directory, 'transitions.jsonl'), `${canonicalJson(record)}\n`, 'utf8');
    return record;
  }
}

function isCompressedCycle(hashes) {
  if (hashes.length >= 4) {
    const [a, b, c, d] = hashes.slice(-4);
    if (a === c && b === d && a !== b) return true;
  }
  if (hashes.length >= 6) {
    const last = hashes.slice(-3).join(',');
    const prev = hashes.slice(-6, -3).join(',');
    if (last === prev) return true;
  }
  return false;
}
