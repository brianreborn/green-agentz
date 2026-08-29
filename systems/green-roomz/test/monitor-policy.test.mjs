import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERBS,
  assertCaller,
  makeEnvelope,
} from '../src/monitor/api.mjs';
import {
  GRADE,
  GRADES,
  createPolicy,
  check,
  label,
} from '../src/monitor/policy.mjs';

test('grade type !== verb', () => {
  assert.equal(GRADE, 'grade');
  assert.notEqual(GRADE, 'verb');
  assert.deepEqual([...GRADES], ['watch', 'quarantine', 'stop', 'wipe']);
  for (const g of GRADES) {
    assert.equal(VERBS.includes(g), false, `${g} is a grade, not a verb`);
  }
  for (const v of VERBS) {
    assert.equal(GRADES.includes(v), false, `${v} is a verb, not a grade`);
  }
  const policy = createPolicy();
  assert.deepEqual(Object.keys(policy).sort(), ['check', 'label']);
  assert.equal(typeof policy.toVerb, 'undefined');
  assert.equal(typeof policy.gradeToVerb, 'undefined');
  assert.equal(typeof policy.mapGrade, 'undefined');
  assert.equal(typeof policy.vote, 'undefined');
});

test('SAD post(wipe) does not call secure_reboot', async () => {
  const invoked = [];
  const policy = createPolicy({
    respond: {
      lockdown() { invoked.push('lockdown'); },
      reboot() { invoked.push('reboot'); },
      secure_reboot() { invoked.push('secure_reboot'); },
    },
  });
  const env = makeEnvelope({
    kind: 'grade',
    source: 'sad',
    ticket: 11,
    payload: { grade: 'wipe' },
  });
  const result = await policy.check(env, { callerRole: 'sad' });
  assert.equal(invoked.includes('secure_reboot'), false);
  assert.equal(invoked.length, 0);
  assert.equal(result.grade, 'wipe');
  assert.equal(result.type, GRADE);
  assert.notEqual(result.type, 'verb');
  assert.equal(result.executed, false);
  assert.equal(result.inert, true);
  assert.throws(() => assertCaller('lockdown', 'sad'), /lockdown not allowed for sad/);
  assert.throws(() => assertCaller('reboot', 'sad'));
  assert.throws(() => assertCaller('secure_reboot', 'sad'));
  assert.throws(() => assertCaller('secure_reboot', 'worker'));
  assert.throws(() => assertCaller('lockdown', 'logger'));
  assert.equal(Object.prototype.hasOwnProperty.call(policy, 'lockdown'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(policy, 'reboot'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(policy, 'secure_reboot'), false);
  assert.equal(typeof policy.check, 'function');
  assert.equal(typeof policy.label, 'function');
});

test('map-edit to wipe stays inert', () => {
  const invoked = [];
  const policy = createPolicy({
    respond: {
      secure_reboot() { invoked.push('secure_reboot'); },
      lockdown() { invoked.push('lockdown'); },
      reboot() { invoked.push('reboot'); },
    },
  });
  const result = policy.label({
    map: { wipe: 'secure_reboot' },
  }, { callerRole: 'isolate' });
  assert.equal(result.inert, true);
  assert.equal(result.executed, false);
  assert.equal(invoked.length, 0);
  assert.equal(result.kind, undefined);
  const stop = policy.label({
    map: { stop: 'lockdown' },
  }, { callerRole: 'ipc' });
  assert.equal(stop.inert, true);
  assert.equal(stop.executed, false);
  assert.equal(invoked.length, 0);
});

test('check does not throw on hop-shaped envelope', async () => {
  const hop = makeEnvelope({
    kind: 'hop',
    source: 'ipc',
    ticket: 1,
    seq: 2,
    target: 'machine',
    payload: { n: 1 },
  });
  await assert.doesNotReject(() => check(hop));
  const result = await check(hop, { callerRole: 'ipc' });
  assert.equal(result.ok, true);
  assert.equal(result.advisory, true);
  assert.equal(result.blocking, false);
  assert.equal(result.executed, false);
  const tagged = label({ label: 'trusted', grade: 'watch' }, { callerRole: 'isolate' });
  await assert.doesNotReject(() => check(tagged, { callerRole: 'ipc' }));
});

test('missing capability rejects, never no-op success', () => {
  const policy = createPolicy({ capabilities: [] });
  const result = policy.label({
    map: { quarantine: 'down' },
  }, { callerRole: 'isolate' });
  assert.equal(result.kind, 'reject');
  assert.match(result.reason, /missing capability/);
  assert.notEqual(result.ok, true);
});
