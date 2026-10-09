import path from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

// Reuse the installed official CLI; avoid shell commands containing viewer text.
export function findCodex(): string {
  if (process.env.TYRONE_CODEX_BIN) return process.env.TYRONE_CODEX_BIN;
  let launcher = process.env.TYRONE_CODEX_LAUNCHER;
  if (!launcher) {
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      const shim = path.join(dir, 'codex.ps1');
      if (!existsSync(shim)) continue;
      const match = readFileSync(shim, 'utf8').match(
        /"\$basedir[\\/]([^"\r\n]*[\\/]bin[\\/]codex\.js)"/,
      );
      if (match?.[1]) {
        launcher = path.resolve(dir, match[1]);
        break;
      }
    }
  }
  if (!launcher)
    throw new Error(
      'Codex was not found. Install/sign in to the official CLI or set TYRONE_CODEX_BIN.',
    );
  const resolved = realpathSync(launcher);
  const require = createRequire(resolved);
  let vendor: string;
  try {
    vendor = path.join(
      path.dirname(require.resolve('@openai/codex-win32-x64/package.json')),
      'vendor',
    );
  } catch {
    vendor = path.join(path.dirname(resolved), '..', 'vendor');
  }
  const executable = path.join(vendor, 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  if (!existsSync(executable))
    throw new Error('The Codex native executable was not found. Set TYRONE_CODEX_BIN.');
  return executable;
}

export const testedVersion = 'codex-cli 0.162.0';
export function assertTestedVersion(executable: string): void {
  const version = execFileSync(executable, ['--version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  }).trim();
  if (version !== testedVersion)
    throw new Error(
      'Codex version changed. Recheck the offline tool boundary before using this adapter.',
    );
}

const disabledFeatures = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'remote_plugin',
  'browser_use',
  'browser_use_external',
  'browser_use_full_cdp_access',
  'computer_use',
  'in_app_browser',
  'image_generation',
  'multi_agent',
  'goals',
  'hooks',
  'skill_search',
  'skill_mcp_dependency_install',
  'memories',
  'code_mode',
  'code_mode_host',
  'sleep_tool',
  'tool_suggest',
  'workspace_dependencies',
  'daemon_auto_start',
];

interface DialogueArgsOptions {
  work: string;
  instructions: string;
  model?: string;
  extraConfig?: readonly string[];
}

export function dialogueArgs({
  work,
  instructions,
  model = 'gpt-6.1-sol',
  extraConfig = [],
}: DialogueArgsOptions): string[] {
  const config = [
    'web_search="disabled"',
    'features.view_image=false',
    'agents.enabled=false',
    'project_doc_max_bytes=0',
    'approval_policy="never"',
    'model_reasoning_effort="low"',
    'analytics.enabled=false',
    `model_instructions_file=${JSON.stringify(instructions.replaceAll('\\', '/'))}`,
    ...extraConfig,
  ];
  const args = [
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--json',
    '-C',
    work,
    '-m',
    model,
  ];
  for (const feature of disabledFeatures) args.push('--disable', feature);
  for (const setting of config) args.push('-c', setting);
  args.push('-');
  return args;
}

export function subscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of ['CODEX_API_KEY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'FISH_API_KEY'])
    delete env[name];
  return env;
}
