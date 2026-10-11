import { access, readFile } from 'node:fs/promises';

export async function ensureFrontend(): Promise<void> {
  if (!import.meta.url.endsWith('.js')) {
    const { ensureBrowserBuild } = await import('../build/browser.ts');
    await ensureBrowserBuild();
    return;
  }
  const root = new URL('../../web-build/', import.meta.url);
  try {
    for (const name of ['index.html', 'player.html']) {
      const html = await readFile(new URL(name, root), 'utf8');
      for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu))
        await access(new URL(match[1]!.slice(1), root));
    }
  } catch {
    throw new Error('App files are missing. Extract the complete MomoiTTS ZIP again.');
  }
}
