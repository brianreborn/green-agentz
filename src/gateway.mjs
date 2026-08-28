import { createServer } from 'node:http';
import { GreenRoomzError, UnavailableError, ValidationError } from './errors.mjs';
import { jsonResponse, redact, secureEquals } from './util.mjs';
import { routeRequest } from './routing.mjs';
import { proxyJson } from './proxy.mjs';
import { planRoute } from './logical-router.mjs';

const EXPLICIT_ROUTES = new Set([
  '/health',
  '/v1/health',
  '/v1/models',
  '/props',
  '/metrics',
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/rerank',
]);

function identityFrom(request, apiKey) {
  const header = request.headers.authorization ?? '';
  if (apiKey) {
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!secureEquals(token, apiKey)) return null;
    return 'authenticated';
  }
  return 'loopback-dev';
}

function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new ValidationError('Request body exceeds configured limit', { limit }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function corsHeaders(manifest, origin) {
  const allowed = manifest.gateway?.cors_origins ?? [];
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type, x-session-id, idempotency-key',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  };
}

// Measured 10:02 PT live POST: Qwen3 thinking consumed all 24 max_tokens (content empty).
const QWEN3_SHORT_MAX_TOKENS = 64;

export function prepareInferenceBody(body, agent) {
  const payload = { ...body, model: agent.alias };
  if (agent.alias !== 'general-text-speculator') return payload;
  const explicit = payload.enable_thinking ?? payload.chat_template_kwargs?.enable_thinking;
  if (explicit !== undefined) return payload;
  const maxTokens = Number(payload.max_tokens);
  if (Number.isFinite(maxTokens) && maxTokens > 0 && maxTokens < QWEN3_SHORT_MAX_TOKENS) {
    payload.chat_template_kwargs = { ...(payload.chat_template_kwargs ?? {}), enable_thinking: false };
  }
  return payload;
}

export class Gateway {
  constructor({ manifest, registry, processes, sessions, policy, hostAdapter }) {
    this.manifest = manifest;
    this.registry = registry;
    this.processes = processes;
    this.sessions = sessions;
    this.policy = policy;
    this.hostAdapter = hostAdapter;
    this.apiKey = process.env.GREEN_ROOMZ_API_KEY || '';
    this.startedAt = Date.now();
  }

  bindAddress(host) {
    const requested = host ?? this.manifest.gateway.host ?? '127.0.0.1';
    const loopback = requested === '127.0.0.1' || requested === 'localhost' || requested === '::1';
    if (!loopback) {
      if (!this.apiKey || process.env.GREEN_ROOMZ_ALLOW_PUBLIC !== '1') {
        throw new ValidationError('Public/non-loopback binding requires GREEN_ROOMZ_API_KEY and GREEN_ROOMZ_ALLOW_PUBLIC=1');
      }
    }
    return requested;
  }

  async handle(request, response) {
    const origin = request.headers.origin;
    const cors = corsHeaders(this.manifest, origin);
    const abort = new AbortController();
    // IncomingMessage 'close' fires after the body is consumed, not only on hangup.
    // Abort the backend start only if the client disconnects before we finish writing.
    response.once('close', () => {
      if (!response.writableFinished) abort.abort();
    });
    request.abortSignal = abort.signal;
    if (request.method === 'OPTIONS') {
      response.writeHead(204, cors);
      return response.end();
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      const identity = identityFrom(request, this.apiKey);
      if (!identity) return jsonResponse(response, 401, { error: { message: 'Unauthorized', type: 'auth_error' } }, cors);
      if (!EXPLICIT_ROUTES.has(url.pathname)) return jsonResponse(response, 404, { error: { message: 'Not found', type: 'not_found' } }, cors);
      if (url.pathname === '/health' || url.pathname === '/v1/health') {
        return jsonResponse(response, 200, this.health(), cors);
      }
      if (url.pathname === '/v1/models') {
        return jsonResponse(response, 200, { object: 'list', data: this.registry.listModels() }, cors);
      }
      if (url.pathname === '/props') {
        return jsonResponse(response, 200, {
          product: 'Green-Roomz',
          policy: this.policy.policy,
          native_capabilities_are_truthful: true,
          models: this.registry.listModels(),
        }, cors);
      }
      if (url.pathname === '/metrics') {
        if (this.apiKey && identity !== 'authenticated') return jsonResponse(response, 401, { error: { message: 'Unauthorized' } }, cors);
        return jsonResponse(response, 200, this.metrics(), cors);
      }
      if (request.method !== 'POST') return jsonResponse(response, 405, { error: { message: 'Method not allowed' } }, { allow: 'POST', ...cors });
      const raw = await readBody(request, this.manifest.gateway.request_body_limit_bytes ?? 16 * 1024 * 1024);
      const body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      if (url.pathname === '/v1/embeddings') body.model = body.model ?? 'semantic-embedding-agent';
      if (url.pathname === '/v1/rerank') body.model = body.model ?? 'retrieval-rerank-agent';
      return await this.handleInference(request, response, body, identity, cors);
    } catch (error) {
      const status = error instanceof GreenRoomzError ? error.status : 500;
      const retryAfter = error instanceof UnavailableError ? { 'retry-after': '2' } : {};
      return jsonResponse(response, status, {
        error: {
          message: redact(error.message),
          type: error.code ?? 'internal_error',
          details: error.details,
        },
      }, { ...cors, ...retryAfter });
    }
  }

  health() {
    const models = this.registry.listModels();
    const unavailable = models.filter((model) => model.availability === 'unavailable');
    return {
      status: unavailable.length ? 'degraded' : 'ok',
      product: 'Green-Roomz',
      uptime_ms: Date.now() - this.startedAt,
      policy: this.policy.policy,
      agents: models,
    };
  }

  metrics() {
    return {
      policy: this.policy.policy,
      in_flight: this.policy.active,
      queued: this.policy.queue.length,
      sessions: this.sessions.entries.size,
      processes: [...this.processes.processes.values()].map((record) => ({
        alias: record.alias,
        pid: record.pid,
        state: record.state,
        profileId: record.profileId,
      })),
      resources: this.hostAdapter?.sampleResources?.() ?? null,
    };
  }

  async handleInference(request, response, body, identity, cors) {
    const sessionId = request.headers['x-session-id'] || body.session_id;
    const session = this.sessions.get(sessionId, identity);
    const routed = routeRequest(body, this.registry, session?.agentAlias);
    const availability = this.registry.status(routed.effectiveAlias);
    if (availability.state === 'unavailable') {
      throw new UnavailableError(`${routed.effectiveAlias} is unavailable`, availability.missing);
    }
    const issuedSession = session?.id ?? this.sessions.create({
      identity,
      agentAlias: routed.effectiveAlias,
      modality: routed.modality,
    });
    response.setHeader('x-session-id', issuedSession);
    response.setHeader('x-green-roomz-requested-alias', String(routed.requestedAlias ?? ''));
    response.setHeader('x-green-roomz-effective-alias', routed.effectiveAlias);
    response.setHeader('x-green-roomz-route-reason', routed.reason);
    for (const [key, value] of Object.entries(cors)) response.setHeader(key, value);

    if (routed.agent.runtime === 'logical') {
      const plan = planRoute(body);
      return jsonResponse(response, 200, {
        id: `grz-route-${issuedSession}`,
        object: 'chat.completion',
        model: routed.effectiveAlias,
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(plan) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }, {
        'x-session-id': issuedSession,
        'x-green-roomz-requested-alias': String(routed.requestedAlias ?? ''),
        'x-green-roomz-effective-alias': routed.effectiveAlias,
        'x-green-roomz-route-reason': routed.reason,
        ...cors,
      });
    }

    const release = await this.policy.acquire(request.abortSignal);
    try {
      const record = await this.processes.ensure(routed.agent, { signal: request.abortSignal });
      const payload = prepareInferenceBody(body, routed.agent);
      const target = `http://127.0.0.1:${routed.agent.port}${request.url.split('?')[0]}`;
      await proxyJson({
        request,
        response,
        body: payload,
        target,
        config: this.manifest.gateway,
        signal: request.abortSignal,
      });
      return record;
    } finally {
      release();
    }
  }

  listen(host, port) {
    const address = this.bindAddress(host);
    const listenPort = Number(port ?? this.manifest.gateway.port ?? 8080);
    const server = createServer((req, res) => {
      Promise.resolve(this.handle(req, res)).catch((error) => { if (!res.headersSent) jsonResponse(res, 500, { error: { message: String(error.message), type: "internal_error" } }); });
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(listenPort, address, () => resolve(server));
    });
  }
}
