interface SynthesizeSpeechInput {
  text: string;
  apiKey: string;
  voiceId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface SpeechResult {
  audio: Buffer;
  format: 'mp3';
  provider: 'fish-audio';
  model: 's2.1-pro-free';
  voiceId: string;
  inputBytes: number;
  firstAudioMs: number;
  elapsedMs: number;
}

// Request the configured free-model route only; never fall back to paid.
export async function synthesizeSpeech({
  text,
  apiKey,
  voiceId,
  signal,
  timeoutMs = 45_000,
}: SynthesizeSpeechInput): Promise<SpeechResult> {
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
        model: 's2.1-pro-free',
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
      await response.body?.cancel();
      const reason =
        response.status === 401 || response.status === 403
          ? 'Check API key and voice access.'
          : response.status === 402
            ? 'Free model access is unavailable; no paid fallback was attempted.'
            : response.status === 429
              ? 'Rate limit reached; try again later.'
              : response.status === 404
                ? 'Voice or endpoint unavailable.'
                : 'Provider rejected the request.';
      throw new Error(`Fish Audio HTTP ${response.status}: ${reason}`);
    }
    if (!response.body) throw new Error('Fish Audio returned no audio.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let firstAudioMs: number | undefined;
    try {
      while (true) {
        const { value, done } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        if (!value.length) continue;
        firstAudioMs ??= Math.round(performance.now() - started);
        bytes += value.length;
        if (bytes > 5_000_000) throw new Error('Speech audio exceeded the 5 MB limit.');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    combined.throwIfAborted();
    const audio = Buffer.concat(chunks);
    // Reject JSON/HTML and empty success responses before saving them as MP3.
    const mp3 =
      audio.subarray(0, 3).toString('ascii') === 'ID3' ||
      (audio.length >= 2 && audio[0] === 0xff && ((audio[1] ?? 0) & 0xe0) === 0xe0);
    if (!mp3 || firstAudioMs === undefined)
      throw new Error('Fish Audio returned invalid MP3 audio.');
    return {
      audio,
      format: 'mp3',
      provider: 'fish-audio',
      model: 's2.1-pro-free',
      voiceId,
      inputBytes: Buffer.byteLength(text, 'utf8'),
      firstAudioMs,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (signal?.aborted) throw new Error('Speech cancelled.');
    if (controller.signal.aborted) throw new Error('Speech timed out.');
    if (error instanceof Error && /^(Fish Audio |Speech audio )/u.test(error.message)) throw error;
    throw new Error('Fish Audio request failed. Check your connection and API access.');
  } finally {
    clearTimeout(timer);
  }
}
