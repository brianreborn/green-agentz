/**
 * End-to-end harness: boots a REAL llama-server + a REAL green-roomz gateway on
 * throwaway ports and tears them down. Opt-in — the e2e suite skips unless
 * GRZ_E2E=1 and the llama.cpp binary + a small GGUF are on disk.
 *
 * Env overrides:
 *   GRZ_E2E=1                     enable the suite
 *   GRZ_E2E_LLAMA=<path to llama-server(.exe)>
 *   GRZ_E2E_MODEL=<path to a small .gguf>   (0.5B class recommended)
 *   GRZ_E2E_KEEP=1               leave processes running on teardown (debug)
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

const LLAMA_CANDIDATES = [
  process.env.GRZ_E2E_LLAMA,
  'C:/LocalAI/llama-b10665-bin-win-vulkan-x64/llama-server.exe',
  '/usr/local/bin/llama-server',
  '/usr/bin/llama-server',
].filter(Boolean);

const MODEL_CANDIDATES = [
  process.env.GRZ_E2E_MODEL,
  'C:/LocalAI/Qwenstral-Small-3.1-0.5B.Q4_K_M.gguf',
  'C:/LocalAI/qwen3-embedding-0.6b-q8_0.gguf',
].filter(Boolean);

export function e2ePrereqs() {
  if (process.env.GRZ_E2E !== '1') return { ok: false, reason: 'GRZ_E2E != 1' };
  const llama = LLAMA_CANDIDATES.find((p) => existsSync(p));
  const model = MODEL_CANDIDATES.find((p) => existsSync(p));
  if (!llama) return { ok: false, reason: 'no llama-server binary found' };
  if (!model) return { ok: false, reason: 'no GGUF model found' };
  return { ok: true, llama, model };
}

async function waitForHttp(url, { timeoutMs = 120_000, label = url } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status >= 200 && res.status < 500) return;
    } catch (err) { lastErr = err; }
    await delay(500);
  }
  throw new Error(`${label} never became reachable within ${timeoutMs}ms (${lastErr?.message ?? 'no response'})`);
}

/** Minimal 2-agent manifest: nexus + one text specialist, both on the same tiny model. */
export function writeTestManifest({ dir, nexusPort, specialistPort, gatewayPort, model }) {
  const manifest = {
    schema_version: 1,
    manifest_version: 'e2e',
    product: 'Green-Roomz',
    gateway: {
      host: '127.0.0.1',
      port: gatewayPort,
      policy: 'maximize',
      request_body_limit_bytes: 1 * 1024 * 1024,
      cold_start_timeout_ms: 120_000,
      retry_initial_ms: 100,
      retry_max_ms: 1000,
      retry_deadline_ms: 30_000,
      upstream_timeout_ms: 45_000,
      session_ttl_ms: 600_000,
      session_limit: 64,
      cors_origins: ['http://127.0.0.1'],
    },
    runtimes: {
      llama_server: {
        kind: 'llama-server',
        command: process.env.GRZ_E2E_LLAMA || 'C:/LocalAI/llama-b10665-bin-win-vulkan-x64/llama-server.exe',
        base_args: ['--host', '127.0.0.1', '--parallel', '1'],
        env: {},
      },
      whisper: { kind: 'whisper-server', command: '/nonexistent', base_args: [], env: {} },
      piper: { kind: 'piper', command: '/nonexistent', base_args: [], env: {} },
      stable_diffusion: { kind: 'stable-diffusion', command: '/nonexistent', base_args: [], env: {} },
    },
    agents: [
      {
        alias: 'tool-router-agent',
        description: 'e2e resident nexus',
        runtime: 'llama_server',
        port: nexusPort,
        resident: true,
        native_capabilities: ['text', 'routing', 'json'],
        gateway_accepted_capabilities: ['text', 'image', 'audio', 'file'],
        model,
        required_artifacts: ['model'],
        system_policy: 'policies/tool-router.md',
        context_size: 2048,
        profiles: [{ id: 'cpu-2', args: ['--device', 'none', '--threads', '2', '--threads-batch', '2', '--n-gpu-layers', '0'] }],
      },
      {
        alias: 'general-text-speculator',
        description: 'e2e text specialist',
        runtime: 'llama_server',
        port: specialistPort,
        native_capabilities: ['text', 'json', 'translation-on-request'],
        gateway_accepted_capabilities: ['text', 'file'],
        model,
        required_artifacts: ['model'],
        system_policy: 'policies/general-text.md',
        context_size: 2048,
        profiles: [{ id: 'cpu-2', args: ['--device', 'none', '--threads', '2', '--threads-batch', '2', '--n-gpu-layers', '0'] }],
      },
      {
        alias: 'security-monitor-agent',
        description: 'e2e logical monitor',
        runtime: 'logical',
        native_capabilities: ['text', 'json'],
        gateway_accepted_capabilities: ['text'],
        routing_behavior: 'mailbox',
      },
    ],
  };
  const file = path.join(dir, 'agents.e2e.json');
  writeFileSync(file, JSON.stringify(manifest, null, 2));
  return file;
}

const children = [];
function track(child, label) {
  children.push({ child, label });
  child.on('exit', (code, sig) => { if (code && code !== 0 && !stopping) console.error(`[e2e] ${label} exited code=${code} sig=${sig}`); });
  return child;
}
let stopping = false;

/** Pre-start ONE llama-server we control directly (for backend-death tests). */
export async function startLlamaServer({ llama, model, port }) {
  const args = ['--host', '127.0.0.1', '--port', String(port), '--model', model,
    '--ctx-size', '2048', '--parallel', '1', '--device', 'none', '--n-gpu-layers', '0', '--threads', '2'];
  const child = track(spawn(llama, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }), `llama:${port}`);
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    await waitForHttp(`http://127.0.0.1:${port}/health`, { timeoutMs: 120_000, label: `llama-server:${port}` });
  } catch (err) {
    throw new Error(`${err.message}\n--- llama-server log tail ---\n${log.slice(-1500)}`);
  }
  return {
    port,
    async stop() { child.kill('SIGKILL'); await once(child, 'exit').catch(() => {}); },
  };
}

/** Boot a real gateway from bin/green-roomz.mjs against a manifest. */
export async function startGateway({ manifestPath, port }) {
  const child = track(spawn(process.execPath, [path.join(REPO, 'bin', 'green-roomz.mjs'), 'serve', '--manifest', manifestPath], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  }), `gateway:${port}`);
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    await waitForHttp(`http://127.0.0.1:${port}/health`, { timeoutMs: 150_000, label: `gateway:${port}` });
  } catch (err) {
    throw new Error(`${err.message}\n--- gateway log tail ---\n${log.slice(-2000)}`);
  }
  return {
    base: `http://127.0.0.1:${port}`,
    log: () => log,
    async stop() { child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), delay(4000)]); child.kill('SIGKILL'); },
  };
}

export async function stopAll() {
  stopping = true;
  if (process.env.GRZ_E2E_KEEP === '1') return;
  for (const { child } of children.reverse()) {
    try { child.kill('SIGKILL'); } catch {}
  }
  await delay(200);
}

export function freePortHint(base) {
  // ephemeral-ish deterministic-ish ports for a single run
  return base + Math.floor(Math.random() * 400);
}

export { REPO, waitForHttp, delay, mkdtempSync, tmpdir, path };
