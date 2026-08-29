import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';
import { parseSlashCommand, hardRuleRoute } from '../src/routing.mjs';
import { clampFaith, interpretKernelFaith, faithRejects } from '../src/nexus.mjs';
import { assertNexusKernelText, kernelBindingIssues, validateManifest } from '../src/config.mjs';
import { MICROKERNEL_MAX_CHARS, NEXUS_ALIAS } from '../src/constants.mjs';

const user = (content) => ({ messages: [{ role: 'user', content }] });

// --- slash parsing -----------------------------------------------------------

test('/faith accepts levels and 0-1 numbers, rejects garbage', () => {
  assert.equal(parseSlashCommand(user('/faith high')).faith, 'high');
  assert.equal(parseSlashCommand(user('/faith 0.95')).faith, 'xhigh');
  assert.equal(parseSlashCommand(user('/faith 0.1')).faith, 'low');
  assert.throws(() => parseSlashCommand(user('/faith sideways')), /low\|medium\|high\|xhigh/);
});

test('/fear /confidence /yolo parse to setting shapes', () => {
  assert.equal(parseSlashCommand(user('/fear medium')).fear, 'medium');
  assert.equal(parseSlashCommand(user('/confidence must')).confidenceMood, 'must');
  assert.equal(parseSlashCommand(user('/confidence high')).confidenceMood, 'shall');
  assert.equal(parseSlashCommand(user('/yolo')).yolo, true);
  assert.equal(parseSlashCommand(user('/yolo off')).yolo, false);
});

test('/forget is refused; /rebuke carries its text', () => {
  assert.throws(() => parseSlashCommand(user('/forget the last turn')), /not a proven phenomenon/);
  assert.equal(parseSlashCommand(user('/rebuke wrong specialist')).op, 'rebuke');
  assert.equal(parseSlashCommand(user('/rebuke wrong specialist')).rest, 'wrong specialist');
});

test('setting-only slash turns route to a slash_<setting> reason, never a specialist', () => {
  const reg = { agents: new Map(), has: () => false, status: () => ({ state: 'ready' }) };
  assert.equal(hardRuleRoute(user('/faith high'), reg).reason, 'slash_faith');
  assert.equal(hardRuleRoute(user('/yolo'), reg).reason, 'slash_yolo');
  assert.equal(hardRuleRoute(user('/rebuke bad pick'), reg).reason, 'rebuke');
});

// --- faith math --------------------------------------------------------------

test('clampFaith bounds to [0,1] and rejects NaN', () => {
  assert.equal(clampFaith(1.5), 1);
  assert.equal(clampFaith(-2), 0);
  assert.equal(clampFaith('nope'), 0);
  assert.equal(clampFaith(0.42), 0.42);
});

test('faithRejects gates a weak kernel confidence at high faith, admits it at medium', () => {
  assert.equal(faithRejects(0.1, { faithLevel: 'medium' }), null);
  assert.equal(faithRejects(0.1, { faithLevel: 'high' }), 'faith');
  assert.equal(faithRejects(0.9, { faithLevel: 'xhigh' }), null);
});

test('interpretKernelFaith scales by the level assign factor and stays clamped', () => {
  assert.ok(Math.abs(interpretKernelFaith(0.8, 'low') - 0.72) < 1e-9);
  assert.ok(Math.abs(interpretKernelFaith(0.9, 'high') - 0.99) < 1e-9);
  assert.equal(interpretKernelFaith(1, 'xhigh'), 1);
});

// --- microkernel kernel-text bounds ----------------------------------------

test('assertNexusKernelText enforces the size bound and blocks leaked critical rules', () => {
  assert.equal(assertNexusKernelText('short kernel'), 'short kernel');
  assert.throws(() => assertNexusKernelText('x'.repeat(MICROKERNEL_MAX_CHARS + 1)), /size bound/);
  assert.throws(() => assertNexusKernelText('Do not make authorization decisions here'), /critical rules/);
});

test('kernelBindingIssues flags a nexus bound to a critical kernel and a wrong basename', () => {
  assert.deepEqual(kernelBindingIssues({ alias: NEXUS_ALIAS, system_policy: '/p/tool-router.md' }), []);
  assert.match(
    kernelBindingIssues({ alias: NEXUS_ALIAS, system_policy: '/p/safety.md' }).join(' '),
    /critical kernel|must be tool-router\.md/,
  );
  assert.match(
    kernelBindingIssues({ alias: 'security-monitor-agent', system_policy: '/p/general-text.md' }).join(' '),
    /frozen to security-monitor\.md/,
  );
});

test('validateManifest rejects an unbounded gateway key without a sysadmin schema bump', () => {
  const m = sampleManifest();
  assert.throws(
    () => validateManifest({ ...m, gateway: { ...m.gateway, mystery_knob: 3 } }),
    (err) => err.name === 'ValidationError'
      && [].concat(err.details ?? []).some((i) => /unbounded keys/.test(i)),
  );
});

// --- session persistence + gateway wiring ----------------------------------

test('SessionLedger carries faith/fear/mood and patch updates them', () => {
  const s = new SessionLedger();
  const id = s.create({ identity: 'u', agentAlias: 'x', modality: {}, faith: 'high', fear: 'medium' });
  assert.equal(s.get(id, 'u').faith, 'high');
  s.patch(id, { faith: 'xhigh' });
  assert.equal(s.get(id, 'u').faith, 'xhigh');
  assert.equal(s.get(id, 'u').fear, 'medium');
});

test('gateway.applyTurnSettings persists a /faith turn to the session and reports the level', async () => {
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  const processes = new ProcessManager({
    manifest, registry,
    hostAdapter: { sampleResources: () => ({ freeMemoryBytes: 1 }) },
    spawnImpl() { throw new Error('no spawn'); },
  });
  const sessions = new SessionLedger();
  const gateway = new Gateway({ manifest, registry, processes, sessions, policy: new PolicyGate('maximize') });
  const id = sessions.create({ identity: 'u', agentAlias: 'x', modality: {} });

  const out = gateway.applyTurnSettings(id, 'u', user('/faith xhigh'));
  assert.equal(out.faithLevel, 'xhigh');
  assert.equal(sessions.get(id, 'u').faith, 'xhigh');

  gateway.applyTurnSettings(id, 'u', user('/rebuke it picked code for prose'));
  assert.equal(sessions.get(id, 'u').op, 'rebuke');
  assert.equal(sessions.get(id, 'u').rebuke, 'it picked code for prose');
});
