export const REQUIRED_ALIASES = Object.freeze([
  'vision-layout-agent',
  'audio-transcription-agent',
  'qwenstral-code-speculator',
  'general-text-speculator',
  'semantic-embedding-agent',
  'retrieval-rerank-agent',
  'tool-router-agent',
  'safety-policy-agent',
  'speech-synthesis-agent',
  'image-generation-agent',
]);

export const POLICIES = Object.freeze({
  responsive: { maxHeavyInFlight: 1, objective: 'interactive' },
  balanced: { maxHeavyInFlight: 2, objective: 'balanced' },
  maximize: { maxHeavyInFlight: Number.POSITIVE_INFINITY, objective: 'throughput' },
});

export const TRANSLATION_ALIAS = 'translation-agent';
export const DEFAULT_MANIFEST = new URL('../config/agents.windows.json', import.meta.url);
