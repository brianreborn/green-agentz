import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentCanAdmit, estimateResidentBytes, headroomBytes, profileAdmitted } from '../src/memory.mjs';

const GiB = 1024 ** 3;
const MODEL_BYTES = Math.round(4.36 * GiB);

function withModel(sizeBytes = MODEL_BYTES) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'grz-mem-'));
  const model = path.join(dir, 'model.gguf');
  writeFileSync(model, '');
  truncateSync(model, sizeBytes);
  return { dir, model, cleanup() { rmSync(dir, { recursive: true, force: true }); } };
}

function cpuProfile() {
  return { id: 'cpu-4', args: ['--device', 'none', '--n-gpu-layers', '0'] };
}

function gpuProfile() {
  return { id: 'vulkan-all', args: ['--device', 'Vulkan0', '--n-gpu-layers', 'all'] };
}

test('headroom is 2 GiB on PCs and 256 MiB on phones', () => {
  assert.equal(headroomBytes(15.24 * GiB), 2 * GiB);
  assert.equal(headroomBytes(16 * GiB), 2 * GiB);
  assert.equal(headroomBytes(1 * GiB), 256 * 1024 * 1024);
  assert.equal(headroomBytes(5.7 * GiB), 256 * 1024 * 1024);
});

test('a CPU profile over the free-RAM estimate is admitted but flagged tight (OS pages)', () => {
  const { model, cleanup } = withModel();
  try {
    const agent = { alias: 'qwenstral-code-speculator', model, draft_enabled: false };
    const profile = cpuProfile();
    const estimate = estimateResidentBytes(agent, profile, { includeDraft: false });
    assert.equal(estimate, Math.round(MODEL_BYTES * 1.6 + 512 * 1024 * 1024));
    const tight = profileAdmitted(agent, profile, { freeMemoryBytes: 5 * GiB, includeDraft: false });
    assert.equal(tight.ok, true, 'never vetoed on free RAM');
    assert.equal(tight.reason, 'tight');
    assert.equal(tight.pressure, 'tight');
    assert.equal(tight.estimateBytes, estimate);
    assert.ok(tight.estimateBytes + tight.headroomBytes > 5 * GiB);
  } finally {
    cleanup();
  }
});

test('same CPU profile is admitted when 20 GiB is free', () => {
  const { model, cleanup } = withModel();
  try {
    const agent = { alias: 'qwenstral-code-speculator', model };
    const admitted = profileAdmitted(agent, cpuProfile(), { freeMemoryBytes: 20 * GiB, includeDraft: false });
    assert.equal(admitted.ok, true);
    assert.equal(admitted.reason, 'admitted');
    assert.ok(admitted.estimateBytes + admitted.headroomBytes <= 20 * GiB);
  } finally {
    cleanup();
  }
});

test('GPU profile is admitted even when free memory is tight', () => {
  const { model, cleanup } = withModel();
  try {
    const agent = { alias: 'qwenstral-code-speculator', model };
    const admitted = profileAdmitted(agent, gpuProfile(), { freeMemoryBytes: 1, includeDraft: false });
    assert.equal(admitted.ok, true);
    assert.equal(admitted.estimateBytes, null);
    assert.equal(admitted.reason, 'unknown');
  } finally {
    cleanup();
  }
});

test('missing model is admitted as unknown rather than rejected', () => {
  const agent = { alias: 'qwenstral-code-speculator', model: path.join(os.tmpdir(), 'grz-missing-code.gguf') };
  const admitted = profileAdmitted(agent, cpuProfile(), { freeMemoryBytes: 1, includeDraft: false });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.estimateBytes, null);
  assert.equal(admitted.reason, 'unknown');
});

test('agentCanAdmit always admits under memory pressure (OS pages); CPU-only run is flagged tight', () => {
  const { model, cleanup } = withModel();
  try {
    const withGpu = { alias: 'qwenstral-code-speculator', model, draft_enabled: false, profiles: [cpuProfile(), gpuProfile()] };
    assert.equal(agentCanAdmit(withGpu, { freeMemoryBytes: 5 * GiB, includeDraft: false }).ok, true);

    const cpuOnly = { alias: 'qwenstral-code-speculator', model, draft_enabled: false, profiles: [cpuProfile()] };
    const tight = agentCanAdmit(cpuOnly, { freeMemoryBytes: 5 * GiB, includeDraft: false });
    assert.equal(tight.ok, true);
    assert.equal(tight.pressure, 'tight');
  } finally {
    cleanup();
  }
});
