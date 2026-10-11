import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
export function startRestart(port: number, noOpen = false) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          `../../scripts/launch/restart${import.meta.url.endsWith('.ts') ? '.ts' : '.js'}`,
          import.meta.url,
        ),
      ),
      String(port),
      ...(noOpen ? ['--no-open'] : []),
    ],
    { cwd: root, windowsHide: true, detached: true, stdio: 'ignore', env: process.env },
  );
  child.on('error', () => {});
  child.unref();
}
