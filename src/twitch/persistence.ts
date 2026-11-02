import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// Windows readers/scanners can briefly deny replacement of an otherwise writable file.
// Keep the original intact and retry only these transient sharing failures.
export async function replacePrivateFile(
  temporary: URL,
  destination: URL,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      await rename(temporary, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32' ||
        attempt >= 5 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')
      )
        throw error;
      await delay(10 * 2 ** attempt, undefined, { signal });
    }
  }
}
