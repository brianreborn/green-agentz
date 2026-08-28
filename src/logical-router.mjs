import { detectModalities } from './routing.mjs';

function collectText(body) {
  const parts = [];
  for (const message of body?.messages ?? []) {
    if (typeof message?.content === 'string') parts.push(message.content);
    else if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (typeof part === 'string') parts.push(part);
        else if (typeof part?.text === 'string') parts.push(part.text);
      }
    }
  }
  return parts.join('\n');
}

export function planRoute(body) {
  const modality = detectModalities(body);
  const text = collectText(body);
  if (modality.image && modality.audio) {
    return {
      route: null,
      confidence: 1,
      reason_code: 'mixed_media_unsupported',
      required_modalities: ['image', 'audio'],
      allowed_tool_arguments: {},
    };
  }
  if (modality.audio) {
    return {
      route: 'audio-transcription-agent',
      confidence: 1,
      reason_code: 'audio_input',
      required_modalities: ['audio'],
      allowed_tool_arguments: {},
    };
  }
  if (modality.image) {
    return {
      route: 'vision-layout-agent',
      confidence: 1,
      reason_code: 'image_input',
      required_modalities: ['image'],
      allowed_tool_arguments: {},
    };
  }
  if (/\bembed(ding)?s?\b|\bsimilarit(y|ies)\b/i.test(text)) {
    return {
      route: 'semantic-embedding-agent',
      confidence: 0.8,
      reason_code: 'embedding_intent',
      required_modalities: ['text'],
      allowed_tool_arguments: {},
    };
  }
  if (/\brerank\b|\brelevance score\b/i.test(text)) {
    return {
      route: 'retrieval-rerank-agent',
      confidence: 0.8,
      reason_code: 'rerank_intent',
      required_modalities: ['text'],
      allowed_tool_arguments: {},
    };
  }
  if (/```|\btypescript\b|\bpython\b|\bfunction\b|\bjson schema\b/i.test(text)) {
    return {
      route: 'qwenstral-code-speculator',
      confidence: 0.75,
      reason_code: 'code_intent',
      required_modalities: ['text'],
      allowed_tool_arguments: {},
    };
  }
  return {
    route: 'general-text-speculator',
    confidence: 0.6,
    reason_code: 'default_text',
    required_modalities: ['text'],
    allowed_tool_arguments: {},
  };
}
