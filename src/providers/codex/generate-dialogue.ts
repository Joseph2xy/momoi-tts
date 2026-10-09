import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findCodex, testedVersion, dialogueArgs, subscriptionEnv } from './runtime.ts';
import { dialogueInstructions, validateDialogueInput, type DialogueInput } from '../dialogue.ts';

const execFileAsync = promisify(execFile);

interface DialogueUsage {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  reasoning_output_tokens?: number;
}

interface DialogueResult {
  dialogue: string;
  elapsedMs: number;
  words: number;
  usage: DialogueUsage;
  provider: 'codex-exec';
  model: 'gpt-6.1-sol';
}

// JSONL event fields consumed from the pinned CLI version.
export interface CodexEvent {
  type: string;
  item?: {
    type: string;
    text?: string;
    message?: string;
  };
  usage?: DialogueUsage;
}

// Codex-specific result metadata; the app pipeline consumes only dialogue.
export async function generateDialogue(
  { character, question, maxWords = 60, timeoutMs = 45_000, signal }: DialogueInput,
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): Promise<DialogueResult> {
  validateDialogueInput({ character, question, maxWords, timeoutMs });
  if (signal?.aborted) throw new Error('Generation cancelled.');
  const executable = findCodex(runtimeEnv);
  const env = subscriptionEnv();
  const checks = {
    env,
    encoding: 'utf8' as const,
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 8192,
    signal,
  };
  let version: string;
  try {
    version = (await execFileAsync(executable, ['--version'], checks)).stdout.trim();
  } catch {
    throw new Error(signal?.aborted ? 'Generation cancelled.' : 'Could not check Codex version.');
  }
  if (version !== testedVersion)
    throw new Error(
      'Codex version changed. Recheck the offline tool boundary before using this adapter.',
    );
  let signedIn = false;
  try {
    const auth = await execFileAsync(executable, ['login', 'status'], checks);
    signedIn = `${auth.stdout}${auth.stderr}`.includes('Logged in using ChatGPT');
  } catch {
    if (signal?.aborted) throw new Error('Generation cancelled.');
  }
  if (!signedIn) throw new Error('Codex generation requires ChatGPT CLI sign-in. Run codex login.');
  const root = await mkdtemp(path.join(tmpdir(), 'tyrone-dialogue-'));
  const instructions = path.join(root, 'instructions.txt');
  const work = path.join(root, 'work');
  await mkdir(work);
  const rules = dialogueInstructions(character, maxWords);
  await writeFile(instructions, rules, 'utf8');
  const started = performance.now();
  try {
    return await new Promise<DialogueResult>((resolve, reject) => {
      const child = spawn(executable, dialogueArgs({ work, instructions }), {
        env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let buffer = '',
        text: string | undefined = '',
        bytes = 0;
      let usage: DialogueUsage | undefined;
      let failure: Error | null = null;
      const fail = (message: string): void => {
        failure ??= new Error(message);
        child.kill();
      };
      const abort = () => fail('Generation cancelled.');
      const timer = setTimeout(() => fail('Generation timed out.'), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      child.stderr.resume(); // Provider diagnostics can contain private data; do not log them.
      child.stdin.on('error', () => {});
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) {
          fail('Generation exceeded the output limit.');
          return;
        }
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          let event: CodexEvent;
          try {
            event = JSON.parse(line) as CodexEvent;
          } catch {
            fail('Invalid generation event.');
            return;
          }
          if (event.item?.type === 'error') {
            // The CLI labels this nonfatal notice as an error item. It confirms
            // that its code executor stays unavailable; text generation continues.
            if (
              event.item.message ===
              'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable `features.code_mode_host` and install `codex-code-mode-host`.'
            )
              continue;
            // Map errors to fixed messages rather than logging provider payloads.
            const detail = String(event.item.message ?? event.item.text ?? '');
            const message = /rate.limit|usage.limit|quota/i.test(detail)
              ? 'Account allowance or rate limit reached.'
              : /auth|sign.in|401|403/i.test(detail)
                ? 'Check your CLI sign-in and account access.'
                : /model.*(?:unsupported|not supported|unavailable)/i.test(detail)
                  ? 'The selected model is unavailable for this account.'
                  : /unrecognized configuration|config.toml/i.test(detail)
                    ? 'The CLI configuration needs to be rechecked.'
                    : 'Provider returned an error. Check CLI sign-in or account allowance.';
            fail(`Generation failed: ${message}`);
          }
          if (event.type === 'error' || event.type === 'turn.failed')
            fail('Generation failed. Check CLI sign-in or account allowance.');
          if (
            event.type?.startsWith('item.') &&
            !['agent_message', 'reasoning', 'error'].includes(event.item?.type ?? '')
          )
            fail(
              `Unexpected generation item (${event.item?.type ?? 'missing type'}). Dialogue was discarded.`,
            );
          if (event.type === 'item.completed' && event.item?.type === 'agent_message')
            text = event.item.text;
          if (event.type === 'turn.completed') usage = event.usage;
        }
      });
      child.once('error', () => {
        failure = new Error('Could not start Codex.');
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (failure) {
          reject(failure);
          return;
        }
        if (code !== 0 || !usage || typeof text !== 'string' || !text.trim()) {
          reject(new Error('Generation returned no dialogue.'));
          return;
        }
        const dialogue = text.trim();
        const words = dialogue.split(/\s+/u).length;
        if (words > maxWords) {
          reject(new Error('Dialogue exceeded the response limit.'));
          return;
        }
        resolve({
          dialogue,
          elapsedMs: Math.round(performance.now() - started),
          words,
          usage,
          provider: 'codex-exec',
          model: 'gpt-6.1-sol',
        });
      });
      child.stdin.end(JSON.stringify({ viewer_question: question }));
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
