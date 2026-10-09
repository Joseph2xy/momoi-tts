import type { PlaybackState } from '../../src/shared/protocol.ts';
import { get } from '../shared/dom.ts';

export function bindPlaybackControls(
  command: (route: string, body: unknown) => Promise<unknown>,
  current: () => PlaybackState | null,
) {
  get('pause').addEventListener(
    'click',
    () =>
      void command(
        current()?.queue?.paused ? '/api/playback/resume' : '/api/playback/pause',
        {},
      ).catch(() => {}),
  );
  get('skip').addEventListener('click', () => void command('/api/queue/skip', {}).catch(() => {}));
  get('clear').addEventListener(
    'click',
    () => void command('/api/queue/clear', {}).catch(() => {}),
  );
  get('stop-clear').addEventListener(
    'click',
    () => void command('/api/queue/stop', {}).catch(() => {}),
  );
  get('mute').addEventListener('click', () => {
    const state = current();
    if (state)
      void command('/api/settings', { muted: !state.muted, volume: state.volume }).catch(() => {});
  });
  get('volume').addEventListener(
    'input',
    () => (get('volume-value').textContent = `${get<HTMLInputElement>('volume').value}%`),
  );
  get('volume').addEventListener('change', () => {
    const state = current();
    if (state)
      void command('/api/settings', {
        muted: state.muted,
        volume: Number(get<HTMLInputElement>('volume').value) / 100,
      }).catch(() => {});
  });
}
