import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry } from '../src/registry.mjs';
import { routeRequest, isExplicitTranslationRequest } from '../src/routing.mjs';
import { ValidationError } from '../src/errors.mjs';
import { sampleManifest } from './helpers.mjs';

function registry() {
  return new AgentRegistry(sampleManifest());
}

test('image input overrides to vision-layout-agent', () => {
  const routed = routeRequest({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xxxx' } }] }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'vision-layout-agent');
  assert.equal(routed.reason, 'image_input');
});

test('audio input overrides to audio-transcription-agent', () => {
  const routed = routeRequest({
    model: 'general-text-speculator',
    messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,xxxx' } }] }],
  }, registry());
  assert.equal(routed.effectiveAlias, 'audio-transcription-agent');
});

test('mixed image and audio is rejected', () => {
  assert.throws(() => routeRequest({
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,x' } },
      { type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,x' } },
    ] }],
  }, registry()), ValidationError);
});

test('unknown alias is rejected', () => {
  assert.throws(() => routeRequest({ model: 'translation-agent', messages: [] }, registry()), ValidationError);
});

test('translation is not inferred from foreign-looking text', () => {
  assert.equal(isExplicitTranslationRequest({ messages: [{ role: 'user', content: 'Bonjour, comment ça va?' }] }), false);
  assert.equal(isExplicitTranslationRequest({ messages: [{ role: 'user', content: 'Please translate this to English' }] }), true);
});

test('session affinity wins over requested alias for text', () => {
  const routed = routeRequest({ model: 'qwenstral-code-speculator', messages: [{ role: 'user', content: 'hello' }] }, registry(), 'general-text-speculator');
  assert.equal(routed.effectiveAlias, 'general-text-speculator');
  assert.equal(routed.reason, 'session_affinity');
});
