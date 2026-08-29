import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';

function hook(streamName, file) {
  const orig = process[streamName].write.bind(process[streamName]);
  process[streamName].write = (chunk, enc, cb) => {
    try { file.write(chunk); } catch {}
    return orig(chunk, enc, cb);
  };
}

/** Keep the operator TTY and also append to data/serve.log. */
export function attachServeConsole({ root = process.cwd(), logName = 'serve.log' } = {}) {
  const dir = path.join(root, 'data');
  mkdirSync(dir, { recursive: true });
  const logPath = path.join(dir, logName);
  const file = createWriteStream(logPath, { flags: 'a' });
  hook('stdout', file);
  hook('stderr', file);
  const tty = Boolean(process.stdout.isTTY || process.stderr.isTTY);
  process.stderr.write(`[${new Date().toISOString()}] green-roomz console tty=${tty} log=${logPath}\n`);
  return { logPath, tty };
}
