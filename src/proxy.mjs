import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { UPSTREAM_MAX_BUFFER_BYTES, UPSTREAM_TIMEOUT_MS } from './constants.mjs';
import { UpstreamProtocolError, UpstreamTimeoutError } from './errors.mjs';
import { deadlineSignal, isTimeoutAbort, jitteredBackoff, readCappedText, sleep, stripEscapes } from './util.mjs';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const UPSTREAM_HEADER_ALLOW = new Set(['content-type', 'accept', 'idempotency-key']);

export function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers ?? {})) {
    const lower = key.toLowerCase();
    if (!value || HOP_BY_HOP.has(lower) || !UPSTREAM_HEADER_ALLOW.has(lower)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('content-type', 'application/json');
  return headers;
}

function downstreamHeaders(response) {
  const headers = {};
  for (const [key, value] of response.headers) if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = value;
  return headers;
}

export function sanitizeCompletionJson(payload, { keepReasoning = false } = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload };
  delete next.timings;
  if (Array.isArray(next.choices)) {
    next.choices = next.choices.map((choice) => {
      if (!choice || typeof choice !== 'object') return choice;
      const copy = { ...choice };
      if (copy.message && typeof copy.message === 'object') {
        const message = { ...copy.message };
        if (!keepReasoning) {
          delete message.reasoning;
          delete message.reasoning_content;
        }
        if (typeof message.content === 'string') message.content = stripEscapes(message.content);
        copy.message = message;
      }
      if (copy.delta && typeof copy.delta === 'object') {
        const delta = { ...copy.delta };
        if (!keepReasoning) {
          delete delta.reasoning;
          delete delta.reasoning_content;
        }
        if (typeof delta.content === 'string') delta.content = stripEscapes(delta.content);
        copy.delta = delta;
      }
      return copy;
    });
  }
  return next;
}

function clientAskedForReasoning(body) {
  return body?.enable_thinking === true || body?.chat_template_kwargs?.enable_thinking === true;
}

export async function proxyJson({ request, response, body, target, config, signal, fetchImpl = fetch }) {
  const payload = Buffer.from(JSON.stringify(body));
  const idempotencyKey = request.headers['idempotency-key'];
  const deadline = Date.now() + config.retry_deadline_ms;
  const upstreamTimeout = config.upstream_timeout_ms ?? UPSTREAM_TIMEOUT_MS;
  const maxBuffer = config.upstream_max_buffer_bytes ?? UPSTREAM_MAX_BUFFER_BYTES;
  let attempt = 0;
  const keepReasoning = clientAskedForReasoning(body);
  while (true) {
    const attemptSignal = deadlineSignal(signal, upstreamTimeout);
    try {
      const upstream = await fetchImpl(target, { method: request.method, headers: upstreamHeaders(request), body: payload, signal: attemptSignal });
      if (upstream.status === 503 && idempotencyKey && Date.now() < deadline) {
        try { await upstream.body?.cancel(); } catch {}
        await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
        continue;
      }
      const canSanitize = !body?.stream && (typeof upstream.text === 'function' || upstream.body);
      if (canSanitize) {
        let raw;
        try {
          raw = await readCappedText(upstream, maxBuffer);
        } catch (readError) {
          if (readError?.code === 'UPSTREAM_TOO_LARGE') {
            throw new UpstreamProtocolError('upstream response exceeded buffer cap', { maxBuffer });
          }
          throw readError;
        }
        const headers = downstreamHeaders(upstream);
        delete headers['content-length'];
        let data;
        try {
          data = Buffer.from(JSON.stringify(sanitizeCompletionJson(JSON.parse(raw), { keepReasoning })));
        } catch {
          data = Buffer.from(raw);
        }
        if (response.writableEnded) return;
        response.writeHead(upstream.status, { ...headers, 'content-length': data.length });
        return response.end(data);
      }
      if (response.writableEnded) {
        try { await upstream.body?.cancel(); } catch {}
        return;
      }
      response.writeHead(upstream.status, downstreamHeaders(upstream));
      if (!upstream.body) return response.end();
      try {
        await pipeline(Readable.fromWeb(upstream.body), response, { signal: attemptSignal });
      } catch (streamError) {
        // Client gone or upstream stalled mid-stream: tear the socket down, do not rethrow
        // into the handler (headers are already sent).
        if (!response.writableEnded) response.destroy(streamError);
      }
      return;
    } catch (error) {
      if (isTimeoutAbort(error, signal)) {
        throw new UpstreamTimeoutError('upstream backend timed out', { target: redactTarget(target), timeout_ms: upstreamTimeout });
      }
      if (signal?.aborted) throw error;
      const code = error.cause?.code ?? error.code;
      if (code !== 'ECONNREFUSED' || Date.now() >= deadline) throw error;
      await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
    }
  }
}

function redactTarget(target) {
  try { const u = new URL(target); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return 'upstream'; }
}
