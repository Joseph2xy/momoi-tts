import assert from 'node:assert/strict';
import { synthesizeSpeech } from '../src/providers/fish/synthesize-speech.ts';
import { SpeechFailure } from '../src/shared/errors.ts';

const originalFetch = globalThis.fetch;
const input = {
  text: 'A fixed test line.',
  model: 's2.1-pro-free',
  apiKey: 'dummy-test-key',
  voiceId: '9287db8543cf4067ac99beb9927226bb',
};
const audio = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0]);
let calls = 0;
try {
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.fish.audio/v1/tts');
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers.model, 's2.1-pro-free');
    assert.equal(headers.Authorization, 'Bearer dummy-test-key');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body)) as {
      text: string;
      reference_id: string;
      format: string;
    };
    assert.equal(body.reference_id, input.voiceId);
    assert.equal(body.text, input.text);
    assert.equal(body.format, 'mp3');
    return new Response(audio);
  };
  const result = await synthesizeSpeech(input);
  assert.deepEqual(result.audio, Buffer.from(audio));
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get('model'), 's2.1-pro');
    return new Response(audio);
  };
  assert.equal((await synthesizeSpeech({ ...input, model: 's2.1-pro' })).model, 's2.1-pro');
  const before = calls;
  await assert.rejects(synthesizeSpeech({ ...input, signal: AbortSignal.abort() }), /cancelled/u);
  await assert.rejects(synthesizeSpeech({ ...input, voiceId: 'bad' }), /voice ID/u);
  await assert.rejects(synthesizeSpeech({ ...input, model: 'typo-model' }), /model/u);
  await assert.rejects(synthesizeSpeech({ ...input, model: '' }), /model/u);
  assert.equal(calls, before);
  for (const status of [400, 401, 403, 402, 404, 422, 429, 500]) {
    globalThis.fetch = async () => new Response('PRIVATE_PROVIDER_SECRET', { status });
    await assert.rejects(synthesizeSpeech(input), (error: unknown) => {
      assert(error instanceof SpeechFailure);
      assert.equal(error.httpStatus, status);
      assert(error.publicMessage.includes(`HTTP ${status}`));
      assert(!error.publicMessage.includes('PRIVATE_PROVIDER_SECRET'));
      return true;
    });
  }
  // Failed or stalled response cleanup must preserve the explicit HTTP failure.
  for (const cancel of [
    () => Promise.reject(new Error('PRIVATE_CLEANUP_SECRET')),
    () => new Promise<void>(() => {}),
  ]) {
    globalThis.fetch = async () => new Response(new ReadableStream({ cancel }), { status: 402 });
    await assert.rejects(synthesizeSpeech({ ...input, timeoutMs: 100 }), (error: unknown) => {
      assert(error instanceof SpeechFailure);
      assert.equal(error.httpStatus, 402);
      return true;
    });
  }
  // Transport errors with provider-looking prefixes must not bypass redaction.
  globalThis.fetch = async () => {
    throw new Error('Fish Audio PRIVATE_TRANSPORT_SECRET');
  };
  await assert.rejects(synthesizeSpeech(input), (error: unknown) => {
    assert(error instanceof SpeechFailure);
    assert.equal(error.code, 'network');
    assert(!error.message.includes('PRIVATE_TRANSPORT_SECRET'));
    return true;
  });
  globalThis.fetch = async () => new Response('{"secret":"not audio"}');
  await assert.rejects(synthesizeSpeech(input), /invalid MP3/u);
  globalThis.fetch = async () => new Response(new Uint8Array(5_000_001));
  await assert.rejects(synthesizeSpeech(input), /5 MB/u);
  // Simulate a transport that delivers a late result despite cancellation.
  const cancel = new AbortController();
  globalThis.fetch = async () => {
    cancel.abort();
    return new Response(audio);
  };
  await assert.rejects(synthesizeSpeech({ ...input, signal: cancel.signal }), /cancelled/u);
  globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new Error('private transport details')),
        { once: true },
      );
    });
  await assert.rejects(synthesizeSpeech({ ...input, timeoutMs: 100 }), /timed out/u);
  // The deadline must also bound a stalled body, even if transport ignores abort.
  let bodyCancelled = 0;
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(audio);
        },
        cancel() {
          bodyCancelled++;
        },
      }),
    );
  await assert.rejects(synthesizeSpeech({ ...input, timeoutMs: 100 }), /timed out/u);
  assert.equal(bodyCancelled, 1);
  const bodyAbort = new AbortController();
  const pendingSpeech = synthesizeSpeech({ ...input, signal: bodyAbort.signal });
  setTimeout(() => bodyAbort.abort(), 10);
  await assert.rejects(pendingSpeech, /cancelled/u);
  assert.equal(bodyCancelled, 2);
  console.log(
    'Offline speech checks passed: explicit model, request mapping, input validation, cancellation, timeout, redacted errors, MP3 validation, and size limit. No provider requests.',
  );
} finally {
  globalThis.fetch = originalFetch;
}
