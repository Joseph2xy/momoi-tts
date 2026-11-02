import { randomBytes } from 'node:crypto';
import { SettingsStore } from '../../src/app/settings.ts';
import { setTimeout as delay } from 'node:timers/promises';
const store = new SettingsStore();
const nonce = randomBytes(32).toString('hex');
const base = `http://127.0.0.1:${store.port}`;
async function health(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(base + '/api/health', {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
      headers: { 'X-MomoiTTS-Launch-Nonce': nonce },
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED'
    )
      return null;
    throw new Error('Cannot safely identify the running app.');
  }
}
try {
  const current = await health();
  if (current) {
    if (current.app !== 'momoitts' || current.configurationProof !== store.proof(nonce))
      throw new Error('Another app or configuration is using the port. Exit it before updating.');
    const response = await fetch(base + '/api/app/quit', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('The app could not exit.');
    await response.arrayBuffer();
    let stopped = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(250);
      if (!(await health())) {
        stopped = true;
        break;
      }
    }
    if (!stopped) throw new Error('The app did not exit.');
    await delay(2000);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Cannot prepare the app for update.');
  process.exitCode = 1;
}
