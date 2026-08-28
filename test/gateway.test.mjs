import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AgentRegistry } from '../src/registry.mjs';
import { ProcessManager } from '../src/process-manager.mjs';
import { PolicyGate } from '../src/scheduler.mjs';
import { SessionLedger } from '../src/sessions.mjs';
import { Gateway, prepareInferenceBody } from '../src/gateway.mjs';
import { sampleManifest } from './helpers.mjs';

async function withServer(t, env = {}) {
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const manifest = sampleManifest();
  const registry = await new AgentRegistry(manifest).inspect();
  const processes = new ProcessManager({ manifest, registry, spawnImpl() { throw new Error('should not spawn in this test'); } });
  const gateway = new Gateway({
    manifest,
    registry,
    processes,
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
    hostAdapter: { sampleResources() { return { freeMemoryBytes: 1 }; } },
  });
  const server = await gateway.listen('127.0.0.1', 0);
  t.after(async () => {
    server.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  });
  return { server, gateway };
}

function request(server, { path, method = 'GET', headers = {}, body } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers, family: 4, timeout: 5000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: JSON.parse(Buffer.concat(chunks).toString() || 'null'),
      }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('health is degraded when artifacts are missing and models stay truthful', async (t) => {
  const { server } = await withServer(t);
  const health = await request(server, { path: '/v1/health' });
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'degraded');
  const vision = health.body.agents.find((agent) => agent.id === 'vision-layout-agent');
  assert.deepEqual(vision.native_capabilities, ['text', 'image']);
  const models = await request(server, { path: '/v1/models' });
  assert.equal(models.body.data.length, 10);
});

test('logical router returns a plan without launching a backend', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, {
    path: '/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { model: 'tool-router-agent', messages: [{ role: 'user', content: 'summarize this paragraph' }] },
  });
  assert.equal(result.status, 200);
  const plan = JSON.parse(result.body.choices[0].message.content);
  assert.equal(plan.route, 'general-text-speculator');
  assert.ok(result.headers['x-session-id']);
});

test('public bind is rejected without explicit security flags', async () => {
  const manifest = sampleManifest();
  const registry = new AgentRegistry(manifest);
  const gateway = new Gateway({
    manifest,
    registry,
    processes: new ProcessManager({ manifest, registry }),
    sessions: new SessionLedger(),
    policy: new PolicyGate('maximize'),
  });
  delete process.env.GREEN_ROOMZ_API_KEY;
  delete process.env.GREEN_ROOMZ_ALLOW_PUBLIC;
  assert.throws(() => gateway.bindAddress('0.0.0.0'), /Public\/non-loopback/);
});

test('bearer auth is required when an API key is configured', async (t) => {
  const { server } = await withServer(t, { GREEN_ROOMZ_API_KEY: 'test-key' });
  const denied = await request(server, { path: '/v1/health' });
  assert.equal(denied.status, 401);
  const ok = await request(server, { path: '/v1/health', headers: { authorization: 'Bearer test-key' } });
  assert.equal(ok.status, 200);
});

test('unknown paths are 404 rather than proxied', async (t) => {
  const { server } = await withServer(t);
  const result = await request(server, { path: '/evil' });
  assert.equal(result.status, 404);
});

test('short general-text max_tokens disables Qwen3 thinking unless the client set it', () => {
  const agent = { alias: 'general-text-speculator' };
  const short = prepareInferenceBody({ max_tokens: 24, messages: [] }, agent);
  assert.equal(short.chat_template_kwargs.enable_thinking, false);
  const explicit = prepareInferenceBody({ max_tokens: 24, enable_thinking: true, messages: [] }, agent);
  assert.equal(explicit.enable_thinking, true);
  assert.equal(explicit.chat_template_kwargs, undefined);
  const code = prepareInferenceBody({ max_tokens: 24, messages: [] }, { alias: 'qwenstral-code-speculator' });
  assert.equal(code.chat_template_kwargs, undefined);
});
