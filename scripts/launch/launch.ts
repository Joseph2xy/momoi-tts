import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import { ensureBrowserBuild } from '../build/browser.ts';
import { configurationProof, readConfig } from '../../src/app/config.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
async function launch() {
  if (args.some((arg) => !['--demo', '--no-open'].includes(arg)))
    throw new Error('Unknown launcher option.');
  const config = readConfig(process.env, args);
  const base = `http://127.0.0.1:${config.port}`;
  const expectedMode = config.demo ? 'demo' : !config.fish ? 'disabled' : 'live';
  const nonce = randomBytes(32).toString('hex');
  async function running(): Promise<boolean> {
    let response: Response;
    try {
      response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
        redirect: 'error',
        headers: { 'X-Tyrone-Launch-Nonce': nonce },
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
    if (!response.ok || health.app !== 'tyrone')
      throw new Error('Another application is using the app port.');
    if (health.mode !== expectedMode)
      throw new Error(
        'Tyrone is already running in a different mode. Quit it before switching modes.',
      );
    if (health.configurationProof !== configurationProof(config, nonce))
      throw new Error(
        'Tyrone is already running with different settings. Quit it before changing provider, model, or private configuration.',
      );
    return true;
  }
  if (!(await running())) {
    await ensureBrowserBuild();
    const child = spawn(
      process.execPath,
      [
        '--env-file-if-exists=.local/generation.env',
        '--env-file-if-exists=.local/fish.env',
        '--env-file-if-exists=.local/twitch.env',
        'src/app/main.ts',
        ...args.filter((arg) => arg !== '--no-open'),
      ],
      {
        cwd: root,
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      },
    );
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
          throw new Error('Tyrone could not start. Run npm start to see the startup message.');
        if (await running()) {
          ready = true;
          break;
        }
        await delay(250);
      }
      if (!ready) throw new Error('Tyrone did not become ready. Run npm start to check startup.');
    } catch (error) {
      if (!exited) child.kill();
      throw error;
    }
  }
  if (!args.includes('--no-open')) {
    await promisify(execFile)(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Start-Process -FilePath $env:TYRONE_LAUNCH_URL'],
      {
        windowsHide: true,
        env: { ...process.env, TYRONE_LAUNCH_URL: base },
        timeout: 10_000,
      },
    );
  }
  console.log(`Tyrone ready at ${base}`);
}
try {
  await launch();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Tyrone could not start.');
  process.exitCode = 1;
}
