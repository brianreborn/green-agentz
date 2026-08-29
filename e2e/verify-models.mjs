#!/usr/bin/env node
/**
 * verify-models - drive a RUNNING green-roomz gateway and confirm every model
 * backend can actually cold-start and return output.
 *
 *   node test/e2e/verify-models.mjs [baseURL] [--only alias,alias] [--json]
 *
 * Default baseURL: http://127.0.0.1:8080
 * Exit 0 if every non-skipped model is ok/degraded, 1 otherwise.
 *
 * Each probe cold-starts its backend, so first run can take minutes. Timeout per
 * model defaults to 180s (override GRZ_VERIFY_TIMEOUT_MS).
 */
const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const only = (() => {
  const i = args.indexOf('--only');
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(',')) : null;
})();
const asJson = args.includes('--json');
const TIMEOUT = Number(process.env.GRZ_VERIFY_TIMEOUT_MS ?? 180_000);

const j = (obj) => JSON.stringify(obj);
async function call(pathname, body, { method = 'POST', headers = {}, timeout = TIMEOUT } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : j(body),
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text, headers: res.headers };
}

function classify(caps = []) {
  const c = new Set(caps);
  if (c.has('embedding')) return 'embedding';
  if (c.has('reranking')) return 'rerank';
  if (c.has('audio') && !c.has('audio-output')) return 'audio-in';
  if (c.has('audio-output')) return 'tts';
  if (c.has('image-output')) return 'image-gen';
  if (c.has('image')) return 'vision';
  return 'text';
}

async function probe(model) {
  const alias = model.id;
  const kind = classify(model.native_capabilities);
  const t0 = Date.now();
  const done = (state, detail) => ({ alias, kind, state, ms: Date.now() - t0, detail });

  if (model.availability === 'unavailable') {
    return done('skip', `unavailable: ${(model.unavailable_reasons ?? []).join('; ') || 'missing artifact'}`);
  }

  try {
    if (kind === 'embedding') {
      const r = await call('/v1/embeddings', { model: alias, input: 'green roomz health probe' });
      const vec = r.json?.data?.[0]?.embedding;
      if (r.status === 200 && Array.isArray(vec) && vec.length > 8) return done('ok', `dim ${vec.length}`);
      return done('fail', `status ${r.status}: ${r.text.slice(0, 160)}`);
    }
    if (kind === 'rerank') {
      const r = await call('/v1/rerank', { model: alias, query: 'fast local llm', documents: ['a slow cloud model', 'a fast local llama.cpp gateway'] });
      const results = r.json?.results ?? r.json?.data;
      if (r.status === 200 && Array.isArray(results) && results.length === 2) return done('ok', `scored ${results.length}`);
      return done('fail', `status ${r.status}: ${r.text.slice(0, 160)}`);
    }
    if (kind === 'tts' || kind === 'image-gen' || kind === 'audio-in') {
      // No safe synthetic input without a real asset; confirm the gateway rejects
      // cleanly on the chat path rather than hang (documented behaviour).
      const r = await call('/v1/chat/completions', { model: alias, lock_alias: true, messages: [{ role: 'user', content: 'probe' }], max_tokens: 4 });
      if ([200, 400, 415, 503].includes(r.status)) return done('degraded', `chat-path status ${r.status} (needs a real ${kind} asset to fully verify)`);
      return done('fail', `unexpected status ${r.status}`);
    }
    // text + vision: a real 1-token completion, locked to this alias
    const r = await call('/v1/chat/completions', {
      model: alias, lock_alias: true,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_tokens: 12,
    });
    const content = r.json?.choices?.[0]?.message?.content;
    if (r.status === 200 && typeof content === 'string' && content.trim().length > 0) {
      return done('ok', j(content.slice(0, 48)));
    }
    if ([502, 503, 504].includes(r.status)) return done('fail', `backend not answering (${r.status})`);
    return done('fail', `status ${r.status}: ${r.text.slice(0, 160)}`);
  } catch (err) {
    return done('fail', err.name === 'TimeoutError' ? `timed out after ${TIMEOUT}ms` : String(err.message ?? err));
  }
}

(async () => {
  let health;
  try {
    health = await call('/health', undefined, { method: 'GET', timeout: 5000 });
  } catch (err) {
    console.error(`cannot reach gateway at ${base}: ${err.message}`);
    process.exit(2);
  }
  const models = (await call('/v1/models', undefined, { method: 'GET', timeout: 5000 })).json?.data ?? [];
  const targets = models.filter((m) => (!only || only.has(m.id)));
  if (!targets.length) { console.error('no models to probe'); process.exit(2); }

  const results = [];
  for (const m of targets) {
    process.stderr.write(`probing ${m.id} ...`);
    const r = await probe(m);
    process.stderr.write(` ${r.state} (${(r.ms / 1000).toFixed(1)}s)\n`);
    results.push(r);
  }

  if (asJson) {
    console.log(j({ base, gateway_status: health.json?.status, results }, null, 2));
  } else {
    const w = Math.max(...results.map((r) => r.alias.length));
    console.log(`\ngateway ${base} - status ${health.json?.status}\n`);
    for (const r of results) {
      const mark = { ok: 'PASS', degraded: 'WARN', skip: 'SKIP', fail: 'FAIL' }[r.state];
      console.log(`  ${mark}  ${r.alias.padEnd(w)}  ${String((r.ms / 1000).toFixed(1) + 's').padStart(7)}  ${r.kind.padEnd(10)} ${r.detail}`);
    }
    const bad = results.filter((r) => r.state === 'fail');
    const warn = results.filter((r) => r.state === 'degraded');
    console.log(`\n${results.filter((r) => r.state === 'ok').length} ok, ${warn.length} degraded, ${results.filter((r) => r.state === 'skip').length} skipped, ${bad.length} failed`);
  }
  process.exit(results.some((r) => r.state === 'fail') ? 1 : 0);
})();
