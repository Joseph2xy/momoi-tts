import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packageWorkspace = resolve(root, '.generated/packages');
const staging = resolve(packageWorkspace, randomUUID());
const compiled = join(staging, 'compiled');
const product = join(staging, 'MomoiTTS');
if (dirname(staging) !== packageWorkspace) throw new Error('Invalid product staging path.');
try {
  await mkdir(product, { recursive: true });

  async function rejectLinks(path: string): Promise<void> {
    const info = await lstat(path);
    if (info.isSymbolicLink())
      throw new Error('Product preparation refuses linked files or directories.');
    if (info.isDirectory())
      for (const file of await readdir(path)) await rejectLinks(join(path, file));
  }
  for (const path of [
    'src',
    'scripts',
    'characters',
    'config/examples',
    '.generated/web',
    'README.md',
    'USER_GUIDE.md',
    'START HERE.txt',
    'Launch MomoiTTS.cmd',
    'Update MomoiTTS.cmd',
    'config/twitch-app.json',
  ])
    await rejectLinks(join(root, path));

  async function run(file: string, args: string[], cwd = root): Promise<void> {
    await new Promise<void>((resolveRun, reject) => {
      const process = spawn(file, args, {
        cwd,
        windowsHide: true,
        stdio: 'ignore',
        timeout: 300_000,
      });
      process.once('error', reject);
      process.once('exit', (code) =>
        code === 0
          ? resolveRun()
          : reject(new Error('Product build or dependency lock generation failed.')),
      );
    });
  }

  await run(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '-p',
    'tsconfig.product.json',
    '--outDir',
    compiled,
  ]);
  for (const folder of ['src', 'scripts/launch'])
    await cp(join(compiled, folder), join(product, folder), { recursive: true });
  for (const folder of ['characters', 'config/examples', 'scripts/windows'])
    await cp(join(root, folder), join(product, folder), { recursive: true, dereference: false });
  await cp(join(root, '.generated/web'), join(product, 'web-build'), {
    recursive: true,
    filter: (source) => !source.endsWith('build-fingerprint.txt'),
  });
  for (const file of [
    'README.md',
    'USER_GUIDE.md',
    'START HERE.txt',
    'Launch MomoiTTS.cmd',
    'Update MomoiTTS.cmd',
    'config/twitch-app.json',
  ])
    await cp(join(root, file), join(product, file));

  const sourceManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const sourceLock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const dependencies = Object.fromEntries(
    ['@twurple/api', '@twurple/auth', '@twurple/eventsub-ws'].map((name) => {
      const version = sourceLock.packages[`node_modules/${name}`]?.version;
      if (!version) throw new Error('A runtime dependency is missing from the pinned lock.');
      return [name, version];
    }),
  );
  await writeFile(
    join(product, 'package.json'),
    JSON.stringify(
      {
        name: 'momoitts',
        version: sourceManifest.version,
        private: true,
        type: 'module',
        engines: sourceManifest.engines,
        scripts: {
          start: 'node scripts/launch/run.js',
        },
        dependencies,
      },
      null,
      2,
    ) + '\n',
  );
  sourceLock.packages[''] = {
    name: 'momoitts',
    version: sourceManifest.version,
    dependencies,
    engines: sourceManifest.engines,
  };
  await writeFile(join(product, 'package-lock.json'), JSON.stringify(sourceLock, null, 2) + '\n');
  // npm ships alongside Node on supported Windows installations, independently of app dependencies.
  const npmCli = resolve(process.execPath, '..', 'node_modules/npm/bin/npm-cli.js');
  await run(
    process.execPath,
    [npmCli, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
    product,
  );
  await run(
    process.execPath,
    [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    product,
  );
  // Recipient dependencies run as JavaScript; compiler-only declarations/cache do not ship.
  async function prune(directory: string) {
    if (!resolve(directory).startsWith(resolve(product) + '\\'))
      throw new Error('Unsafe product cleanup path.');
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) {
        if (file.name === '@types' || file.name === 'undici-types')
          await rm(path, { recursive: true });
        else await prune(path);
      } else if (/\.d\.ts(?:\.map)?$/u.test(file.name) || file.name === '.package-lock.json')
        await rm(path);
    }
  }
  await prune(join(product, 'node_modules'));
  const runtimeRoot = process.env.MOMOI_TTS_PACKAGE_RUNTIME;
  if (!runtimeRoot) throw new Error('Prepare the pinned Windows runtime before packaging.');
  await mkdir(join(product, 'runtime'));
  await cp(join(runtimeRoot, 'node.exe'), join(product, 'runtime/node.exe'));
  await cp(join(runtimeRoot, 'LICENSE'), join(product, 'runtime/LICENSE'));

  const notices: string[] = ['Third-party software included in or required by MomoiTTS.\n'];
  for (const [path, value] of Object.entries(sourceLock.packages)) {
    const entry = value as { version?: string; license?: string; dev?: boolean };
    if (!path || entry.dev || !path.startsWith('node_modules/')) continue;
    const packageRoot = join(root, path);
    notices.push(
      `\n${path.replace(/^node_modules\//u, '')} ${entry.version ?? ''} (${entry.license ?? 'see package'})\n`,
    );
    for (const file of await readdir(packageRoot)) {
      if (!/^(?:licen[sc]e|notice|copying)(?:\.|$)/iu.test(file)) continue;
      notices.push(await readFile(join(packageRoot, file), 'utf8'));
    }
  }
  await writeFile(join(product, 'THIRD PARTY NOTICES.txt'), notices.join('\n'));
  const manifestFiles: Record<string, string> = {};
  async function manifest(directory: string) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name);
      if (file.isDirectory()) await manifest(path);
      else
        manifestFiles[path.slice(product.length + 1).replaceAll('\\', '/')] = createHash('sha256')
          .update(await readFile(path))
          .digest('hex');
    }
  }
  await manifest(product);
  await writeFile(
    join(product, 'release.json'),
    JSON.stringify(
      {
        app: 'momoitts',
        schema: 1,
        version: sourceManifest.version,
        runtime: '24.21.0',
        files: manifestFiles,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(product);
} catch (error) {
  await rm(staging, { recursive: true, force: true });
  throw error;
}
