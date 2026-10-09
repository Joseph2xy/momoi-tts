import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findCodex, testedVersion } from '../providers/codex/runtime.ts';
const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
export async function checkPrerequisites(env: NodeJS.ProcessEnv = process.env) {
  try {
    const executable = findCodex(env);
    const result = await run(executable, ['--version'], {
      timeout: 5000,
      maxBuffer: 8192,
      windowsHide: true,
    });
    const ok = result.stdout.trim() === testedVersion;
    return {
      ok,
      message: ok
        ? `Tested ${testedVersion} is installed. This does not check sign-in or connected services.`
        : `Install/repair the tested ${testedVersion}. Other versions remain unsupported.`,
    };
  } catch {
    return { ok: false, message: `${testedVersion} is missing or could not be checked.` };
  }
}
export function startRestart(port: number, demo: boolean, noOpen = false) {
  const child = spawn(
    process.execPath,
    [
      'scripts/launch/restart.ts',
      String(port),
      ...(demo ? ['--demo'] : []),
      ...(noOpen ? ['--no-open'] : []),
    ],
    { cwd: root, windowsHide: true, detached: true, stdio: 'ignore', env: process.env },
  );
  child.on('error', () => {});
  child.unref();
}
