import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SCHEMA_VERSION = 1;
const EMPTY_ROOT = null;
// Keep the persisted hash namespace independent of a not-yet-integrated product rename.
const AGENT_HASH_DOMAIN = 'green-memory:origin:v1\0';
const PROVENANCE_HASH_DOMAIN = 'green-memory:provenance:v1\0';

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertUnitInterval(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical values must contain finite numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) throw new TypeError('canonical values must not contain undefined');
      output[key] = canonicalize(value[key]);
    }
    return output;
  }
  throw new TypeError(`unsupported canonical value type: ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function hashAgentId(agentId) {
  assertNonEmptyString(agentId, 'agentId');
  return sha256(`${AGENT_HASH_DOMAIN}${agentId.normalize('NFC')}`);
}

function contentAddress(object) {
  return sha256(canonicalJson(object));
}

function keyPath(key) {
  return sha256(`green-memory:key:v1\0${key.normalize('NFC')}`);
}

function refFileName(branch) {
  assertNonEmptyString(branch, 'branch');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(branch)) {
    throw new TypeError('branch contains unsupported characters');
  }
  return `${branch}.json`;
}

function buildRecord({ key, value, originatingAgentId, observedAt, salience, confidence, tags }) {
  assertNonEmptyString(key, 'key');
  assertNonEmptyString(originatingAgentId, 'originatingAgentId');
  assertNonEmptyString(observedAt, 'observedAt');
  assertUnitInterval(salience, 'salience');
  assertUnitInterval(confidence, 'confidence');
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
    throw new TypeError('tags must be an array of strings');
  }

  // Validate serializability before calculating any digest.
  canonicalJson(value);
  const originAgentHash = hashAgentId(originatingAgentId);
  const content = {
    schema: SCHEMA_VERSION,
    kind: 'memory',
    key: key.normalize('NFC'),
    value,
    observedAt,
    salience,
    confidence,
    tags: [...new Set(tags.map((tag) => tag.normalize('NFC')))].sort(),
    originAgentHash,
  };
  const provenanceHash = sha256(
    `${PROVENANCE_HASH_DOMAIN}${canonicalJson({
      originAgentHash,
      contentHash: contentAddress(content),
    })}`,
  );
  return { ...content, provenanceHash };
}

export function verifyMemoryRecord(record) {
  if (!record || record.kind !== 'memory' || record.schema !== SCHEMA_VERSION) return false;
  const { provenanceHash, ...content } = record;
  if (typeof provenanceHash !== 'string' || !/^[a-f0-9]{64}$/.test(provenanceHash)) return false;
  try {
    const expected = sha256(
      `${PROVENANCE_HASH_DOMAIN}${canonicalJson({
        originAgentHash: content.originAgentHash,
        contentHash: contentAddress(content),
      })}`,
    );
    return provenanceHash === expected;
  } catch {
    return false;
  }
}

export function weightMemory(
  record,
  readerAgentId,
  { relevance = 1, firstHandWeight = 1, inheritedWeight = 0.6 } = {},
) {
  if (!verifyMemoryRecord(record)) throw new TypeError('invalid memory provenance');
  assertNonEmptyString(readerAgentId, 'readerAgentId');
  assertUnitInterval(relevance, 'relevance');
  assertUnitInterval(firstHandWeight, 'firstHandWeight');
  assertUnitInterval(inheritedWeight, 'inheritedWeight');
  if (inheritedWeight > firstHandWeight) {
    throw new RangeError('inheritedWeight must not exceed firstHandWeight');
  }
  const firstHand = record.originAgentHash === hashAgentId(readerAgentId);
  const provenanceWeight = firstHand ? firstHandWeight : inheritedWeight;
  return {
    firstHand,
    provenance: firstHand ? 'first-hand' : 'inherited',
    provenanceWeight,
    score: relevance * record.salience * record.confidence * provenanceWeight,
  };
}

export class DreamcatcherStore {
  #ticket = 0;
  #evictionTail = Promise.resolve();
  #evictionErrors = [];

  constructor(directory, { clock = () => new Date().toISOString() } = {}) {
    assertNonEmptyString(directory, 'directory');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.directory = directory;
    this.objectsDirectory = join(directory, 'objects');
    this.refsDirectory = join(directory, 'refs');
    this.clock = clock;
  }

  async init() {
    await Promise.all([
      mkdir(this.objectsDirectory, { recursive: true }),
      mkdir(this.refsDirectory, { recursive: true }),
    ]);
    return this;
  }

  async #putObject(object) {
    const hash = contentAddress(object);
    const path = join(this.objectsDirectory, hash.slice(0, 2), `${hash.slice(2)}.json`);
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(path, `${canonicalJson(object)}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    return hash;
  }

  async #getObject(hash) {
    assertNonEmptyString(hash, 'object hash');
    const path = join(this.objectsDirectory, hash.slice(0, 2), `${hash.slice(2)}.json`);
    const object = JSON.parse(await readFile(path, 'utf8'));
    if (contentAddress(object) !== hash) throw new Error(`object integrity check failed: ${hash}`);
    return object;
  }

  async #readRef(branch) {
    const path = join(this.refsDirectory, refFileName(branch));
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async #writeRef(branch, ref) {
    const path = join(this.refsDirectory, refFileName(branch));
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, `${canonicalJson(ref)}\n`, 'utf8');
    await rename(temporary, path);
  }

  async createBranch(branch, ownerAgentId) {
    await this.init();
    const current = await this.#readRef(branch);
    if (current) throw new Error(`branch already exists: ${branch}`);
    const ref = {
      schema: SCHEMA_VERSION,
      kind: 'branch-ref',
      head: null,
      ownerAgentHash: hashAgentId(ownerAgentId),
      forkedFrom: null,
    };
    await this.#writeRef(branch, ref);
    return ref;
  }

  async forkBranch(fromBranch, toBranch, ownerAgentId) {
    await this.init();
    const [source, target] = await Promise.all([this.#readRef(fromBranch), this.#readRef(toBranch)]);
    if (!source) throw new Error(`branch does not exist: ${fromBranch}`);
    if (target) throw new Error(`branch already exists: ${toBranch}`);
    const ref = {
      schema: SCHEMA_VERSION,
      kind: 'branch-ref',
      head: source.head,
      ownerAgentHash: hashAgentId(ownerAgentId),
      forkedFrom: { branch: fromBranch, head: source.head },
    };
    await this.#writeRef(toBranch, ref);
    return ref;
  }

  async #setTrie(rootHash, path, depth, key, memoryHash) {
    if (depth === path.length) {
      return this.#putObject({ schema: SCHEMA_VERSION, kind: 'trie-leaf', key, memoryHash });
    }
    const existing = rootHash ? await this.#getObject(rootHash) : null;
    if (existing && existing.kind !== 'trie-node') throw new Error('corrupt trie: expected node');
    const nibble = path[depth];
    const children = { ...(existing?.children ?? {}) };
    children[nibble] = await this.#setTrie(children[nibble] ?? null, path, depth + 1, key, memoryHash);
    return this.#putObject({ schema: SCHEMA_VERSION, kind: 'trie-node', children });
  }

  async #getTrie(rootHash, path, depth, key) {
    if (!rootHash) return null;
    const object = await this.#getObject(rootHash);
    if (depth === path.length) {
      if (object.kind !== 'trie-leaf') throw new Error('corrupt trie: expected leaf');
      if (object.key !== key) throw new Error('SHA-256 key collision');
      return object.memoryHash;
    }
    if (object.kind !== 'trie-node') throw new Error('corrupt trie: expected node');
    return this.#getTrie(object.children[path[depth]] ?? null, path, depth + 1, key);
  }

  async remember({
    branch,
    key,
    value,
    originatingAgentId,
    writerAgentId = originatingAgentId,
    observedAt = this.clock(),
    salience = 1,
    confidence = 1,
    tags = [],
  }) {
    await this.init();
    const ref = await this.#readRef(branch);
    if (!ref) throw new Error(`branch does not exist: ${branch}`);
    const parent = ref.head ? await this.#getObject(ref.head) : null;
    if (parent && parent.kind !== 'memory-commit') throw new Error('branch head is not a memory commit');

    const record = buildRecord({ key, value, originatingAgentId, observedAt, salience, confidence, tags });
    const memoryHash = await this.#putObject(record);
    const root = await this.#setTrie(parent?.root ?? EMPTY_ROOT, keyPath(record.key), 0, record.key, memoryHash);
    const commit = {
      schema: SCHEMA_VERSION,
      kind: 'memory-commit',
      parent: ref.head,
      root,
      writerAgentHash: hashAgentId(writerAgentId),
      committedAt: this.clock(),
    };
    const head = await this.#putObject(commit);
    await this.#writeRef(branch, { ...ref, head });
    return { head, root, memoryHash, record };
  }

  enqueueEviction(input) {
    const ticket = `memory-${++this.#ticket}`;
    const scheduled = new Promise((resolve) => queueMicrotask(resolve));
    const done = this.#evictionTail.then(() => scheduled).then(() => this.remember(input));
    // Keep the queue usable after a failed write, while retaining the error for
    // the next explicit durability boundary.
    this.#evictionTail = done.catch((error) => {
      this.#evictionErrors.push(error);
    });
    return { ticket, done };
  }

  async flush() {
    await this.#evictionTail;
    if (this.#evictionErrors.length) {
      const errors = this.#evictionErrors.splice(0);
      throw new AggregateError(errors, 'one or more memory evictions failed');
    }
  }

  async get(branch, key) {
    assertNonEmptyString(key, 'key');
    const ref = await this.#readRef(branch);
    if (!ref?.head) return null;
    const commit = await this.#getObject(ref.head);
    const memoryHash = await this.#getTrie(commit.root, keyPath(key.normalize('NFC')), 0, key.normalize('NFC'));
    return memoryHash ? this.#getObject(memoryHash) : null;
  }

  async #collectTrie(hash, records) {
    if (!hash) return;
    const object = await this.#getObject(hash);
    if (object.kind === 'trie-leaf') {
      records.push(await this.#getObject(object.memoryHash));
      return;
    }
    if (object.kind !== 'trie-node') throw new Error('corrupt trie while collecting records');
    for (const nibble of Object.keys(object.children).sort()) {
      await this.#collectTrie(object.children[nibble], records);
    }
  }

  async recall(
    branch,
    readerAgentId,
    { limit = 5, relevance = () => 1, firstHandWeight = 1, inheritedWeight = 0.6 } = {},
  ) {
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new RangeError('limit must be a positive integer');
    if (typeof relevance !== 'function') throw new TypeError('relevance must be a function');
    const ref = await this.#readRef(branch);
    if (!ref?.head) return [];
    const commit = await this.#getObject(ref.head);
    const records = [];
    await this.#collectTrie(commit.root, records);
    return records
      .map((record) => ({
        record,
        ...weightMemory(record, readerAgentId, {
          relevance: relevance(record),
          firstHandWeight,
          inheritedWeight,
        }),
      }))
      .sort((left, right) => right.score - left.score || left.record.key.localeCompare(right.record.key))
      .slice(0, limit);
  }

  async inspectBranch(branch) {
    const ref = await this.#readRef(branch);
    if (!ref) return null;
    const commit = ref.head ? await this.#getObject(ref.head) : null;
    return { ref, commit };
  }

  async reachableObjects(branch) {
    const ref = await this.#readRef(branch);
    const found = new Set();
    const visit = async (hash) => {
      if (!hash || found.has(hash)) return;
      found.add(hash);
      const object = await this.#getObject(hash);
      if (object.kind === 'memory-commit') {
        await visit(object.parent);
        await visit(object.root);
      } else if (object.kind === 'trie-node') {
        for (const child of Object.values(object.children)) await visit(child);
      } else if (object.kind === 'trie-leaf') {
        await visit(object.memoryHash);
      }
    };
    await visit(ref?.head);
    return found;
  }

  async reachableStateObjects(branch) {
    const ref = await this.#readRef(branch);
    if (!ref?.head) return new Set();
    const commit = await this.#getObject(ref.head);
    const found = new Set();
    const visit = async (hash) => {
      if (!hash || found.has(hash)) return;
      found.add(hash);
      const object = await this.#getObject(hash);
      if (object.kind === 'trie-node') {
        for (const child of Object.values(object.children)) await visit(child);
      } else if (object.kind === 'trie-leaf') {
        await visit(object.memoryHash);
      }
    };
    await visit(commit.root);
    return found;
  }
}
