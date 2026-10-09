import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../src/app/server.ts';
import { demoPipeline } from '../src/app/pipeline.ts';
import type { PlaybackState } from '../src/shared/protocol.ts';

// Demo playback must work without saved provider output. Browser decoding is checked separately.
const server = createAppServer({ pipeline: demoPipeline() });
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) =>
    fetch(`${base}${route}`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  for (const page of ['/', '/testing']) {
    const response = await fetch(`${base}${page}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    if (page === '/') {
      assert(!html.includes('question-form'));
      assert(!html.includes('Send a test question'));
      assert(!html.includes('current-question'));
      assert(!html.includes('current-dialogue'));
    } else {
      assert(html.includes('question-form'));
      assert(html.includes('Testing'));
    }
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map(
      (match) => match[1]!,
    );
    assert(assets.some((asset) => asset.endsWith('.js')));
    assert(assets.some((asset) => asset.endsWith('.css')));
    for (const asset of assets) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200);
      if (asset.endsWith('.css')) {
        const css = await response.text();
        const fonts = [...css.matchAll(/(?:\/assets\/)?([a-zA-Z0-9_-]+\.woff2)/gu)].map(
          (match) => match[1]!,
        );
        assert(fonts.length > 0, 'Self-hosted fonts must be included in the stylesheet');
        for (const font of new Set(fonts)) {
          const fontResponse = await fetch(`${base}/assets/${font}`);
          assert.equal(fontResponse.status, 200);
          assert.equal(fontResponse.headers.get('Content-Type'), 'font/woff2');
        }
      }
    }
  }
  for (const privatePath of [
    '/player',
    '/.local/fish.env',
    '/.generated/releases/package.zip',
    '/characters/catalog.json',
    '/characters/prompts/tyrone.txt',
    '/assets/../fish.env',
    '/assets/config.json',
    '/src/app/config.ts',
  ])
    assert.equal((await fetch(`${base}${privatePath}`)).status, 404);
  const session = '12345678-1234-1234-1234-123456789012';
  await post('/api/player/poll', { session });
  assert.equal(
    (
      await post('/api/requests', {
        viewer: 'Demo',
        question: 'Tyrone: Portable demo',
        eventId: 'portable-demo',
      })
    ).status,
    200,
  );
  let state: PlaybackState | undefined;
  for (let i = 0; i < 25; i++) {
    state = (await (await fetch(`${base}/api/state`)).json()) as PlaybackState;
    if (state.status === 'ready') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(state?.status, 'ready');
  assert(state?.clip);
  assert(state.clip.url.endsWith('.wav'));
  const audioResponse = await fetch(`${base}${state.clip.url}`);
  assert.equal(audioResponse.headers.get('Content-Type'), 'audio/wav');
  const audio = Buffer.from(await audioResponse.arrayBuffer());
  assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
  assert.equal(audio.readUInt32LE(40), audio.length - 44);
  await post('/api/player/event', { session, id: state.clip.id, event: 'playing' });
  await post('/api/player/event', { session, id: state.clip.id, event: 'ended' });
  const finished = (await (await fetch(`${base}/api/state`)).json()) as PlaybackState;
  assert.equal(finished.queue?.activeId, null);
  assert.equal(finished.queue?.requests[0]?.status, 'completed');
  console.log(
    'Browser build assets, private-file exclusion, and portable demo WAV-to-playback acknowledgements passed. No providers.',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
