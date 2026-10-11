import { validateFishModel, type FishModel } from './config.ts';
import { SpeechFailure } from '../../shared/errors.ts';

interface SynthesizeSpeechInput {
  text: string;
  apiKey: string;
  voiceId: string;
  model: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface SpeechResult {
  audio: Buffer;
  format: 'mp3';
  provider: 'fish-audio';
  model: FishModel;
  voiceId: string;
  inputBytes: number;
  firstAudioMs: number;
  elapsedMs: number;
}

// Request only the explicitly configured model; no application fallback.
export async function synthesizeSpeech({
  text,
  apiKey,
  voiceId,
  model,
  signal,
  timeoutMs = 45_000,
}: SynthesizeSpeechInput): Promise<SpeechResult> {
  validateFishModel(model);
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 4000)
    throw new Error('Speech text must contain 1–4000 UTF-8 bytes.');
  if (typeof apiKey !== 'string' || !apiKey.trim() || /\s/u.test(apiKey))
    throw new Error('Set a valid FISH_API_KEY in private configuration.');
  if (!/^[a-f0-9]{32}$/iu.test(voiceId))
    throw new Error('Fish voice ID must contain 32 hexadecimal characters.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000)
    throw new Error('Timeout must be 100–120000 ms.');
  if (signal?.aborted) throw new Error('Speech cancelled.');
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      redirect: 'error',
      signal: combined,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        model,
      },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: 'normal',
      }),
    });
    combined.throwIfAborted();
    if (!response.ok) {
      // Cleanup must not delay or replace the provider's known HTTP outcome.
      void response.body?.cancel().catch(() => {});
      throw new SpeechFailure('http', response.status);
    }
    if (!response.body) throw new SpeechFailure('empty');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let firstAudioMs: number | undefined;
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    combined.addEventListener('abort', abort, { once: true });
    if (combined.aborted) abort();
    try {
      while (true) {
        const { value, done } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        if (!value.length) continue;
        firstAudioMs ??= Math.round(performance.now() - started);
        bytes += value.length;
        if (bytes > 5_000_000) throw new SpeechFailure('audio-too-large');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      combined.removeEventListener('abort', abort);
      reader.releaseLock();
    }
    combined.throwIfAborted();
    const audio = Buffer.concat(chunks);
    // Reject JSON/HTML and empty success responses before saving them as MP3.
    const mp3 =
      audio.subarray(0, 3).toString('ascii') === 'ID3' ||
      (audio.length >= 2 && audio[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0);
    if (!mp3 || firstAudioMs === undefined) throw new SpeechFailure('invalid-audio');
    return {
      audio,
      format: 'mp3',
      provider: 'fish-audio',
      model,
      voiceId,
      inputBytes: Buffer.byteLength(text, 'utf8'),
      firstAudioMs,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (signal?.aborted) throw new Error('Speech cancelled.');
    if (controller.signal.aborted) throw new SpeechFailure('timeout');
    if (error instanceof SpeechFailure) throw error;
    throw new SpeechFailure('network');
  } finally {
    clearTimeout(timer);
  }
}
