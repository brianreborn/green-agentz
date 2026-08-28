import { Readable } from 'node:stream';
import { jitteredBackoff, sleep } from './util.mjs';

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function upstreamHeaders(request) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (!value || HOP_BY_HOP.has(lower) || lower === 'authorization' || lower === 'host' || lower === 'content-length') continue;
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

export async function proxyJson({ request, response, body, target, config, signal, fetchImpl = fetch }) {
  const payload = Buffer.from(JSON.stringify(body));
  const idempotencyKey = request.headers['idempotency-key'];
  const deadline = Date.now() + config.retry_deadline_ms;
  let attempt = 0;
  while (true) {
    try {
      const upstream = await fetchImpl(target, { method: request.method, headers: upstreamHeaders(request), body: payload, signal });
      if (upstream.status === 503 && idempotencyKey && Date.now() < deadline) {
        await upstream.body?.cancel();
        await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
        continue;
      }
      response.writeHead(upstream.status, downstreamHeaders(upstream));
      if (!upstream.body) return response.end();
      Readable.fromWeb(upstream.body).pipe(response);
      return;
    } catch (error) {
      const code = error.cause?.code ?? error.code;
      if (code !== 'ECONNREFUSED' || Date.now() >= deadline) throw error;
      await sleep(jitteredBackoff(attempt++, config.retry_initial_ms, config.retry_max_ms), signal);
    }
  }
}
