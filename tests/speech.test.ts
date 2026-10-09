import assert from 'node:assert/strict';
import { synthesizeSpeech } from '../src/providers/fish/synthesize-speech.ts';

const originalFetch = globalThis.fetch;
const input = {
  text: 'A fixed test line.',
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
  const before = calls;
  await assert.rejects(synthesizeSpeech({ ...input, signal: AbortSignal.abort() }), /cancelled/u);
  await assert.rejects(synthesizeSpeech({ ...input, voiceId: 'bad' }), /voice ID/u);
  assert.equal(calls, before);
  globalThis.fetch = async () => new Response('secret provider error', { status: 402 });
  await assert.rejects(
    synthesizeSpeech(input),
    /HTTP 402: Free model access is unavailable; no paid fallback/u,
  );
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
  console.log(
    'Offline speech checks passed: free backend, request mapping, input validation, cancellation, timeout, redacted errors, MP3 validation, and size limit. No provider requests.',
  );
} finally {
  globalThis.fetch = originalFetch;
}
