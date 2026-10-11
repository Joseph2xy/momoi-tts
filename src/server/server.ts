import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { RequestInputError } from '../shared/errors.ts';
import type { PlaybackSession } from '../playback/session.ts';
import type { PlaybackState } from '../shared/protocol.ts';
import { routeCommand } from './routes.ts';
import { sendAudio } from './audio.ts';
import { sendFrontend } from './frontend.ts';
import type { SettingsSection } from '../shared/protocol.ts';

interface HttpRuntime {
  session: PlaybackSession;
  canQuit: boolean;
  snapshot(): PlaybackState;
  configurationProof(nonce: string): string | undefined;
  quit(): void;
  saveSettings(section: SettingsSection, body: Record<string, unknown>): unknown;
  restart(confirmed: boolean): void;
  testResponse(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
  testSpeech(body: Record<string, unknown>, signal: AbortSignal): Promise<Buffer>;
  testObs(body: Record<string, unknown>): unknown;
  cancelObsTest(body: Record<string, unknown>): unknown;
  checkConnection(section: unknown, signal?: AbortSignal): Promise<unknown>;
  refreshProfiles(): unknown;
  connectTwitch(): void;
  disconnectTwitch(): void;
  characterEditor(id: string): unknown;
  saveCharacter(id: string, body: Record<string, unknown>): unknown;
}

export function createHttpServer(runtime: HttpRuntime) {
  const { session } = runtime;
  const snapshot = () => runtime.snapshot();
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;

  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    const json = (code: number, value: unknown) => {
      response.writeHead(code, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    try {
      session.sweep();
      const address = server.address();
      if (!address || typeof address === 'string') {
        json(503, { error: 'Server unavailable.' });
        return;
      }
      const hosts = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
      if (!hosts.includes(request.headers.host ?? '')) {
        json(403, { error: 'Local access only.' });
        return;
      }
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      const characterRoute = /^\/api\/characters\/([a-z][a-z0-9_-]{0,31})$/u.exec(url.pathname);
      if (request.method === 'GET') {
        if (characterRoute) {
          if (
            (request.headers.origin &&
              !hosts.some((host) => request.headers.origin === `http://${host}`)) ||
            (request.headers['sec-fetch-site'] &&
              request.headers['sec-fetch-site'] !== 'same-origin')
          ) {
            json(403, { error: 'Same-origin character editor required.' });
            return;
          }
          json(200, runtime.characterEditor(characterRoute[1]!));
          return;
        }
        if (url.pathname === '/api/health') {
          const nonce = request.headers['x-momoitts-launch-nonce'];
          const proof =
            typeof nonce === 'string' && /^[a-f0-9]{64}$/u.test(nonce)
              ? runtime.configurationProof(nonce)
              : undefined;
          json(200, {
            app: 'momoitts',
            mode: session.queue.snapshot().mode,
            configurationProof: proof,
          });
          return;
        }
        if (url.pathname === '/api/state') {
          json(200, snapshot());
          return;
        }
        if (url.pathname.startsWith('/audio/')) {
          const audio = session.audio(url.pathname);
          if (!audio) {
            json(404, { error: 'Audio unavailable.' });
            return;
          }
          sendAudio(response, audio, request.headers.range);
          return;
        }
        if (await sendFrontend(url.pathname, response, url.searchParams)) return;
      }
      if (request.method !== 'POST' || !url.pathname.startsWith('/api/')) {
        json(404, { error: 'Not found.' });
        return;
      }
      if (!hosts.some((host) => request.headers.origin === `http://${host}`)) {
        json(403, { error: 'Same-origin controls required.' });
        return;
      }
      let raw = '';
      request.setEncoding('utf8');
      for await (const chunk of request) {
        raw += String(chunk);
        if (Buffer.byteLength(raw) > (characterRoute ? 16384 : 8192)) {
          json(413, { error: 'Request too large.' });
          return;
        }
      }
      let body: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        body = parsed as Record<string, unknown>;
      } catch {
        json(400, { error: 'Invalid request.' });
        return;
      }
      if (characterRoute) {
        json(200, runtime.saveCharacter(characterRoute[1]!, body));
        return;
      }
      if (url.pathname === '/api/app/quit') {
        if (!runtime.canQuit) {
          json(409, { error: 'Shutdown is unavailable in this session.' });
          return;
        }
        runtime.quit();
        json(200, snapshot());
        return;
      }
      if (url.pathname === '/api/twitch/connect') {
        runtime.connectTwitch();
        json(200, snapshot());
        return;
      }
      if (url.pathname === '/api/app/restart') {
        runtime.restart(body.confirmed === true);
        json(200, { ok: true });
        return;
      }
      if (
        url.pathname === '/api/test/response' ||
        url.pathname === '/api/test/speech' ||
        url.pathname === '/api/check/connection'
      ) {
        const cancel = new AbortController();
        const abort = () => cancel.abort();
        response.once('close', abort);
        try {
          const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(45_000)]);
          if (url.pathname === '/api/test/speech') {
            const audio = await runtime.testSpeech(body, signal);
            signal.throwIfAborted();
            if (!response.destroyed) {
              response.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audio.length,
              });
              response.end(audio);
            }
          } else {
            const result =
              url.pathname === '/api/check/connection'
                ? await runtime.checkConnection(body.section, signal)
                : await runtime.testResponse(body, signal);
            signal.throwIfAborted();
            if (!response.destroyed) json(200, result);
          }
        } finally {
          response.removeListener('close', abort);
        }
        return;
      }
      if (url.pathname === '/api/test/obs') {
        json(200, runtime.testObs(body));
        return;
      }
      if (url.pathname === '/api/test/obs/cancel') {
        json(200, runtime.cancelObsTest(body));
        return;
      }
      if (url.pathname === '/api/app/refresh-profiles') {
        json(200, runtime.refreshProfiles());
        return;
      }
      if (url.pathname.startsWith('/api/config/')) {
        const section = url.pathname.slice('/api/config/'.length);
        if (!['generation', 'speech', 'playback', 'application'].includes(section)) {
          json(404, { error: 'Not found.' });
          return;
        }
        json(200, runtime.saveSettings(section as SettingsSection, body));
        return;
      }
      if (url.pathname === '/api/twitch/disconnect') {
        runtime.disconnectTwitch();
        json(200, snapshot());
        return;
      }
      const result = await routeCommand(url.pathname, body, session);
      const value =
        result.body && typeof result.body === 'object' && 'queue' in result.body
          ? { ...runtime.snapshot(), ...result.body }
          : result.body;
      json(result.status, value);
    } catch (error) {
      if (!response.headersSent)
        json(error instanceof RequestInputError ? 409 : 500, {
          error:
            error instanceof RequestInputError
              ? error.message
              : 'Server could not complete the request.',
        });
      else response.end();
    }
  }
  return server;
}
