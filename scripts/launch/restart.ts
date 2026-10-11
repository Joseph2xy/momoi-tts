import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535) process.exit(1);
let closed = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(500) });
  } catch {
    closed = true;
    break;
  }
  await delay(250);
}
if (!closed) process.exit(1);
const child = spawn(
  process.execPath,
  [
    `scripts/launch/launch.${import.meta.url.endsWith('.js') ? 'js' : 'ts'}`,
    ...(process.argv.includes('--no-open') ? ['--no-open'] : []),
  ],
  { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: 'ignore' },
);
child.on('error', () => {
  process.exitCode = 1;
});
child.unref();
