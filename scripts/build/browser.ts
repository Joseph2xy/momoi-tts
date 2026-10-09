import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const buildRoot = new URL('.generated/web/', root);
const stamp = new URL('.generated/web/build-fingerprint.txt', root);

async function browserFingerprint(): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relative: string) {
    const entries = await readdir(new URL(relative, root), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}${entry.name}`;
      if (entry.isDirectory()) await visit(`${name}/`);
      else {
        hash.update(name);
        hash.update(await readFile(new URL(name, root)));
      }
    }
  }
  await visit('web/');
  await visit('src/shared/');
  for (const name of [
    'vite.config.ts',
    'package.json',
    'package-lock.json',
    'tsconfig.browser.json',
  ]) {
    hash.update(name);
    hash.update(await readFile(new URL(name, root)));
  }
  return hash.digest('hex');
}

export async function ensureBrowserBuild(): Promise<boolean> {
  const fingerprint = await browserFingerprint();
  try {
    if ((await readFile(stamp, 'utf8')).trim() === fingerprint) {
      for (const name of ['index.html', 'testing.html']) {
        const html = await readFile(new URL(name, buildRoot), 'utf8');
        for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu))
          await access(new URL(match[1]!.slice(1), buildRoot));
      }
      return false;
    }
  } catch {
    /* Missing or incomplete output is rebuilt. */
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('node_modules/vite/bin/vite.js', root)), 'build'],
      {
        cwd: fileURLToPath(root),
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    child.once('error', () =>
      reject(new Error('Browser build could not start. Run npm ci in the project folder.')),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Browser build failed. Run npm run build for details.')),
    );
  });
  await writeFile(stamp, fingerprint, 'utf8');
  return true;
}
