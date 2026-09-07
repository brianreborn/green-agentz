/**
 * Provider probes. Missing peers skip; they never fail the suite.
 * Paid HTTP requires EVAL_CLOUD=1 in addition to EVAL_LIVE=1.
 */
import { assistantText } from './scoring.mjs';

export const ROOMZ_DEFAULT = 'http://127.0.0.1:8080';
export const GROK_URL = 'https://api.x.ai/v1/chat/completions';

export function envFlag(name) {
  const v = String(process.env[name] ?? '').trim();
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

export function roomzBase() {
  return String(process.env.EVAL_ROOMZ_URL ?? ROOMZ_DEFAULT).replace(/\/$/, '');
}

export function rawLlamaBase() {
  const u = String(process.env.EVAL_RAW_LLAMA_URL ?? '').trim();
  return u ? u.replace(/\/$/, '') : '';
}

export async function httpJson(url, { method = 'GET', body, headers = {}, timeout = 90_000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return {
      status: res.status,
      json,
      text,
      headers: Object.fromEntries(res.headers.entries()),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeHttp(label, url) {
  try {
    const r = await httpJson(url, { method: 'GET', timeout: 4000 });
    if (r.status >= 200 && r.status < 500) return { status: 'ok', reason: null, base: url.replace(/\/health$/, '').replace(/\/v1\/models$/, '') };
    return { status: 'skip', reason: `${label} HTTP ${r.status}`, base: url };
  } catch (err) {
    return { status: 'skip', reason: `${label} unreachable: ${err.message ?? err}`, base: url };
  }
}

export async function probeProviders({ live = envFlag('EVAL_LIVE'), cloud = envFlag('EVAL_CLOUD') } = {}) {
  const providers = {
    'in-process': { status: 'ok', reason: null, base: null },
    roomz: { status: 'skip', reason: 'EVAL_LIVE!=1', base: roomzBase() },
    'raw-llama': { status: 'skip', reason: 'EVAL_RAW_LLAMA_URL unset', base: rawLlamaBase() || null },
    'cloud-grok': { status: 'skip', reason: cloud ? 'missing_XAI_API_KEY' : 'EVAL_CLOUD!=1', base: GROK_URL },
    'cloud-openai': { status: 'skip', reason: 'optional v1; no OPENAI_API_KEY adapter', base: null },
    'cloud-anthropic': { status: 'skip', reason: 'optional v1; no ANTHROPIC_API_KEY adapter', base: null },
    'host-agent': { status: 'skip', reason: 'no local skill/session adapter (v1)', base: null },
  };

  if (live) {
    const health = `${roomzBase()}/health`;
    providers.roomz = await probeHttp('roomz', health);
    providers.roomz.base = roomzBase();
    const raw = rawLlamaBase();
    if (raw) {
      const rawHealth = await probeHttp('raw-llama', `${raw}/health`);
      if (rawHealth.status !== 'ok') {
        providers['raw-llama'] = await probeHttp('raw-llama', `${raw}/v1/models`);
      } else {
        providers['raw-llama'] = rawHealth;
      }
      providers['raw-llama'].base = raw;
    }
  }

  if (cloud && process.env.XAI_API_KEY) {
    providers['cloud-grok'] = { status: 'ok', reason: null, base: GROK_URL, model: process.env.EVAL_GROK_MODEL ?? 'grok-3' };
  } else if (cloud) {
    providers['cloud-grok'] = { status: 'skip', reason: 'missing_XAI_API_KEY', base: GROK_URL };
  }

  return { live, cloud, providers };
}

export function roomzClient(base, timeout = 90_000) {
  const root = String(base ?? roomzBase()).replace(/\/$/, '');
  return {
    base: root,
    get: (pathname) => httpJson(root + pathname, { method: 'GET', timeout: Math.min(timeout, 10_000) }),
    post: (pathname, body, headers = {}) => httpJson(root + pathname, { method: 'POST', body, headers, timeout }),
  };
}

export async function chatProvider(provider, providers, messages, extra = {}) {
  const info = providers[provider];
  if (!info || info.status !== 'ok') {
    return { skipped: true, reason: info?.reason ?? `${provider} not ok` };
  }
  if (provider === 'roomz') {
    const client = roomzClient(info.base);
    const r = await client.post('/v1/chat/completions', {
      model: extra.model ?? 'auto',
      lock_alias: extra.lock_alias,
      max_tokens: extra.max_tokens ?? 256,
      messages,
      ...extra.body,
    }, extra.headers ?? {});
    return { skipped: false, provider, ...r, content: assistantText(r.json) };
  }
  if (provider === 'raw-llama') {
    const url = `${String(info.base).replace(/\/$/, '')}/v1/chat/completions`;
    const r = await httpJson(url, {
      method: 'POST',
      body: {
        messages,
        max_tokens: extra.max_tokens ?? 256,
        temperature: extra.temperature ?? 0,
      },
      timeout: extra.timeout ?? 90_000,
    });
    return { skipped: false, provider, ...r, content: assistantText(r.json) };
  }
  if (provider === 'cloud-grok') {
    const r = await httpJson(GROK_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: {
        model: info.model ?? process.env.EVAL_GROK_MODEL ?? 'grok-3',
        messages,
        max_tokens: extra.max_tokens ?? 256,
        temperature: 0,
      },
      timeout: extra.timeout ?? 90_000,
    });
    return { skipped: false, provider, ...r, content: assistantText(r.json) };
  }
  return { skipped: true, reason: `${provider} has no chat adapter in v1` };
}
