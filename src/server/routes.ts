import type { PlaybackSession } from '../playback/session.ts';

interface ApiResponse {
  status: number;
  body: unknown;
}
export async function routeCommand(
  path: string,
  body: Record<string, unknown>,
  session: PlaybackSession,
): Promise<ApiResponse> {
  const result = (status: number, body: unknown): ApiResponse => ({ status, body });
  const error = (status: number, message: string) => result(status, { error: message });
  const snapshot = () => result(200, session.snapshot());
  const queue = session.queue;
  const validSession =
    typeof body.session === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(body.session);
  if (path === '/api/player/poll') {
    if (!validSession) return error(400, 'Invalid player session.');
    let progress: { id: string; elapsedSeconds: number; durationSeconds: number } | undefined;
    if (body.progress !== undefined) {
      const value = body.progress as Record<string, unknown> | null;
      if (
        !value ||
        typeof value !== 'object' ||
        typeof value.id !== 'string' ||
        typeof value.elapsedSeconds !== 'number' ||
        !Number.isFinite(value.elapsedSeconds) ||
        typeof value.durationSeconds !== 'number' ||
        !Number.isFinite(value.durationSeconds) ||
        value.durationSeconds <= 0 ||
        value.durationSeconds > 7200 ||
        value.elapsedSeconds < 0 ||
        value.elapsedSeconds > value.durationSeconds + 1
      )
        return error(400, 'Invalid playback progress.');
      progress = {
        id: value.id,
        elapsedSeconds: value.elapsedSeconds,
        durationSeconds: value.durationSeconds,
      };
    }
    return result(200, session.poll(body.session as string, progress));
  }
  if (path === '/api/player/release') {
    if (!validSession) return error(400, 'Invalid player session.');
    session.release(body.session);
    return result(200, { ok: true });
  }
  if (path === '/api/player/event') {
    const outcome = session.playbackEvent(body.session, body.id, body.event);
    return outcome === 'stale'
      ? error(409, 'Playback event is no longer current.')
      : outcome === 'invalid'
        ? error(400, 'Invalid playback event.')
        : result(200, { ok: true });
  }
  if (path === '/api/requests') {
    queue.submit(body.viewer, body.question, body.eventId);
    return snapshot();
  }
  if (path === '/api/requests/remove') {
    queue.remove(body.id);
    return snapshot();
  }
  if (path === '/api/requests/replay') {
    queue.replay(body.id);
    return snapshot();
  }
  if (path === '/api/playback/pause') {
    session.pause();
    return snapshot();
  }
  if (path === '/api/playback/resume') {
    session.resume();
    return snapshot();
  }
  if (path === '/api/queue/skip') {
    session.stop('Stopped. Replay manually to play again.');
    queue.skip();
    return snapshot();
  }
  if (path === '/api/queue/clear') {
    queue.clear();
    return snapshot();
  }
  if (path === '/api/queue/stop') {
    session.stop('Stopped and cleared.');
    queue.stopAndClear();
    return snapshot();
  }
  if (path === '/api/settings') {
    if (
      typeof body.muted !== 'boolean' ||
      typeof body.volume !== 'number' ||
      !Number.isFinite(body.volume) ||
      body.volume < 0 ||
      body.volume > 1
    )
      return error(400, 'Invalid audio settings.');
    session.state.muted = body.muted;
    session.state.volume = body.volume;
    return snapshot();
  }
  return error(404, 'Not found.');
}
