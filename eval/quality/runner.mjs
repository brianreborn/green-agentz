#!/usr/bin/env node
/**
 * Quality comparison runner.
 *
 *   node eval/quality/runner.mjs
 *   node eval/quality/runner.mjs --json eval/quality/results/latest.json
 *   EVAL_LIVE=1 node eval/quality/runner.mjs
 *
 * Default: in-process automatic cases. Live HTTP requires EVAL_LIVE=1
 * (or --live). Cloud peers require EVAL_CLOUD=1. Missing peers skip.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CASES, runOne } from './cases.mjs';
import { envFlag, probeProviders } from './providers.mjs';
import { makeResult, validateResult } from './schema.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const only = (() => {
  const raw = arg('--only');
  return raw ? new Set(raw.split(',').map((s) => s.trim()).filter(Boolean)) : null;
})();

const jsonOut = arg('--json');
const live = envFlag('EVAL_LIVE') || hasFlag('--live');
const cloud = envFlag('EVAL_CLOUD') || hasFlag('--cloud');
const mflWired = envFlag('EVAL_MFL_WIRED');

const startedAt = new Date().toISOString();
const { providers } = await probeProviders({ live, cloud });

const ctx = { live, cloud, mflWired, providers };
const selected = CASES.filter((c) => {
  if (only && !only.has(c.id)) return false;
  if (!live && (c.mode === 'live' || c.mode === 'pairwise')) return false;
  return true;
});

const cases = [];
for (const caze of selected) {
  process.stderr.write(`${caze.id} ...`);
  const row = await runOne(caze, ctx);
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', record: 'REC ' }[row.outcome] ?? row.outcome;
  process.stderr.write(` ${mark} ${row.reason ?? ''}\n`);
  cases.push(row);
}

const promptMode = cases.find((c) => c.id === 'C-stock-prompt-mode' && c.outcome === 'pass')
  ? 'compiled-frames'
  : 'raw-kernel-failsafe';

const result = makeResult({ startedAt, evalLive: live, evalCloud: cloud, promptMode, providers, cases });
const check = validateResult(result);
if (!check.ok) {
  console.error('result envelope invalid:', check.issues.join(', '));
  process.exit(2);
}

if (jsonOut) {
  const path = resolve(jsonOut);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stderr.write(`wrote ${path}\n`);
}

const w = Math.max(8, ...cases.map((c) => c.id.length));
console.log(`\ngreen quality  live=${live} cloud=${cloud} prompt_mode=${promptMode}\n`);
for (const [id, info] of Object.entries(providers)) {
  console.log(`  provider ${id.padEnd(16)} ${info.status}${info.reason ? `  ${info.reason}` : ''}`);
}
console.log('');
for (const row of cases) {
  const mark = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', record: 'REC ' }[row.outcome];
  console.log(`  ${mark}  ${row.id.padEnd(w)}  ${row.reason ?? ''}`);
}
const { pass, fail, skip, record } = result.summary;
console.log(`\n${pass} pass, ${fail} fail, ${skip} skip, ${record} record`);
if (cases.some((c) => c.mode === 'pairwise')) {
  console.log('pairwise recorded, not ranked (see docs/eval/QUALITY-COMPARISON.md §15)');
}

const code = fail > 0 ? 1 : 0;
if (code !== 0) process.exit(code);
