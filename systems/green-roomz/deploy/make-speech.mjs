#!/usr/bin/env node
/**
 * make-speech - LAUNCH HARNESS. Synthesize speech WAV artifacts with piper so the
 * audio-transcription path can be tested end to end (piper -> wav -> whisper).
 *
 *   node deploy/make-speech.mjs "some text" out.wav
 *   node deploy/make-speech.mjs --fixtures [dir]      # regenerate e2e/assets/*
 *
 * Env: GRZ_PIPER (piper.exe), GRZ_PIPER_VOICE (.onnx). Defaults to C:/LocalAI.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PIPER = process.env.GRZ_PIPER || 'C:/LocalAI/piper/piper.exe';
const VOICE = process.env.GRZ_PIPER_VOICE || 'C:/LocalAI/piper/voices/en_US-lessac-medium.onnx';
const REPO = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

// Canonical phrases: short, unambiguous, easy to assert a loose match on.
export const FIXTURES = [
  { name: 'hello-world', text: 'Hello world.', expect: /hello,?\s*world/i },
  { name: 'quick-brown-fox', text: 'The quick brown fox jumps over the lazy dog.', expect: /quick brown fox/i },
  { name: 'green-roomz-probe', text: 'Green roomz audio transcription health probe.', expect: /green\s*room/i },
];

export function synthesize(text, outFile) {
  return new Promise((resolve, reject) => {
    if (!existsSync(PIPER) || !existsSync(VOICE)) {
      return reject(new Error(`piper or voice missing (${PIPER} / ${VOICE})`));
    }
    mkdirSync(path.dirname(outFile), { recursive: true });
    const child = execFile(PIPER, ['--model', VOICE, '--output_file', outFile], { timeout: 30_000, windowsHide: true },
      (err) => (err ? reject(err) : resolve(outFile)));
    child.stdin.end(text);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--fixtures') {
    const dir = argv[1] || path.join(REPO, 'e2e', 'assets');
    const index = [];
    for (const f of FIXTURES) {
      const out = path.join(dir, `${f.name}.wav`);
      await synthesize(f.text, out);
      index.push({ file: `${f.name}.wav`, text: f.text, expect: f.expect.source, flags: f.expect.flags });
      console.error(`wrote ${out}`);
    }
    writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    console.error(`wrote ${path.join(dir, 'index.json')}`);
    return;
  }
  const [text, out] = argv;
  if (!text || !out) { console.error('usage: make-speech.mjs "text" out.wav  |  --fixtures [dir]'); process.exit(2); }
  await synthesize(text, out);
  console.log(out);
}

if (process.argv[1]?.endsWith('make-speech.mjs')) main().catch((e) => { console.error(e.message); process.exit(1); });
