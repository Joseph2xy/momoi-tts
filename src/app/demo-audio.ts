// A portable two-second tone for exercising playback without a provider or private files.
export function demoAudio(): Buffer {
  const rate = 24_000;
  const samples = rate * 2;
  const audio = Buffer.alloc(44 + samples * 2);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(rate, 24);
  audio.writeUInt32LE(rate * 2, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 1200, (samples - i - 1) / 1200);
    audio.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 1600 * fade),
      44 + i * 2,
    );
  }
  return audio;
}
