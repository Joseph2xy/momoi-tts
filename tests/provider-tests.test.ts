import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { SettingsStore } from '../src/app/settings.ts';
import { AppRuntime } from '../src/app/runtime.ts';
import { createHttpServer } from '../src/server/server.ts';
import { testText, testVoiceId } from '../src/app/provider-actions.ts';
import { testPipeline } from './pipeline-fixture.ts';

const voice = '0123456789abcdef0123456789abcdef';
const audio = Buffer.from([0x49, 0x44, 0x33, 0, 0, 0]);
const reply = () =>
  new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'A short reply.' }, finish_reason: 'stop' },
      ],
    }),
  );
const emptySignal = () => new AbortController().signal;

test('Settings provider tests are independent, bounded and preserve trusted dialogue separation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'momoitts-provider-tests-'));
  const originalFetch = globalThis.fetch;
  const store = new SettingsStore({ privateRoot: dir, env: {} });
  const runtime = new AppRuntime({ management: store, onRestart() {} });
  try {
    store.save('generation', {
      provider: 'openrouter',
      key: 'dummy-generation-secret',
      model: 'test/model',
      maxTokens: 1024,
    });
    const payloads: Record<string, unknown>[] = [];
    globalThis.fetch = async (_url, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      return reply();
    };
    assert.equal(store.snapshot().localReady, false);
    assert.deepEqual(
      await runtime.testResponse({ text: 'A normal question without prefix' }, emptySignal()),
      { dialogue: 'A short reply.' },
    );
    assert.equal(runtime.snapshot().queue?.requests.length, 0);
    runtime.session.setRepliesEnabled(true);
    runtime.session.queue.submit(
      'Waiting viewer',
      'Tyrone: Waiting',
      'waiting-provider-test',
      testPipeline(),
    );
    await runtime.testResponse({ text: 'Works with queued work' }, emptySignal());
    assert.equal(runtime.snapshot().queue?.waitingIds.length, 1);
    runtime.session.queue.clear();
    const messages = payloads[0]!.messages as { role: string; content: string }[];
    assert.equal(
      messages[1]!.content,
      JSON.stringify({ viewer_question: 'A normal question without prefix' }),
    );
    assert(messages[0]!.content.includes('untrusted'));
    assert.equal(payloads[0]!.tools, undefined);
    assert.deepEqual(payloads[0]!.provider, { require_parameters: true, allow_fallbacks: false });
    await runtime.testResponse({ text: 'Character question', character: 'tyrone' }, emptySignal());
    assert(
      (payloads[2]!.messages as { content: string }[])[0]!.content.includes(
        store.characterEditor('tyrone').prompt,
      ),
    );
    const before = payloads.length;
    for (const body of [
      { text: '' },
      { text: 'x'.repeat(1001) },
      { text: 'ok', character: '../private' },
      { text: 'ok', character: 1 },
    ])
      await assert.rejects(runtime.testResponse(body, emptySignal()));
    assert.equal(payloads.length, before);
    assert.throws(() => testText('a\u0000b'));
    assert.throws(() => testVoiceId('wrong'));
    assert.equal(testText(' hi '), 'hi');

    store.save('speech', { key: 'dummy-speech-secret' });
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.reference_id, voice);
      assert.equal(body.text, 'Speak this phrase');
      assert.equal(new Headers(init?.headers).get('model'), 's2.1-pro-free');
      return new Response(audio);
    };
    assert.equal(store.snapshot().localReady, false, 'No character voice assignment needed.');
    assert.deepEqual(
      await runtime.testSpeech({ text: 'Speak this phrase', voiceId: voice }, emptySignal()),
      audio,
    );
    assert.equal(
      runtime.snapshot().queue?.requests.length,
      1,
      'Speech test adds no queue history.',
    );
    await assert.rejects(
      runtime.testSpeech({ text: 'phrase', voiceId: 'bad' }, emptySignal()),
      /32 hexadecimal/,
    );
    globalThis.fetch = async () =>
      new Response('dummy-speech-secret private provider detail', { status: 402 });
    await assert.rejects(
      runtime.testSpeech({ text: 'phrase', voiceId: voice }, emptySignal()),
      (error: unknown) => {
        assert(error instanceof Error);
        assert.match(error.message, /HTTP 402.*credit/);
        assert(!error.message.includes('dummy-speech-secret'));
        return true;
      },
    );
    globalThis.fetch = async () =>
      new Response('dummy-generation-secret provider detail', { status: 403 });
    await assert.rejects(
      runtime.testResponse({ text: 'phrase' }, emptySignal()),
      /Check API key and model access/,
    );
    globalThis.fetch = async () => {
      throw new Error('dummy-generation-secret provider detail');
    };
    await assert.rejects(
      runtime.testResponse({ text: 'phrase' }, emptySignal()),
      (error: unknown) => {
        assert(error instanceof Error);
        assert(!error.message.includes('dummy-generation-secret'));
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('Provider test singleton cancels promptly and discards late provider results', async () => {
  const originalFetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), 'momoitts-test-cancel-'));
  const store = new SettingsStore({ privateRoot: dir, env: { FISH_API_KEY: 'dummy-key' } });
  try {
    for (const action of ['caller', 'quit', 'restart', 'close'] as const) {
      const runtime = new AppRuntime({ management: store, onRestart() {} });
      let finish!: (response: Response) => void;
      let signal: AbortSignal | null | undefined;
      globalThis.fetch = async (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      };
      const caller = new AbortController();
      const pending = runtime.testSpeech({ text: 'cancel me', voiceId: voice }, caller.signal);
      await assert.rejects(
        runtime.testResponse({ text: 'second' }, emptySignal()),
        /already running/,
      );
      const rejected = assert.rejects(pending, /cancelled or timed out/);
      if (action === 'caller') caller.abort();
      else if (action === 'restart') runtime.restart(true);
      else runtime[action]();
      await rejected;
      assert(signal?.aborted);
      finish(new Response(audio));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(runtime.snapshot().clip, null);
      assert.equal(runtime.snapshot().queue?.requests.length, 0);
      runtime.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Saved configuration cancels previews across clients while rejected saves preserve them', async () => {
  const originalFetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), 'momoitts-config-cancel-'));
  const store = new SettingsStore({ privateRoot: dir, env: {} });
  store.save('speech', { key: 'dummy-key' });
  const runtime = new AppRuntime({ management: store });
  try {
    for (const action of ['generation', 'speech', 'character', 'reload'] as const) {
      let signal: AbortSignal | null | undefined;
      let finish!: (response: Response) => void;
      globalThis.fetch = async (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      };
      const pending = runtime.testSpeech({ text: 'old preview', voiceId: voice }, emptySignal());
      assert(signal);
      assert.throws(() => runtime.saveSettings('speech', { key: '', model: 'invalid' }));
      assert.equal(signal.aborted, false, 'Rejected settings must retain the current preview.');
      const cancelled = assert.rejects(pending, /cancelled or timed out/);
      if (action === 'generation')
        runtime.saveSettings('generation', {
          provider: 'openrouter',
          key: 'dummy-generation',
          model: 'test/model',
          maxTokens: 1024,
        });
      else if (action === 'speech') runtime.saveSettings('speech', { key: '', model: 's2.1-pro' });
      else if (action === 'character')
        runtime.saveCharacter('tyrone', { prompt: 'A new character prompt.', voiceId: voice });
      else runtime.refreshProfiles();
      await cancelled;
      assert(signal.aborted);
      finish(new Response(audio));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(runtime.snapshot().clip, null);
    }
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream({
          cancel() {
            return new Promise<void>(() => {});
          },
        }),
      );
    const checked = await Promise.race([
      runtime.checkConnection('speech'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Connection body cleanup blocked the result.')), 250),
      ),
    ]);
    assert.equal(checked.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
    runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('HTTP speech test returns private bounded MP3 and OBS test uses fixed queue pipeline', async () => {
  const originalFetch = globalThis.fetch;
  const dir = await mkdtemp(join(tmpdir(), 'momoitts-test-http-'));
  const store = new SettingsStore({ privateRoot: dir, env: { FISH_API_KEY: 'dummy-key' } });
  const runtime = new AppRuntime({
    management: store,
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  });
  const server = createHttpServer(runtime);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = base) =>
    originalFetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    });
  let calls = 0;
  let submittedText = '';
  globalThis.fetch = async (_url, init) => {
    calls++;
    submittedText = JSON.parse(String(init?.body)).text;
    return new Response(audio);
  };
  try {
    assert.equal(
      (
        await post(
          '/api/test/speech',
          { text: 'private phrase', voiceId: voice },
          'https://evil.example',
        )
      ).status,
      403,
    );
    assert.equal(calls, 0);
    const response = await post('/api/test/speech', { text: 'private phrase', voiceId: voice });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert(response.headers.get('content-security-policy')?.includes("media-src 'self' blob:"));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
    assert.equal((await post('/api/test/voice', {})).status, 404);
    const body = { voiceId: voice, eventId: 'obs-one' };
    assert.match((await (await post('/api/test/obs', body)).json()).error, /Connect the OBS/);
    runtime.session.poll('12345678-1234-1234-1234-123456789012');
    assert.match((await (await post('/api/test/obs', body)).json()).error, /Turn replies on/);
    runtime.session.setRepliesEnabled(true);
    const obs = await (await post('/api/test/obs', body)).json();
    assert.equal(typeof obs.requestId, 'string');
    assert.equal(obs.management.localReady, false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(submittedText, 'This is the MomoiTTS OBS output test.');
    assert.equal(runtime.snapshot().queue?.requests[0]?.status, 'ready');
    const recovered = await (
      await post('/api/test/obs', { ...body, voiceId: voice.toUpperCase() })
    ).json();
    assert.equal(
      recovered.requestId,
      obs.requestId,
      'Retry after a lost HTTP response recovers the accepted OBS request.',
    );
    assert.equal(runtime.snapshot().queue?.requests.length, 1);
    assert.equal(calls, 2, 'Idempotent recovery never dispatches speech twice.');
    const conflicting = await post('/api/test/obs', { ...body, voiceId: 'f'.repeat(32) });
    assert.equal(conflicting.status, 409);
    assert.match((await conflicting.json()).error, /different voice/);
    assert.equal(runtime.snapshot().queue?.activeId, obs.requestId);
    assert.match(
      (await (await post('/api/test/obs', { voiceId: voice, eventId: 'obs-two' })).json()).error,
      /Finish or clear/,
    );
    assert.equal(calls, 2);
    assert.equal((await post('/api/test/obs/cancel', { requestId: 'unrelated' })).status, 409);
    assert.equal(runtime.snapshot().queue?.activeId, obs.requestId);
    assert.equal((await post('/api/test/obs/cancel', { requestId: obs.requestId })).status, 200);
    assert.equal(runtime.session.audio(`/audio/${obs.requestId}.mp3`), null);
    runtime.session.setRepliesEnabled(false);
    assert.equal(
      (await (await post('/api/test/obs', body)).json()).requestId,
      obs.requestId,
      'An accepted cancelled test can be recovered while replies are off without replay.',
    );
    assert.equal(calls, 2);
    runtime.session.setRepliesEnabled(true);
    const nextRequest = runtime.session.queue.submit(
      'New viewer',
      'Tyrone: Newer work',
      'new-viewer-after-obs',
      testPipeline(),
    );
    assert.equal((await post('/api/test/obs/cancel', { requestId: obs.requestId })).status, 200);
    assert.equal(
      runtime.snapshot().queue?.activeId,
      nextRequest,
      'Stale OBS cancellation leaves newer viewer work intact.',
    );
    runtime.session.queue.skip();
    const collided = await post('/api/test/obs', {
      voiceId: voice,
      eventId: 'new-viewer-after-obs',
    });
    assert.equal(collided.status, 409);
    assert.match((await collided.json()).error, /already in use/);
    assert.equal(
      (await post('/api/test/obs/cancel', { requestId: nextRequest })).status,
      409,
      'An event ID collision must never grant OBS cancellation authority over viewer work.',
    );
    assert.equal(calls, 2);
    let providerSignal: AbortSignal | null | undefined;
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => {
      dispatched = resolve;
    });
    globalThis.fetch = async (_url, init) => {
      providerSignal = init?.signal;
      dispatched();
      return new Response(new ReadableStream());
    };
    const departed = httpRequest(
      base + '/api/test/speech',
      { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' } },
      () => {},
    );
    departed.on('error', () => {});
    departed.end(JSON.stringify({ text: 'departing', voiceId: voice }));
    await started;
    departed.destroy();
    for (let attempts = 0; attempts < 100 && !providerSignal?.aborted; attempts++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert(providerSignal?.aborted, 'HTTP departure must abort speech before a late result.');
    await new Promise((resolve) => setTimeout(resolve, 0));
    let connectionStarted!: () => void;
    const connecting = new Promise<void>((resolve) => {
      connectionStarted = resolve;
    });
    const connectionState: { signal?: AbortSignal | null } = {};
    globalThis.fetch = async (_url, init) => {
      connectionState.signal = init?.signal;
      connectionStarted();
      return new Promise<Response>(() => {});
    };
    const connection = httpRequest(base + '/api/check/connection', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
    });
    connection.on('error', () => {});
    connection.end(JSON.stringify({ section: 'speech' }));
    await connecting;
    connection.destroy();
    for (let attempts = 0; attempts < 100 && !connectionState.signal?.aborted; attempts++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert(connectionState.signal?.aborted, 'HTTP departure must abort connection checks.');
  } finally {
    globalThis.fetch = originalFetch;
    runtime.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
