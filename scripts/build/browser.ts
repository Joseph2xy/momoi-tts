import { createHash } from 'node:crypto';
import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';

const root = new URL('../../', import.meta.url);
const buildRoot = new URL('.generated/web/', root);
const stamp = new URL('.generated/web/build-fingerprint.txt', root);

async function outputFingerprint(): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relative: string) {
    const entries = await readdir(new URL(relative, buildRoot), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}${entry.name}`;
      if (entry.isDirectory()) await visit(`${name}/`);
      else if (name !== 'build-fingerprint.txt') {
        hash.update(name);
        hash.update(await readFile(new URL(name, buildRoot)));
      }
    }
  }
  await visit('');
  return hash.digest('hex');
}

async function browserFingerprint(): Promise<string> {
  const hash = createHash('sha256');
  async function visit(relative: string) {
    const entries = await readdir(new URL(relative, root), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}${entry.name}`;
      if (entry.isDirectory()) await visit(`${name}/`);
      else if (
        ['.ts', '.tsx', '.html', '.css', '.svg', '.png', '.jpg', '.woff2'].includes(extname(name))
      ) {
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
    'src/providers/fish/config.ts',
  ]) {
    hash.update(name);
    hash.update(await readFile(new URL(name, root)));
  }
  return hash.digest('hex');
}

export async function ensureBrowserBuild(): Promise<boolean> {
  const fingerprint = await browserFingerprint();
  try {
    const [source, output] = (await readFile(stamp, 'utf8')).trim().split('\n');
    if (source === fingerprint && output === (await outputFingerprint())) {
      for (const name of ['index.html', 'player.html']) {
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
        timeout: 300_000,
      },
    );
    child.once('error', () =>
      reject(new Error('Browser build could not start. Run npm ci in the project folder.')),
    );
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Browser build failed or timed out. Run npm run build for details.')),
    );
  });
  await writeFile(stamp, `${fingerprint}\n${await outputFingerprint()}\n`, 'utf8');
  return true;
}
