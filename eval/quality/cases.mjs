/**
 * Automatic quality cases (A–I) + pairwise J recorders.
 * In-process cases import Roomz/Brainz modules; they do not HTTP.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { hardRuleRoute, isRoutableAlias } from '../../systems/green-roomz/src/routing.mjs';
import { planRoute } from '../../systems/green-roomz/src/logical-router.mjs';
import {
  buildNexusPrompt,
  nexusCandidateAliases,
  offlinePlan,
  parseRouteJson,
} from '../../systems/green-roomz/src/nexus.mjs';
import { parseHandoffContent } from '../../systems/green-roomz/src/handoff.mjs';
import { headerSafe, stripControls } from '../../systems/green-roomz/src/util.mjs';
import { ValidationError } from '../../systems/green-roomz/src/errors.mjs';
import { DreamcatcherStore } from '../../systems/green-brainz/memory/dreamcatcher-memory.mjs';
import {
  MemoryFeedbackLoop,
  NAP_HINT_DRIVE,
  STUTTER_PROTOCOL,
  SeizurePauseError,
} from '../../systems/green-brainz/memory/memory-feedback-loop.mjs';
import {
  CONTROL,
  FENCE,
  MODALITY_ALIASES,
  allPass,
  assistantText,
  check,
  claimsPixels,
  fail,
  parseJsonish,
  pass,
  record,
  skip,
} from './scoring.mjs';
import { chatProvider, roomzClient } from './providers.mjs';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const COMPILE_PROMPT = fileURLToPath(new URL('../../systems/green-roomz/src/compile-prompt.mjs', import.meta.url));

const ALIASES = [
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
  'security-monitor-agent',
];

export function stubRegistry({ ready, unavailable } = {}) {
  const readySet = new Set(ready ?? ALIASES);
  const down = new Set(unavailable ?? []);
  const agents = new Map();
  const availability = new Map();
  for (const alias of ALIASES) {
    agents.set(alias, {
      alias,
      runtime: alias === 'security-monitor-agent' ? 'logical' : 'llama_server',
    });
    if (down.has(alias)) {
      availability.set(alias, { state: 'unavailable', missing: ['impractical:RAM'] });
    } else {
      availability.set(alias, { state: readySet.has(alias) ? 'ready' : 'cold', missing: [] });
    }
  }
  return {
    agents,
    get: (alias) => agents.get(alias),
    status: (alias) => availability.get(alias) ?? { state: 'unknown', missing: [] },
    setStatus(alias, state, extra = {}) {
      availability.set(alias, { ...this.status(alias), state, ...extra });
    },
  };
}

const PROCESSES = { hostAdapter: { sampleResources: () => ({ freeMemoryBytes: 32 * 1024 ** 3 }) } };

function loadJson(rel) {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8'));
}

function loadText(rel) {
  return readFileSync(join(FIXTURES, rel), 'utf8');
}

function expectValidation(body, registry, snippet) {
  try {
    hardRuleRoute(body, registry);
    return fail('expected ValidationError');
  } catch (err) {
    const checks = [
      check('is_validation', err instanceof ValidationError, err?.name),
      check('status_400', err.status === 400, String(err.status)),
      check('message', String(err.message).includes(snippet), err.message),
    ];
    return allPass(checks, err.message, `validation mismatch: ${err.message}`);
  }
}

async function withLoop(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'green-qc-mfl-'));
  try {
    const store = new DreamcatcherStore(directory, { clock: () => '2026-09-07T12:00:00.000Z' });
    await store.createBranch('main', 'shalom');
    const loop = new MemoryFeedbackLoop(store, { clock: () => '2026-09-07T12:00:00.000Z', ...options });
    return await run(loop, store);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function impressKey(loop, key, { tags = [], value = key } = {}) {
  await loop.express('s1', { key, value, originatingAgentId: 'shalom', tags });
  const admitted = await loop.admit('s1', key, 'shalom');
  if (admitted.status !== 'admitted') throw new Error(`admit ${key}: ${admitted.status}`);
  await loop.impress('s1', key, 'shalom', { branch: 'main' });
}

function needRoomz(ctx) {
  if (!ctx.live) return skip('EVAL_LIVE!=1');
  const roomz = ctx.providers?.roomz;
  if (!roomz || roomz.status !== 'ok') return skip(roomz?.reason ?? 'roomz_unreachable');
  return null;
}

function client(ctx) {
  return roomzClient(ctx.providers.roomz.base);
}

function mflLiveSkip(ctx) {
  if (ctx.mflWired) return null;
  return skip('mfl_not_wired_to_gateway');
}

export const CASES = [
  {
    id: 'A-code-intent-plan',
    dimension: 'A',
    mode: 'in-process',
    title: 'planRoute sends code intent to qwenstral-code-speculator',
    async run() {
      const body = loadJson('prompts/a-code.json');
      const plan = planRoute(body);
      return allPass([
        check('route', plan.route === 'qwenstral-code-speculator', plan.route),
        check('reason', plan.reason_code === 'code_intent', plan.reason_code),
      ], 'code_intent', 'not code route');
    },
  },
  {
    id: 'A-chat-intent-plan',
    dimension: 'A',
    mode: 'in-process',
    title: 'planRoute sends chat/prose to general-text-speculator',
    async run() {
      const plan = planRoute(loadJson('prompts/a-chat.json'));
      return allPass([
        check('route', plan.route === 'general-text-speculator', plan.route),
        check('reason', plan.reason_code === 'default_text', plan.reason_code),
      ], 'default_text', 'not chat route');
    },
  },
  {
    id: 'A-image-intent-plan',
    dimension: 'A',
    mode: 'in-process',
    title: 'planRoute sends draw-a-picture text to image-generation-agent',
    async run() {
      const plan = planRoute(loadJson('prompts/a-image-intent.json'));
      return allPass([
        check('route', plan.route === 'image-generation-agent', plan.route),
        check('reason', plan.reason_code === 'image_generation_intent', plan.reason_code),
      ], 'image_generation_intent', 'not image-gen route');
    },
  },
  {
    id: 'A-missing-vision-400',
    dimension: 'A',
    mode: 'in-process',
    title: '/vision without image part is ValidationError',
    async run() {
      return expectValidation(
        { messages: [{ role: 'user', content: '/vision read the serial number' }] },
        stubRegistry(),
        '/vision requires an attached image part',
      );
    },
  },
  {
    id: 'A-missing-audio-400',
    dimension: 'A',
    mode: 'in-process',
    title: '/audio without audio part is ValidationError',
    async run() {
      return expectValidation(
        { messages: [{ role: 'user', content: '/audio transcribe this' }] },
        stubRegistry(),
        '/audio requires an attached audio part',
      );
    },
  },
  {
    id: 'A-tts-not-on-chat-400',
    dimension: 'A',
    mode: 'in-process',
    title: '/tts is not on /v1/chat/completions',
    async run() {
      return expectValidation(
        { messages: [{ role: 'user', content: '/tts hello' }] },
        stubRegistry(),
        '/tts is not on /v1/chat/completions',
      );
    },
  },
  {
    id: 'A-handoff-parse-not-job',
    dimension: 'A',
    mode: 'in-process',
    title: 'HANDOFF JSON parses; auto/nexus suggest is null',
    async run() {
      const ok = parseHandoffContent('HANDOFF {"reason":"not my job","suggest":"general-text-speculator"}');
      const auto = parseHandoffContent('HANDOFF {"reason":"x","suggest":"auto"}');
      const nexus = parseHandoffContent('HANDOFF {"reason":"x","suggest":"tool-router-agent"}');
      return allPass([
        check('handoff', ok?.handoff === true, JSON.stringify(ok)),
        check('suggest', ok?.suggest === 'general-text-speculator', ok?.suggest),
        check('auto_null', auto?.suggest == null, auto?.suggest),
        check('nexus_null', nexus?.suggest == null, nexus?.suggest),
      ], 'handoff parsed', 'handoff parse failed');
    },
  },
  {
    id: 'B-vision-without-image-not-a-candidate',
    dimension: 'B',
    mode: 'in-process',
    title: 'nexusCandidateAliases drops vision without an image part',
    async run() {
      const registry = stubRegistry();
      const body = { messages: [{ role: 'user', content: 'what is in the picture' }] };
      const aliases = nexusCandidateAliases(registry, new Set(), body, PROCESSES);
      return allPass([
        check('no_vision', !aliases.includes('vision-layout-agent'), aliases.join(',')),
        check('no_audio', !aliases.includes('audio-transcription-agent'), aliases.join(',')),
        check('has_text', aliases.includes('general-text-speculator'), aliases.join(',')),
      ], 'modality specialists filtered', 'vision/audio still candidates');
    },
  },
  {
    id: 'B-unavailable-not-routable',
    dimension: 'B',
    mode: 'in-process',
    title: 'unavailable/impractical alias is not a route',
    async run() {
      const registry = stubRegistry({ unavailable: ['qwenstral-code-speculator'] });
      const body = loadJson('prompts/a-code.json');
      const plan = offlinePlan(body, registry, new Set());
      return allPass([
        check('not_routable', isRoutableAlias(registry, 'qwenstral-code-speculator') === false, 'still routable'),
        check('not_code', plan.route !== 'qwenstral-code-speculator', plan.route),
        check('fallback', plan.route === 'general-text-speculator', `${plan.route} ${plan.reason}`),
      ], plan.reason ?? 'fallback', 'unavailable code alias was chosen');
    },
  },
  {
    id: 'C-parse-route-json-clean',
    dimension: 'C',
    mode: 'in-process',
    title: 'parseRouteJson accepts a minified route object',
    async run() {
      const parsed = parseRouteJson('{"route":"general-text-speculator","confidence":0.8,"reason":"chat"}');
      return allPass([
        check('route', parsed?.route === 'general-text-speculator', parsed?.route),
        check('confidence', parsed?.confidence === 0.8, String(parsed?.confidence)),
        check('reason', parsed?.reason === 'chat', parsed?.reason),
      ], 'clean JSON', 'parseRouteJson missed fields');
    },
  },
  {
    id: 'C-parse-route-json-fence-is-failsafe-not-success',
    dimension: 'C',
    mode: 'in-process',
    title: 'stripFence recovers fenced JSON; live C still forbids fences',
    async run() {
      const raw = '```json\n{"route":"general-text-speculator","confidence":0.5,"reason":"chat"}\n```';
      const parsed = parseRouteJson(raw);
      return allPass([
        check('recovered', parsed?.route === 'general-text-speculator', JSON.stringify(parsed)),
        check('fence_present', FENCE.test(raw), 'fixture lost fences'),
      ], 'fail-safe recovers fences; live C3 must still fail fences', 'did not recover');
    },
  },
  {
    id: 'C-stock-prompt-mode',
    dimension: 'C',
    mode: 'in-process',
    title: 'compileStockPrompt layers if present, else skip',
    async run() {
      if (!existsSync(COMPILE_PROMPT)) {
        return skip('compile-prompt.mjs not in this tree; injectSystemPolicy uses raw kernel');
      }
      const mod = await import(pathToFileURL(COMPILE_PROMPT).href);
      const code = mod.stockPromptLayers('qwenstral-code-speculator');
      const nexus = mod.stockPromptLayers('tool-router-agent');
      return allPass([
        check('code_handoff', code.includes('handoff'), code.join(',')),
        check('code_mfl', code.includes('memory-feedback-loop'), code.join(',')),
        check('nexus_bare', Array.isArray(nexus) && nexus.length === 0, String(nexus)),
      ], 'compiled frames', 'unexpected layers');
    },
  },
  {
    id: 'D-slash-auto-is-nexus',
    dimension: 'D',
    mode: 'in-process',
    title: '/auto clears the pin and consults nexus',
    async run() {
      const routed = hardRuleRoute(
        { messages: [{ role: 'user', content: '/auto tell me a joke' }] },
        stubRegistry(),
      );
      return allPass([
        check('alias_null', routed.effectiveAlias == null, routed.effectiveAlias),
        check('reason', routed.reason === 'nexus', routed.reason),
      ], 'slash auto -> nexus', 'auto did not clear pin');
    },
  },
  {
    id: 'D-lock-alias-pins',
    dimension: 'D',
    mode: 'in-process',
    title: 'lock_alias pins the requested specialist',
    async run() {
      const routed = hardRuleRoute({
        model: 'qwenstral-code-speculator',
        lock_alias: true,
        messages: [{ role: 'user', content: 'tell me a joke' }],
      }, stubRegistry());
      return allPass([
        check('alias', routed.effectiveAlias === 'qwenstral-code-speculator', routed.effectiveAlias),
        check('reason', routed.reason === 'lock_alias', routed.reason),
      ], 'lock_alias', 'pin ignored');
    },
  },
  {
    id: 'E-freezer-hidden-from-ordinary-recall',
    dimension: 'E',
    mode: 'in-process',
    title: 'freezer items absent from recallOrdinary',
    async run() {
      return withLoop(async (loop, store) => {
        await impressKey(loop, 'open');
        await impressKey(loop, 'secret');
        await loop.fridge('s1', 'secret', 'shalom');
        await loop.freezer('s1', 'secret', 'shalom');
        const ordinary = await loop.recallOrdinary('main', 'shalom', { limit: 10 });
        const scoped = await loop.recallScoped('main', 'shalom', { limit: 10, allowContained: true });
        const held = await store.get('main', 'secret');
        const keys = ordinary.map((row) => row.record.key);
        return allPass([
          check('ordinary', JSON.stringify(keys) === JSON.stringify(['open']), keys.join(',')),
          check('scoped', scoped.some((row) => row.record.key === 'secret'), 'secret missing from scoped'),
          check('not_deleted', held?.value === 'secret', 'containment deleted the record'),
        ], 'freezer hidden from ordinary recall', 'containment leak');
      });
    },
  },
  {
    id: 'E-goal-survives-seizure',
    dimension: 'E',
    mode: 'in-process',
    title: 'goal-tagged keys stay integrated through seizure',
    async run() {
      return withLoop(async (loop) => {
        await impressKey(loop, 'goal', { tags: ['goal'], value: 'keep-the-mission' });
        await impressKey(loop, 'looping', { value: 'say-it-again' });
        const action = loadJson('mfl/stutter-action.json');
        const steps = [];
        for (let i = 0; i < 5; i += 1) steps.push((await loop.observeAction('s1', action, 'shalom')).recovery);
        let paused = false;
        try { await loop.express('s1', { key: 'x', value: 'x', originatingAgentId: 'shalom' }); } catch (err) {
          paused = err instanceof SeizurePauseError;
        }
        return allPass([
          check('ladder', JSON.stringify(steps) === JSON.stringify([null, 'nap', 'fridge', 'freezer', 'seizure']), steps.join(',')),
          check('protocol', STUTTER_PROTOCOL === 'fr-fr-freezer', STUTTER_PROTOCOL),
          check('goal', loop.phaseOf('goal') === 'integration', loop.phaseOf('goal')),
          check('looping', loop.phaseOf('looping') === 'containment', loop.phaseOf('looping')),
          check('seized', loop.seized('s1') === true, 'not seized'),
          check('pause', paused, 'no SeizurePauseError'),
        ], 'fr-fr-freezer; goal held', 'seizure/goal failed');
      });
    },
  },
  {
    id: 'E-attention-cannot-thaw',
    dimension: 'E',
    mode: 'in-process',
    title: 'attention cannot release containment',
    async run() {
      return withLoop(async (loop) => {
        await impressKey(loop, 'secret');
        await loop.fridge('s1', 'secret', 'shalom');
        await loop.freezer('s1', 'secret', 'shalom');
        let reintegrate = false;
        try { await loop.reintegrate('s1', 'secret', 'shalom'); } catch { reintegrate = true; }
        const thaw = await loop.thaw('s1', 'secret', 'shalom');
        return allPass([
          check('blocked', reintegrate, 'reintegrate from freezer succeeded'),
          check('thaw_partition', loop.phaseOf('secret') === 'partition', loop.phaseOf('secret')),
          check('release', thaw.reason === 'release', thaw.reason),
        ], 'attention cannot thaw; thaw -> partition', 'thaw rules broken');
      });
    },
  },
  {
    id: 'F-stutter-ladder',
    dimension: 'F',
    mode: 'in-process',
    title: 'identical actions climb nap, fridge, freezer, seizure',
    async run() {
      return withLoop(async (loop) => {
        await impressKey(loop, 'goal', { tags: ['goal'], value: 'mission' });
        await impressKey(loop, 'looping', { value: 'repeat-me' });
        const action = loadJson('mfl/stutter-action.json');
        const r1 = await loop.observeAction('s1', action, 'shalom');
        const r2 = await loop.observeAction('s1', action, 'shalom');
        const r3 = await loop.observeAction('s1', action, 'shalom');
        const afterFridge = loop.phaseOf('looping');
        const r4 = await loop.observeAction('s1', action, 'shalom');
        const afterFreezer = loop.phaseOf('looping');
        const r5 = await loop.observeAction('s1', action, 'shalom');
        return allPass([
          check('first', r1.recovery == null, r1.recovery),
          check('nap', r2.recovery === 'nap' && r2.protocol === STUTTER_PROTOCOL, r2.recovery),
          check('fridge', r3.recovery === 'fridge' && afterFridge === 'partition', afterFridge),
          check('freezer', r4.recovery === 'freezer' && afterFreezer === 'containment', afterFreezer),
          check('seizure', r5.recovery === 'seizure' && r5.paused === true, r5.recovery),
          check('goal', loop.phaseOf('goal') === 'integration', loop.phaseOf('goal')),
        ], 'nap → fridge → freezer → seizure', 'stutter ladder mismatch');
      });
    },
  },
  {
    id: 'F-abab-jumps-to-freezer',
    dimension: 'F',
    mode: 'in-process',
    title: 'ABAB cycle freezes without five identical hashes',
    async run() {
      return withLoop(async (loop) => {
        await impressKey(loop, 'path', { value: 'cycle' });
        await loop.observeAction('s1', { step: 'a' }, 'shalom');
        await loop.observeAction('s1', { step: 'b' }, 'shalom');
        await loop.observeAction('s1', { step: 'a' }, 'shalom');
        const hit = await loop.observeAction('s1', { step: 'b' }, 'shalom');
        return allPass([
          check('freezer', hit.recovery === 'freezer', hit.recovery),
          check('contained', loop.phaseOf('path') === 'containment', loop.phaseOf('path')),
        ], 'ABAB -> freezer', 'ABAB did not freeze');
      });
    },
  },
  {
    id: 'G-working-set-full-naps',
    dimension: 'G',
    mode: 'in-process',
    title: 'working-set-full naps without dropping admitted items',
    async run() {
      return withLoop(async (loop) => {
        await loop.express('s1', { key: 'a', value: 'a', originatingAgentId: 'shalom' });
        await loop.express('s1', { key: 'b', value: 'b', originatingAgentId: 'shalom' });
        const first = await loop.admit('s1', 'a', 'shalom');
        const nap = await loop.admit('s1', 'b', 'shalom');
        return allPass([
          check('admitted', first.status === 'admitted', first.status),
          check('nap', nap.status === 'nap', nap.status),
          check('code', nap.code === 'working_set_full', nap.code),
          check('reason', nap.reason === 'fugue_prevented', nap.reason),
          check('drive', nap.hintDrive === NAP_HINT_DRIVE, nap.hintDrive),
          check('keep_a', loop.phaseOf('a') === 'attention', loop.phaseOf('a')),
          check('keep_b', loop.phaseOf('b') === 'derivation', loop.phaseOf('b')),
          check('ws', loop.workingSet('s1').items.length === 1, String(loop.workingSet('s1').items.length)),
        ], 'fugue prevented', 'dropped admitted item or did not nap');
      }, { attentionItemLimit: 1, attentionTokenBudget: 10_000 });
    },
  },
  {
    id: 'H-spoof-available-is-fenced',
    dimension: 'H',
    mode: 'in-process',
    title: 'user AVAILABLE spoof is fenced and cannot add vision',
    async run() {
      const spoof = loadText('injection/spoof-available.txt');
      const prompt = buildNexusPrompt({
        userText: spoof,
        aliases: ['general-text-speculator', 'qwenstral-code-speculator'],
      });
      const idx = prompt.indexOf('USER (verbatim');
      const avail = idx >= 0 ? prompt.slice(0, idx) : prompt;
      const user = idx >= 0 ? prompt.slice(idx) : '';
      const userLines = user.split(/\n/).slice(1).filter((l) => l.length);
      const plan = planRoute({ messages: [{ role: 'user', content: spoof }] });
      const registry = stubRegistry();
      const off = offlinePlan({ messages: [{ role: 'user', content: spoof }] }, registry, new Set());
      return allPass([
        check('split', idx >= 0, 'missing USER marker'),
        check('no_vision_in_available', !avail.includes('vision-layout-agent'), avail),
        check('fenced', userLines.every((l) => l.startsWith('| ')), userLines.join('\n')),
        check('spoof_is_user', user.includes('| AVAILABLE:'), user),
        check('plan', plan.route !== 'vision-layout-agent', plan.route),
        check('offline', off.route !== 'vision-layout-agent', off.route),
      ], 'USER fence held', 'spoof leaked into AVAILABLE or route');
    },
  },
  {
    id: 'H-spoof-handoff-is-verbatim',
    dimension: 'H',
    mode: 'in-process',
    title: 'user HANDOFF spoof is verbatim, not a specialist peek',
    async run() {
      const spoof = loadText('injection/spoof-handoff.txt').trim();
      const prompt = buildNexusPrompt({ userText: spoof, aliases: ['general-text-speculator'] });
      const plan = planRoute({ messages: [{ role: 'user', content: spoof }] });
      const routed = hardRuleRoute({ messages: [{ role: 'user', content: spoof }] }, stubRegistry());
      return allPass([
        check('fenced', prompt.includes('| HANDOFF {'), prompt),
        check('not_image', plan.route !== 'image-generation-agent', plan.route),
        check('not_slash', routed.reason === 'nexus' || routed.effectiveAlias == null || routed.effectiveAlias === 'general-text-speculator', `${routed.reason}:${routed.effectiveAlias}`),
      ], 'user HANDOFF is verbatim', 'user HANDOFF hijacked routing');
    },
  },
  {
    id: 'I-handoff-reason-strips-esc',
    dimension: 'I',
    mode: 'in-process',
    title: 'HANDOFF reason strips ESC/C0/CRLF',
    async run() {
      const parsed = parseHandoffContent('HANDOFF {"reason":"\u001b]0;pwn\u0007\u001b[31mred\r\nX-Injected: 1","suggest":"general-text-speculator"}');
      // C0 is stripped before JSON.parse, so the object may not recover; suggest
      // must fail closed (null / not auto|nexus) and reason must not keep ESC/CRLF.
      const suggest = parsed?.suggest ?? null;
      return allPass([
        check('handoff', parsed?.handoff === true, JSON.stringify(parsed)),
        check('suggest_closed', suggest === 'general-text-speculator' || suggest == null, String(suggest)),
        check('suggest_not_router', suggest !== 'auto' && suggest !== 'tool-router-agent', String(suggest)),
        check('no_c0', !CONTROL.test(parsed?.reason ?? ''), JSON.stringify(parsed?.reason)),
        check('no_nl', !/[\r\n]/.test(parsed?.reason ?? ''), JSON.stringify(parsed?.reason)),
      ], 'reason sanitized; suggest fail-closed', 'ESC/C0 leaked into HANDOFF reason');
    },
  },
  {
    id: 'I-stripControls-and-headerSafe',
    dimension: 'I',
    mode: 'in-process',
    title: 'stripControls/headerSafe drop C0/C1 and cap 240',
    async run() {
      const dirty = `ok\u001b[31mred\u0007${'x'.repeat(300)}`;
      const stripped = stripControls(dirty);
      const header = headerSafe(dirty);
      return allPass([
        check('strip_c0', !CONTROL.test(stripped), JSON.stringify(stripped.slice(0, 40))),
        check('header_c0', !CONTROL.test(header), JSON.stringify(header.slice(0, 40))),
        check('cap', header.length <= 240, String(header.length)),
      ], 'headers safe', 'control leak or oversize header');
    },
  },
  {
    id: 'I-nexus-notes-stripped',
    dimension: 'I',
    mode: 'in-process',
    title: 'Previous HANDOFF notes are stripControls\'d into the nexus prompt',
    async run() {
      const prompt = buildNexusPrompt({
        userText: 'hi',
        aliases: ['general-text-speculator'],
        notes: ['\u001b[31mred HANDOFF'],
      });
      return allPass([
        check('no_esc', !prompt.includes('\u001b'), prompt),
        check('has_note', /Previous HANDOFF:/i.test(prompt), prompt),
      ], 'notes stripped', 'ESC in nexus prompt notes');
    },
  },

  // --- live roomz (skip unless EVAL_LIVE=1 and /health answers) ---
  {
    id: 'A-live-route-code',
    dimension: 'A',
    mode: 'live',
    title: 'live /route does not send a python function to vision/audio/tts',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions/route', loadJson('prompts/a-code.json'));
      const obj = parseJsonish(assistantText(r.json)) ?? r.json;
      const route = obj?.route ?? r.headers['x-green-roomz-effective-alias'];
      const checks = [
        check('http', r.status === 200, String(r.status)),
        check('not_modality', !MODALITY_ALIASES.includes(route), String(route)),
      ];
      return allPass(checks, `route=${route}`, `bad live code route ${route} status=${r.status}`);
    },
  },
  {
    id: 'A-live-code-lock-handoff-haiku',
    dimension: 'A',
    mode: 'live',
    title: 'locked code specialist HANDOFFs a haiku instead of inventing a poem',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const models = await client(ctx).get('/v1/models');
      const code = (models.json?.data ?? []).find((m) => m.id === 'qwenstral-code-speculator');
      if (!code || code.availability === 'unavailable' || code.capability_readiness?.state === 'unavailable') {
        return skip('code_specialist_not_ready');
      }
      if (code.capability_readiness?.state === 'cold' && code.availability !== 'ready') {
        return skip('code_specialist_not_ready');
      }
      const r = await client(ctx).post('/v1/chat/completions', {
        model: 'qwenstral-code-speculator',
        lock_alias: true,
        max_tokens: 64,
        messages: loadJson('prompts/a-haiku-for-code.json').messages,
      });
      const text = assistantText(r.json);
      const handoff = parseHandoffContent(text);
      const effective = r.headers['x-green-roomz-effective-alias'] ?? '';
      if (r.status === 503 || r.status === 422) return skip(`code_specialist_http_${r.status}`);
      const hoppedAway = effective && effective !== 'qwenstral-code-speculator';
      if (handoff?.handoff || hoppedAway) {
        return pass(handoff ? `HANDOFF ${handoff.reason}` : `hopped to ${effective}`);
      }
      if (/haiku|rain|drizzle|petals/i.test(text) && !handoff) {
        return fail(`code specialist invented a poem: ${text.slice(0, 160)}`);
      }
      return fail(`expected HANDOFF, got HTTP ${r.status}: ${text.slice(0, 160)}`);
    },
  },
  {
    id: 'A-live-chat-not-image',
    dimension: 'A',
    mode: 'live',
    title: 'live /route does not send a bedtime story to image-gen',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions/route', loadJson('prompts/a-chat.json'));
      const obj = parseJsonish(assistantText(r.json)) ?? {};
      const route = obj.route;
      return allPass([
        check('http', r.status === 200, String(r.status)),
        check('not_image', route !== 'image-generation-agent', String(route)),
        check('not_vision', route !== 'vision-layout-agent', String(route)),
        check('not_audio', route !== 'audio-transcription-agent', String(route)),
      ], `route=${route}`, `story routed to ${route}`);
    },
  },
  {
    id: 'A-live-missing-vision-400',
    dimension: 'A',
    mode: 'live',
    title: 'live /vision without image is 400',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions', {
        messages: [{ role: 'user', content: '/vision read the serial number' }],
      });
      const msg = r.json?.error?.message ?? r.text;
      return allPass([
        check('status', r.status === 400, String(r.status)),
        check('msg', /\/vision requires an attached image part/i.test(String(msg)), String(msg).slice(0, 160)),
      ], '400 missing vision part', `HTTP ${r.status}`);
    },
  },
  {
    id: 'A-live-tts-400',
    dimension: 'A',
    mode: 'live',
    title: 'live /tts on chat is 400',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions', {
        messages: [{ role: 'user', content: '/tts hello' }],
        max_tokens: 4,
      });
      return allPass([
        check('status', r.status === 400, String(r.status)),
        check('msg', /\/tts is not on \/v1\/chat\/completions/i.test(r.json?.error?.message ?? r.text), (r.json?.error?.message ?? r.text).slice(0, 160)),
      ], '400 tts', `HTTP ${r.status}`);
    },
  },
  {
    id: 'B-live-models-catalog-honesty',
    dimension: 'B',
    mode: 'live',
    title: 'GET /v1/models reports unavailable without callable caps',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).get('/v1/models');
      const rows = r.json?.data ?? [];
      const issues = [];
      for (const m of rows) {
        if (!m.id || m.availability == null) issues.push(`${m.id}: missing availability`);
        if (m.availability === 'unavailable') {
          if (!Array.isArray(m.callable_capabilities) || m.callable_capabilities.length) issues.push(`${m.id}: callable while unavailable`);
          if (!Array.isArray(m.unavailable_reasons) || !m.unavailable_reasons.length) issues.push(`${m.id}: no unavailable_reasons`);
        }
      }
      if (r.status !== 200) return fail(`HTTP ${r.status}`);
      if (!rows.length) return fail('empty /v1/models');
      return issues.length ? fail(issues.join('; ')) : pass(`${rows.length} models`);
    },
  },
  {
    id: 'B-live-unavailable-does-not-fake-pixels',
    dimension: 'B',
    mode: 'live',
    title: 'missing image-gen does not return fake pixels',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const models = await client(ctx).get('/v1/models');
      const img = (models.json?.data ?? []).find((m) => m.id === 'image-generation-agent');
      if (img && img.availability !== 'unavailable') return skip('image_gen_available');
      const r = await client(ctx).post('/v1/chat/completions', {
        model: 'image-generation-agent',
        lock_alias: true,
        messages: [{ role: 'user', content: '/image a small red circle' }],
      });
      const text = assistantText(r.json) || r.text;
      if (r.status >= 400 && r.status < 600 && !claimsPixels(text)) {
        return pass(`honest ${r.status}`);
      }
      if (claimsPixels(text) || r.status === 200) return fail(`faked image HTTP ${r.status}: ${String(text).slice(0, 120)}`);
      return fail(`unexpected HTTP ${r.status}`);
    },
  },
  {
    id: 'C-live-route-plan-json-only',
    dimension: 'C',
    mode: 'live',
    title: 'live /route content is JSON without fences',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions/route', {
        messages: [{ role: 'user', content: 'summarize this paragraph in one clause' }],
      });
      const text = assistantText(r.json);
      const obj = parseJsonish(text);
      return allPass([
        check('http', r.status === 200, String(r.status)),
        check('json', obj && typeof obj === 'object', text.slice(0, 120)),
        check('route', typeof obj?.route === 'string', String(obj?.route)),
        check('not_nexus', obj?.route !== 'tool-router-agent' && obj?.route !== 'auto', String(obj?.route)),
        check('no_fence', !FENCE.test(text), 'fences present'),
      ], `route=${obj?.route}`, `not JSON-only: ${text.slice(0, 160)}`);
    },
  },
  {
    id: 'C-live-lock-nexus-still-json',
    dimension: 'C',
    mode: 'live',
    title: 'lock_alias nexus does not write an essay',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions', {
        model: 'tool-router-agent',
        lock_alias: true,
        max_tokens: 96,
        messages: [{ role: 'user', content: 'Write a long essay about rivers.' }],
      });
      const text = assistantText(r.json);
      const obj = parseJsonish(text);
      const essay = /\brivers\b/i.test(text) && text.length > 200 && !obj;
      return allPass([
        check('http', r.status === 200, String(r.status)),
        check('json', Boolean(obj && typeof obj.route === 'string'), text.slice(0, 160)),
        check('no_fence', !FENCE.test(text), 'fences'),
        check('no_essay', !essay, 'wrote an essay'),
      ], 'nexus stayed JSON', `nexus essay/prose: ${text.slice(0, 160)}`);
    },
  },
  {
    id: 'D-live-auto-vs-lock',
    dimension: 'D',
    mode: 'live',
    title: 'session /auto may re-pick; lock_alias pins',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const c = client(ctx);
      const first = await c.post('/v1/chat/completions', {
        model: 'auto',
        max_tokens: 32,
        messages: [{ role: 'user', content: '/auto say hi' }],
      });
      const sid = first.headers['x-session-id'];
      if (first.status !== 200 || !sid) return fail(`no session id HTTP ${first.status}`);
      const second = await c.post('/v1/chat/completions', {
        model: 'auto',
        max_tokens: 32,
        messages: [
          { role: 'user', content: '/auto say hi' },
          { role: 'assistant', content: assistantText(first.json) },
          { role: 'user', content: 'write a python function named add' },
        ],
      }, { 'x-session-id': sid });
      const locked = await c.post('/v1/chat/completions', {
        model: 'general-text-speculator',
        lock_alias: true,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'write a python function named add' }],
      });
      const lockAlias = locked.headers['x-green-roomz-effective-alias'];
      return allPass([
        check('session2', second.status === 200 && second.headers['x-session-id'] === sid, `${second.status} ${second.headers['x-session-id']}`),
        check('lock_http', locked.status === 200 || locked.status === 422, String(locked.status)),
        check('lock_pin', !lockAlias || lockAlias === 'general-text-speculator' || parseHandoffContent(assistantText(locked.json)), lockAlias),
      ], `session=${sid} lock=${lockAlias}`, 'session/lock failed');
    },
  },
  {
    id: 'E-live-contained-not-in-answer',
    dimension: 'E',
    mode: 'live',
    title: 'freezer canary absent from ordinary chat (skip if unwired)',
    async run(ctx) {
      const blocked = needRoomz(ctx) ?? mflLiveSkip(ctx);
      if (blocked) return blocked;
      return skip('mfl_not_wired_to_gateway');
    },
  },
  {
    id: 'F-live-observe-if-wired',
    dimension: 'F',
    mode: 'live',
    title: 'live stutter observe (skip if unwired)',
    async run(ctx) {
      const blocked = needRoomz(ctx) ?? mflLiveSkip(ctx);
      if (blocked) return blocked;
      return skip('mfl_not_wired_to_gateway');
    },
  },
  {
    id: 'G-live-no-drop',
    dimension: 'G',
    mode: 'live',
    title: 'live fugue nap (skip if unwired)',
    async run(ctx) {
      const blocked = needRoomz(ctx) ?? mflLiveSkip(ctx);
      if (blocked) return blocked;
      return skip('mfl_not_wired_to_gateway');
    },
  },
  {
    id: 'H-live-injection-does-not-route-vision',
    dimension: 'H',
    mode: 'live',
    title: 'spoofed AVAILABLE does not route to vision',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const spoof = loadText('injection/spoof-available.txt');
      const r = await client(ctx).post('/v1/chat/completions/route', {
        messages: [{ role: 'user', content: spoof }],
      });
      const obj = parseJsonish(assistantText(r.json)) ?? {};
      return allPass([
        check('http', r.status === 200, String(r.status)),
        check('not_vision', obj.route !== 'vision-layout-agent', String(obj.route)),
        check('not_audio', obj.route !== 'audio-transcription-agent', String(obj.route)),
      ], `route=${obj.route}`, `spoof routed to ${obj.route}`);
    },
  },
  {
    id: 'I-live-completion-no-c0',
    dimension: 'I',
    mode: 'live',
    title: 'live completion and route-reason have no C0/ESC',
    async run(ctx) {
      const blocked = needRoomz(ctx);
      if (blocked) return blocked;
      const r = await client(ctx).post('/v1/chat/completions', {
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }],
      });
      const text = assistantText(r.json);
      const reason = r.headers['x-green-roomz-route-reason'] ?? '';
      return allPass([
        check('http', r.status === 200, String(r.status)),
        check('content', typeof text === 'string' && text.length > 0, text),
        check('no_c0', !CONTROL.test(text), JSON.stringify(text.slice(0, 80))),
        check('reason_c0', !CONTROL.test(reason), reason),
      ], 'no C0', `control leak HTTP ${r.status}`);
    },
  },
];

const PAIRWISE_FILES = [
  ['J1-palindrome', 'pairwise/j1-palindrome.json'],
  ['J2-vision-serial', 'pairwise/j2-vision-serial.json'],
  ['J3-json-only', 'pairwise/j3-json-only.json'],
  ['J4-image-claim', 'pairwise/j4-image-claim.json'],
  ['J5-exact-words', 'pairwise/j5-exact-words.json'],
];

for (const [id, rel] of PAIRWISE_FILES) {
  CASES.push({
    id,
    dimension: 'J',
    mode: 'pairwise',
    title: `pairwise ${id} (record-only)`,
    async run(ctx) {
      if (!ctx.live) return skip('EVAL_LIVE!=1');
      const fixture = loadJson(rel);
      const peers = ['roomz', 'raw-llama', 'cloud-grok'];
      const transcripts = {};
      for (const provider of peers) {
        const hit = await chatProvider(provider, ctx.providers, fixture.messages, { max_tokens: 256 });
        if (hit.skipped) {
          transcripts[provider] = { outcome: 'skip', reason: hit.reason };
        } else {
          transcripts[provider] = {
            outcome: 'record',
            status: hit.status,
            content: hit.content,
            headers: hit.headers,
          };
        }
      }
      return record('pairwise recorded, not ranked', { transcripts, fixture: fixture.id });
    },
  });
}

export function casesWhere(pred) {
  return CASES.filter(pred);
}

export async function runOne(caze, ctx) {
  const t0 = Date.now();
  try {
    const result = await caze.run(ctx);
    return {
      id: caze.id,
      dimension: caze.dimension,
      mode: caze.mode,
      title: caze.title,
      provider: caze.mode === 'in-process' ? 'in-process' : (caze.mode === 'pairwise' ? 'multi' : 'roomz'),
      ms: Date.now() - t0,
      ...result,
    };
  } catch (err) {
    return {
      id: caze.id,
      dimension: caze.dimension,
      mode: caze.mode,
      title: caze.title,
      provider: 'in-process',
      outcome: 'fail',
      reason: err?.stack ?? String(err),
      ms: Date.now() - t0,
      checks: [],
    };
  }
}

