const OUTCOMES = new Set(['succeeded', 'failed', 'deferred', 'abandoned', 'expired']);

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertInteger(value, label, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function cloneData(value, label) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch (error) {
    throw new TypeError(`${label} must be structured-cloneable`, { cause: error });
  }
}

function compareArrays(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export class DriveRegistry {
  #clock;
  #drives = new Map();
  #tasks = new Map();
  #sequence = 0;

  constructor({ clock = Date.now } = {}) {
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.#clock = clock;
  }

  registerDrive({ id, parentId = null, rank = 0, enabled = true, displayName = id }) {
    assertNonEmptyString(id, 'drive.id');
    assertNonEmptyString(displayName, 'drive.displayName');
    assertInteger(rank, 'drive.rank');
    if (this.#drives.has(id)) throw new Error(`Drive already exists: ${id}`);
    if (parentId !== null && !this.#drives.has(parentId)) {
      throw new Error(`Unknown parent drive: ${parentId}`);
    }

    const drive = Object.freeze({ id, parentId, rank, enabled: Boolean(enabled), displayName });
    this.#drives.set(id, drive);
    return drive;
  }

  setDriveEnabled(id, enabled) {
    const drive = this.#getDrive(id);
    this.#drives.set(id, Object.freeze({ ...drive, enabled: Boolean(enabled) }));
  }

  registerTask({
    id,
    driveId,
    kind,
    payload,
    priority = 0,
    requiredCapabilities = [],
    notBefore = 0,
    maxAttempts = 1,
    cooldownMs = 0,
    repeat = false,
    enabled = true,
  }) {
    assertNonEmptyString(id, 'task.id');
    assertNonEmptyString(driveId, 'task.driveId');
    assertNonEmptyString(kind, 'task.kind');
    if (this.#tasks.has(id)) throw new Error(`Task already exists: ${id}`);
    this.#getDrive(driveId);
    assertInteger(priority, 'task.priority');
    assertInteger(notBefore, 'task.notBefore', { minimum: 0 });
    assertInteger(maxAttempts, 'task.maxAttempts', { minimum: 1 });
    assertInteger(cooldownMs, 'task.cooldownMs', { minimum: 0 });
    if (repeat && cooldownMs === 0) {
      throw new Error('Repeating tasks require a positive cooldownMs');
    }
    if (!Array.isArray(requiredCapabilities)) {
      throw new TypeError('task.requiredCapabilities must be an array');
    }
    const capabilities = [...new Set(requiredCapabilities.map((capability) =>
      assertNonEmptyString(capability, 'task.requiredCapabilities[]')))].sort();

    const task = {
      id,
      driveId,
      kind,
      payload: cloneData(payload, 'task.payload'),
      priority,
      requiredCapabilities: capabilities,
      notBefore,
      maxAttempts,
      cooldownMs,
      repeat: Boolean(repeat),
      enabled: Boolean(enabled),
      attempts: 0,
      nextEligibleAt: notBefore,
      status: 'ready',
      sequence: this.#sequence++,
      lastOutcome: null,
    };
    this.#tasks.set(id, task);
    return this.#publicTask(task);
  }

  setTaskEnabled(id, enabled) {
    const task = this.#getTask(id);
    task.enabled = Boolean(enabled);
  }

  rearmTask(id, { maxAttempts, notBefore = this.#clock() } = {}) {
    const task = this.#getTask(id);
    if (task.status === 'leased') throw new Error(`Cannot rearm leased task: ${id}`);
    if (maxAttempts !== undefined) {
      assertInteger(maxAttempts, 'maxAttempts', { minimum: 1 });
      task.maxAttempts = maxAttempts;
    }
    assertInteger(notBefore, 'notBefore', { minimum: 0 });
    task.attempts = 0;
    task.nextEligibleAt = notBefore;
    task.status = 'ready';
    task.lastOutcome = null;
  }

  selectCandidate({ now = this.#clock(), capabilities = [] } = {}) {
    assertInteger(now, 'now', { minimum: 0 });
    const available = new Set(capabilities);
    const eligible = [];

    for (const task of this.#tasks.values()) {
      const drivePath = this.#drivePath(task.driveId);
      if (!task.enabled || task.status !== 'ready') continue;
      if (task.attempts >= task.maxAttempts || now < task.nextEligibleAt) continue;
      if (drivePath.some((drive) => !drive.enabled)) continue;
      if (task.requiredCapabilities.some((capability) => !available.has(capability))) continue;
      eligible.push({ task, drivePath });
    }

    eligible.sort((left, right) => {
      const driveOrder = compareArrays(
        left.drivePath.map((drive) => drive.rank),
        right.drivePath.map((drive) => drive.rank),
      );
      return driveOrder
        || left.task.priority - right.task.priority
        || left.task.sequence - right.task.sequence
        || left.task.id.localeCompare(right.task.id);
    });

    return eligible[0] ? this.#publicTask(eligible[0].task) : null;
  }

  leaseTask(id, now = this.#clock()) {
    const task = this.#getTask(id);
    if (task.status !== 'ready' || task.attempts >= task.maxAttempts || now < task.nextEligibleAt) {
      throw new Error(`Task is not leaseable: ${id}`);
    }
    task.status = 'leased';
    task.attempts += 1;
    return this.#publicTask(task);
  }

  settleTask(id, outcome, now = this.#clock()) {
    const task = this.#getTask(id);
    if (!OUTCOMES.has(outcome)) throw new Error(`Unknown task outcome: ${outcome}`);
    if (task.status !== 'leased') throw new Error(`Task is not leased: ${id}`);
    assertInteger(now, 'now', { minimum: 0 });

    task.lastOutcome = outcome;
    const hasBudget = task.attempts < task.maxAttempts;
    const canRepeat = task.repeat || outcome !== 'succeeded';
    if (hasBudget && canRepeat) {
      task.status = 'ready';
      task.nextEligibleAt = now + task.cooldownMs;
    } else {
      task.status = outcome === 'succeeded' ? 'completed' : 'exhausted';
    }
    return this.#publicTask(task);
  }

  snapshot() {
    return Object.freeze({
      drives: Object.freeze([...this.#drives.values()].map((drive) => ({ ...drive }))),
      tasks: Object.freeze([...this.#tasks.values()].map((task) => this.#publicTask(task))),
    });
  }

  #getDrive(id) {
    const drive = this.#drives.get(id);
    if (!drive) throw new Error(`Unknown drive: ${id}`);
    return drive;
  }

  #getTask(id) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`Unknown task: ${id}`);
    return task;
  }

  #drivePath(id) {
    const path = [];
    let drive = this.#getDrive(id);
    while (drive) {
      path.unshift(drive);
      drive = drive.parentId === null ? null : this.#getDrive(drive.parentId);
    }
    return path;
  }

  #publicTask(task) {
    return Object.freeze({
      id: task.id,
      driveId: task.driveId,
      kind: task.kind,
      payload: cloneData(task.payload, 'task.payload'),
      priority: task.priority,
      requiredCapabilities: Object.freeze([...task.requiredCapabilities]),
      notBefore: task.notBefore,
      maxAttempts: task.maxAttempts,
      cooldownMs: task.cooldownMs,
      repeat: task.repeat,
      enabled: task.enabled,
      attempts: task.attempts,
      nextEligibleAt: task.nextEligibleAt,
      status: task.status,
      lastOutcome: task.lastOutcome,
    });
  }
}

export class IdleDriveScheduler {
  #registry;
  #clock;
  #leaseDurationMs;
  #maxPromotionsPerIdleEpoch;
  #promotionsThisEpoch = 0;
  #idle = false;
  #active = null;
  #leaseSequence = 0;

  constructor(registry, {
    clock = Date.now,
    leaseDurationMs = 60_000,
    maxPromotionsPerIdleEpoch = 1,
  } = {}) {
    if (!(registry instanceof DriveRegistry)) throw new TypeError('registry must be a DriveRegistry');
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    assertInteger(leaseDurationMs, 'leaseDurationMs', { minimum: 1 });
    assertInteger(maxPromotionsPerIdleEpoch, 'maxPromotionsPerIdleEpoch', { minimum: 1 });
    this.#registry = registry;
    this.#clock = clock;
    this.#leaseDurationMs = leaseDurationMs;
    this.#maxPromotionsPerIdleEpoch = maxPromotionsPerIdleEpoch;
  }

  observeExternalState({ queueDepth, primaryActive }) {
    assertInteger(queueDepth, 'queueDepth', { minimum: 0 });
    const idle = queueDepth === 0 && primaryActive === false;
    if (!idle) {
      this.#promotionsThisEpoch = 0;
      this.abortActive('external-activity');
    }
    this.#idle = idle;
    return this.state();
  }

  tryPromote({ capabilities = [] } = {}) {
    const now = this.#clock();
    this.#expireActive(now);
    if (!this.#idle) return { promoted: false, reason: 'not-idle' };
    if (this.#active) return { promoted: false, reason: 'lease-active' };
    if (this.#promotionsThisEpoch >= this.#maxPromotionsPerIdleEpoch) {
      return { promoted: false, reason: 'idle-epoch-budget-exhausted' };
    }

    const candidate = this.#registry.selectCandidate({ now, capabilities });
    if (!candidate) return { promoted: false, reason: 'no-eligible-task' };
    const task = this.#registry.leaseTask(candidate.id, now);
    const controller = new AbortController();
    const leaseId = `idle-${++this.#leaseSequence}`;
    this.#active = {
      leaseId,
      taskId: task.id,
      expiresAt: now + this.#leaseDurationMs,
      controller,
    };
    this.#promotionsThisEpoch += 1;

    return {
      promoted: true,
      lease: Object.freeze({
        id: leaseId,
        task,
        expiresAt: this.#active.expiresAt,
        signal: controller.signal,
      }),
    };
  }

  settle(leaseId, outcome) {
    const now = this.#clock();
    this.#expireActive(now);
    if (!this.#active || this.#active.leaseId !== leaseId) {
      throw new Error(`Unknown or inactive lease: ${leaseId}`);
    }
    const task = this.#registry.settleTask(this.#active.taskId, outcome, now);
    this.#active = null;
    return task;
  }

  abortActive(reason = 'abandoned') {
    if (!this.#active) return false;
    const active = this.#active;
    active.controller.abort(reason);
    this.#registry.settleTask(active.taskId, 'abandoned', this.#clock());
    this.#active = null;
    return true;
  }

  state() {
    const now = this.#clock();
    this.#expireActive(now);
    return Object.freeze({
      idle: this.#idle,
      promotionsThisEpoch: this.#promotionsThisEpoch,
      maxPromotionsPerIdleEpoch: this.#maxPromotionsPerIdleEpoch,
      activeLease: this.#active
        ? Object.freeze({
          id: this.#active.leaseId,
          taskId: this.#active.taskId,
          expiresAt: this.#active.expiresAt,
        })
        : null,
    });
  }

  #expireActive(now) {
    if (!this.#active || now < this.#active.expiresAt) return;
    const active = this.#active;
    active.controller.abort('lease-expired');
    this.#registry.settleTask(active.taskId, 'expired', now);
    this.#active = null;
  }
}

export function createDefaultDriveRegistry(options) {
  const registry = new DriveRegistry(options);
  registry.registerDrive({ id: 'system-stability', rank: 0, displayName: 'green-stabilitz' });
  registry.registerDrive({ id: 'task-fulfillment', rank: 1, displayName: 'green-taskz' });
  registry.registerDrive({ id: 'epigenetic-optimization', rank: 2, displayName: 'green-dreamz' });
  return registry;
}

