import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';

const buildRoot = new URL('../../.generated/web/', import.meta.url);
export async function sendFrontend(path: string, response: ServerResponse): Promise<boolean> {
  // Only the built pages and hashed assets are exposed, never other generated/private files.
  const file =
    path === '/'
      ? 'index.html'
      : path === '/testing'
        ? 'testing.html'
        : /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/u.test(path)
          ? path.slice(1)
          : null;
  if (!file) return false;
  let content: Buffer;
  try {
    content = await readFile(new URL(file, buildRoot));
  } catch {
    return false;
  }
  const type = file.endsWith('.html')
    ? 'text/html'
    : file.endsWith('.css')
      ? 'text/css'
      : 'text/javascript';
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  response.end(content);
  return true;
}
