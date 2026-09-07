/** Machine checks for A–I. Pairwise J is record-only unless a judge is wired. */

export const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
export const FENCE = /```/;
export const MODALITY_ALIASES = Object.freeze([
  'vision-layout-agent',
  'audio-transcription-agent',
  'speech-synthesis-agent',
]);

export function pass(reason, extra = {}) {
  return { outcome: 'pass', reason, checks: extra.checks ?? [], ...extra };
}

export function fail(reason, extra = {}) {
  return { outcome: 'fail', reason, checks: extra.checks ?? [], ...extra };
}

export function skip(reason, extra = {}) {
  return { outcome: 'skip', reason, checks: extra.checks ?? [], ...extra };
}

export function record(reason, extra = {}) {
  return { outcome: 'record', reason, checks: extra.checks ?? [], ...extra };
}

export function check(name, ok, detail = '') {
  return { name, ok: Boolean(ok), detail: String(detail ?? '') };
}

export function allPass(checks, reasonOk, reasonFail) {
  const bad = checks.find((c) => !c.ok);
  if (!bad) return pass(reasonOk, { checks });
  const detail = `${bad.name}: ${bad.detail}`;
  return fail(reasonFail ? `${reasonFail} (${detail})` : detail, { checks });
}

export function assistantText(json) {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return JSON.stringify(c);
  return '';
}

export function parseJsonish(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

export function hasLeadingProse(text) {
  const raw = String(text ?? '').trim();
  if (!raw.startsWith('{') && !raw.startsWith('[')) return true;
  return false;
}

export function claimsPixels(text) {
  const t = String(text ?? '');
  if (/data:image\//i.test(t)) return true;
  if (/i (?:have |just )?(?:generated|created|drew|rendered) (?:the |an )?image/i.test(t)) return true;
  return false;
}

export function inventedSerial(text) {
  const t = String(text ?? '');
  if (/cannot|can't|no image|not attached|unavailable|unable/i.test(t)) return false;
  return /\b(?:serial|s\/n)[^\n]{0,40}\b[A-Z0-9-]{5,}\b/i.test(t) || /\b[A-Z]{2,}\d{4,}\b/.test(t);
}
