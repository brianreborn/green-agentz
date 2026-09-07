/**
 * Automatic in-process subset. No HTTP, no paid APIs.
 *
 *   node --test eval/quality/quality.test.mjs
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CASES, runOne } from './cases.mjs';

const ctx = {
  live: false,
  mflWired: false,
  providers: { 'in-process': { status: 'ok', reason: null } },
};

for (const caze of CASES.filter((c) => c.mode === 'in-process')) {
  test(`${caze.id} ${caze.title}`, async (t) => {
    const row = await runOne(caze, ctx);
    if (row.outcome === 'skip') {
      t.skip(row.reason ?? 'skipped');
      return;
    }
    assert.equal(row.outcome, 'pass', row.reason);
  });
}
