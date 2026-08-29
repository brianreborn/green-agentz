#!/usr/bin/env node
import { Mailbox } from '../src/mailbox.mjs';

const seen = [];
const box = new Mailbox({ onEvent: (event) => seen.push(event) });
const t0 = performance.now();
const published = box.push({
  kind: 'success',
  source: 'selftest',
  ticket: 't1',
  payload: { n: 1 },
});
const elapsed = performance.now() - t0;
if (elapsed >= 10) {
  console.error(`push waited ${elapsed}ms`);
  process.exit(1);
}
if (seen.length !== 0) {
  console.error('push drained inline');
  process.exit(1);
}
if (!published.ok || typeof published.seq !== 'number') {
  console.error('push did not publish', published);
  process.exit(1);
}
await new Promise((resolve) => setImmediate(resolve));
if (seen.length !== 1 || seen[0].kind !== 'success' || seen[0].source !== 'selftest') {
  console.error('drain missed event', seen);
  process.exit(1);
}
const droppedBox = new Mailbox({ capacity: 2, autoDrain: false });
droppedBox.push({ kind: 'a', source: 's' });
droppedBox.push({ kind: 'b', source: 's' });
droppedBox.push({ kind: 'c', source: 's' });
const drained = droppedBox.drain();
if (droppedBox.stats().dropped !== 1 || drained[0].kind !== 'b' || drained[1].kind !== 'c') {
  console.error('drop-oldest failed', droppedBox.stats(), drained);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, elapsed_ms: elapsed, seq: published.seq, drained_kind: seen[0].kind, dropped: droppedBox.stats().dropped }));
process.exit(0);
