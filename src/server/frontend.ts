import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';

const buildRoot = new URL(
  import.meta.url.endsWith('.js') ? '../../web-build/' : '../../.generated/web/',
  import.meta.url,
);
export async function sendFrontend(
  path: string,
  response: ServerResponse,
  search = new URLSearchParams(),
): Promise<boolean> {
  // Existing local bookmarks lead to the provider settings; there is no second testing UI.
  if (path === '/testing') {
    const mode = search.get('mode');
    const topic =
      mode === 'voice' ? 'speech' : mode === 'full' || mode === 'obs' ? 'obs' : 'generation';
    response.writeHead(303, { Location: `/?page=settings&topic=${topic}` });
    response.end();
    return true;
  }
  // Only the built pages and hashed assets are exposed, never other generated/private files.
  const file =
    path === '/'
      ? 'index.html'
      : path === '/player'
        ? 'player.html'
        : /^\/assets\/[a-zA-Z0-9_-]+\.(js|css|woff2)$/u.test(path)
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
      : file.endsWith('.woff2')
        ? 'font/woff2'
        : 'text/javascript';
  response.writeHead(200, {
    'Content-Type': file.endsWith('.woff2') ? type : `${type}; charset=utf-8`,
  });
  response.end(content);
  return true;
}
