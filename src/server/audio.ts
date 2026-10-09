import type { ServerResponse } from 'node:http';

export function sendAudio(
  response: ServerResponse,
  audio: Buffer,
  range: string | undefined,
): void {
  const type = audio.toString('ascii', 0, 4) === 'RIFF' ? 'audio/wav' : 'audio/mpeg';
  response.setHeader('Accept-Ranges', 'bytes');
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/u.exec(range);
    const start = Number(match?.[1]);
    const end = match?.[2] ? Math.min(Number(match[2]), audio.length - 1) : audio.length - 1;
    if (
      !match ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= audio.length
    ) {
      response.writeHead(416, { 'Content-Range': `bytes */${audio.length}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${audio.length}`,
    });
    response.end(audio.subarray(start, end + 1));
    return;
  }
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': audio.length });
  response.end(audio);
}
