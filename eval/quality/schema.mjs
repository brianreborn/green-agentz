/** Result envelope for docs/eval/QUALITY-COMPARISON.md §16. */
export const RESULT_SCHEMA_ID = 'green-quality-comparison/v1';

export const OUTCOMES = Object.freeze(['pass', 'fail', 'skip', 'record']);
export const PROVIDERS = Object.freeze([
  'in-process',
  'roomz',
  'raw-llama',
  'cloud-grok',
  'cloud-openai',
  'cloud-anthropic',
  'host-agent',
]);

export function emptySummary() {
  return { pass: 0, fail: 0, skip: 0, record: 0 };
}

export function tally(cases) {
  const summary = emptySummary();
  for (const row of cases) {
    if (summary[row.outcome] != null) summary[row.outcome] += 1;
  }
  return summary;
}

export function makeResult({ startedAt, evalLive, evalCloud, promptMode, providers, cases }) {
  const finishedAt = new Date().toISOString();
  return {
    schema: RESULT_SCHEMA_ID,
    started_at: startedAt,
    finished_at: finishedAt,
    eval_live: Boolean(evalLive),
    eval_cloud: Boolean(evalCloud),
    prompt_mode: promptMode ?? 'raw-kernel-failsafe',
    providers,
    cases,
    summary: tally(cases),
  };
}

export function validateResult(result) {
  const issues = [];
  if (result?.schema !== RESULT_SCHEMA_ID) issues.push('schema id');
  if (!Array.isArray(result?.cases)) issues.push('cases');
  if (!result?.providers || typeof result.providers !== 'object') issues.push('providers');
  for (const row of result?.cases ?? []) {
    if (!row.id) issues.push('case.id');
    if (!OUTCOMES.includes(row.outcome)) issues.push(`outcome ${row.id}:${row.outcome}`);
  }
  return { ok: issues.length === 0, issues };
}
