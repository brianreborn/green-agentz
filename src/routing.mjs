import { ValidationError } from './errors.mjs';

function inspectContentPart(part, found) {
  if (!part || typeof part !== 'object') return;
  const type = String(part.type ?? '').toLowerCase();
  if (type === 'image_url' || type === 'input_image') found.image = true;
  if (type === 'input_audio' || type === 'audio') found.audio = true;
  const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
  if (typeof url === 'string' && url.toLowerCase().startsWith('data:image/')) found.image = true;
  const audio = part.input_audio?.data ?? part.audio_url;
  if (typeof audio === 'string' && audio.toLowerCase().startsWith('data:audio/')) found.audio = true;
}

export function detectModalities(body) {
  const found = { image: false, audio: false };
  for (const message of body?.messages ?? []) {
    if (!Array.isArray(message?.content)) continue;
    for (const part of message.content) inspectContentPart(part, found);
  }
  return found;
}

export function routeRequest(body, registry, sessionAgent) {
  const modality = detectModalities(body);
  if (modality.image && modality.audio) throw new ValidationError('Mixed image and audio input requires an explicitly qualified workflow');
  let alias = sessionAgent ?? body.model;
  let reason = sessionAgent ? 'session_affinity' : 'requested_alias';
  if (modality.audio) {
    alias = 'audio-transcription-agent';
    reason = 'audio_input';
  } else if (modality.image) {
    alias = 'vision-layout-agent';
    reason = 'image_input';
  }
  if (!alias) alias = 'general-text-speculator';
  return { requestedAlias: body.model ?? null, effectiveAlias: alias, agent: registry.get(alias), modality, reason };
}

export function isExplicitTranslationRequest(body) {
  const text = (body?.messages ?? []).flatMap((message) => typeof message?.content === 'string' ? [message.content] : []).join('\n');
  return /\btranslate\b|\btranslation\b/i.test(text);
}
