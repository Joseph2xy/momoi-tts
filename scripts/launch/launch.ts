import { configuredPipeline } from '../../src/app/provider-actions.ts';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { ensureFrontend } from './frontend.ts';
import { SettingsStore } from '../../src/app/settings.ts';
import { launchMode } from '../../src/app/launch-mode.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
async function launch() {
  launchMode(args);
  const store = new SettingsStore();
  const config = { port: store.port };
  const base = `http://127.0.0.1:${config.port}`;
  const expectedMode = configuredPipeline(store)?.mode ?? 'disabled';
  const nonce = randomBytes(32).toString('hex');
  async function running(): Promise<boolean> {
    let response: Response;
    try {
      response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
        redirect: 'error',
        headers: { 'X-MomoiTTS-Launch-Nonce': nonce },
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ECONNREFUSED'
      )
        return false;
      throw new Error(
        'The app port is not responding. Close the existing app or choose another port.',
      );
    }
    let health: { app?: string; mode?: string; configurationProof?: string };
    try {
      health = (await response.json()) as typeof health;
    } catch {
      throw new Error('Another application is using the app port.');
    }
    if (!response.ok || health.app !== 'momoitts')
      throw new Error('Another application is using the app port.');
    if (health.mode !== expectedMode)
      throw new Error(
        'MomoiTTS is already running with a different setup. Quit it before changing settings.',
      );
    if (health.configurationProof !== store.proof(nonce))
      throw new Error(
        'MomoiTTS is already running with different settings. Quit it before changing provider, model, or private configuration.',
      );
    return true;
  }
  if (!(await running())) {
    await ensureFrontend();
    const extension = import.meta.url.endsWith('.js') ? 'js' : 'ts';
    const child = spawn(process.execPath, [`src/app/main.${extension}`, ...args], {
      cwd: root,
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    let exited = false;
    child.once('error', () => {
      exited = true;
    });
    child.once('exit', () => {
      exited = true;
    });
    child.unref();
    let ready = false;
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (exited)
          throw new Error(
            'MomoiTTS could not start. Check the private launcher logs or re-extract the complete release.',
          );
        if (await running()) {
          ready = true;
          break;
        }
        await delay(250);
      }
      if (!ready)
        throw new Error(
          'MomoiTTS did not become ready. Check the private launcher logs before retrying.',
        );
    } catch (error) {
      if (!exited) child.kill();
      throw error;
    }
  }
  if (!args.includes('--no-open')) {
    await promisify(execFile)(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Start-Process -FilePath $env:MOMOI_TTS_LAUNCH_URL'],
      {
        windowsHide: true,
        env: { ...process.env, MOMOI_TTS_LAUNCH_URL: base },
        timeout: 10_000,
      },
    );
  }
  console.log(`MomoiTTS ready at ${base}`);
}
try {
  await launch();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MomoiTTS could not start.');
  process.exitCode = 1;
}
