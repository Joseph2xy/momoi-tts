import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
const run = promisify(execFile);

test(
  'portable updater validates before replacement, preserves private recovery and removes superseded public files',
  { skip: process.platform !== 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'momoitts-update-'));
    const installed = join(root, 'installed'),
      next = join(root, 'next');
    async function put(base: string, file: string, value: string | Buffer) {
      await mkdir(resolve(base, file, '..'), { recursive: true });
      await writeFile(join(base, file), value);
    }
    async function manifest(base: string) {
      const files: Record<string, string> = {};
      async function walk(dir: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.name === '.local' || entry.name === 'release.json') continue;
          const path = join(dir, entry.name);
          if (entry.isDirectory()) await walk(path);
          else
            files[path.slice(base.length + 1).replaceAll('\\', '/')] = createHash('sha256')
              .update(await readFile(path))
              .digest('hex');
        }
      }
      await walk(base);
      await put(base, 'release.json', JSON.stringify({ app: 'momoitts', schema: 1, files }));
    }
    try {
      const listener = createServer();
      await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
      const address = listener.address();
      assert(address && typeof address !== 'string');
      const port = address.port;
      await new Promise<void>((resolve) => listener.close(() => resolve()));
      await put(installed, 'runtime/node.exe', await readFile(process.execPath));
      await put(
        installed,
        'scripts/windows/update.ps1',
        await readFile('scripts/windows/update.ps1'),
      );
      await put(
        installed,
        'scripts/windows/file-hash.ps1',
        await readFile('scripts/windows/file-hash.ps1'),
      );
      await put(installed, 'scripts/windows/launch.ps1', 'old launch');
      await put(
        installed,
        'scripts/launch/update-target.js',
        `console.log(JSON.stringify({port:${port},nonce:'${'a'.repeat(64)}',proof:'fixture'}));`,
      );
      await put(installed, 'Launch MomoiTTS.cmd', 'old launcher');
      await put(installed, 'src/app/main.js', 'old application');
      await put(installed, 'src/app/obsolete.js', 'superseded file');
      await manifest(installed);
      await cp(installed, next, { recursive: true });
      await put(next, 'src/app/main.js', 'new application');
      await rm(join(next, 'src/app/obsolete.js'));
      await manifest(next);
      const retained = {
        'generation.env': 'dummy-retained-key',
        'dialogue.jsonl': 'private review fixture',
        'twitch-redemptions.json': 'pending refund fixture',
      };
      for (const [file, data] of Object.entries(retained))
        await put(installed, '.local/' + file, data);
      const pack = join(root, 'pack.ps1');
      await writeFile(
        pack,
        `param([string]$InputFolder,[string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($OutputFile, [System.IO.Compression.ZipArchiveMode]::Create)
try { foreach ($file in Get-ChildItem -LiteralPath $InputFolder -File -Recurse -Force) {
  $relative = $file.FullName.Substring($InputFolder.Length + 1).Replace('\\','/')
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, ('MomoiTTS/' + $relative), [System.IO.Compression.CompressionLevel]::NoCompression) | Out-Null
} } finally { $zip.Dispose() }
`,
      );
      const good = join(root, 'good.zip');
      await run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        pack,
        '-InputFolder',
        next,
        '-OutputFile',
        good,
      ]);
      await run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        join(installed, 'scripts/windows/update.ps1'),
        '-ArchivePath',
        good,
        '-NoDialog',
      ]);
      assert.equal(await readFile(join(installed, 'src/app/main.js'), 'utf8'), 'new application');
      await assert.rejects(access(join(installed, 'src/app/obsolete.js')));
      for (const [file, data] of Object.entries(retained))
        assert.equal(await readFile(join(installed, '.local', file), 'utf8'), data);
      // A late locked file fails after earlier files were replaced. Rollback must
      // restore those files and retain recovery copies if the lock blocks restoration.
      assert(!(await readdir(installed)).some((name) => name.startsWith('.update-work-')));
      await put(next, 'Launch MomoiTTS.cmd', 'rollback launcher candidate');
      await put(next, 'src/app/main.js', 'rollback candidate');
      await manifest(next);
      const rollbackArchive = join(root, 'rollback.zip');
      await run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        pack,
        '-InputFolder',
        next,
        '-OutputFile',
        rollbackArchive,
      ]);
      const lockedUpdate = join(root, 'locked-update.ps1');
      await writeFile(
        lockedUpdate,
        `param([string]$Installed,[string]$Archive)
$ErrorActionPreference = 'Stop'
$locked = [System.IO.File]::Open((Join-Path $Installed 'src/app/main.js'), [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Installed 'scripts/windows/update.ps1') -ArchivePath $Archive -NoDialog
  if ($LASTEXITCODE -eq 0) { throw 'Expected locked-file update failure.' }
} finally { $locked.Dispose() }
`,
      );
      await run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        lockedUpdate,
        '-Installed',
        installed,
        '-Archive',
        rollbackArchive,
      ]);
      assert.equal(await readFile(join(installed, 'src/app/main.js'), 'utf8'), 'new application');
      assert.equal(await readFile(join(installed, 'Launch MomoiTTS.cmd'), 'utf8'), 'old launcher');
      for (const [file, data] of Object.entries(retained))
        assert.equal(await readFile(join(installed, '.local', file), 'utf8'), data);
      const recovery = (await readdir(installed)).filter((name) =>
        name.startsWith('.update-work-'),
      );
      assert.equal(recovery.length, 1, 'Failed rollback must preserve its recovery workspace.');
      assert.equal(
        await readFile(join(installed, recovery[0]!, 'backup/src/app/main.js'), 'utf8'),
        'new application',
      );
      // Tampered payload must fail hash validation before touching the installed app.
      await put(next, 'src/app/main.js', 'tampered payload');
      const bad = join(root, 'bad.zip');
      await run('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        pack,
        '-InputFolder',
        next,
        '-OutputFile',
        bad,
      ]);
      await assert.rejects(
        run('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          join(installed, 'scripts/windows/update.ps1'),
          '-ArchivePath',
          bad,
          '-NoDialog',
        ]),
      );
      assert.equal(await readFile(join(installed, 'src/app/main.js'), 'utf8'), 'new application');
      for (const [file, data] of Object.entries(retained))
        assert.equal(await readFile(join(installed, '.local', file), 'utf8'), data);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
