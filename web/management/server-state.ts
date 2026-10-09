import { QueryClient, QueryObserver } from '@tanstack/query-core';
import type { PlaybackState } from '../../src/shared/protocol.ts';

export interface ServerView {
  state: PlaybackState | null;
  connected: boolean;
  pending: boolean;
  message: string;
}

// Only public GET state enters the cache. Commands (including secret replacements)
// are serialized, never cached/retried, and cancel polling before they write.
export function createServerState(
  onChange: (view: ServerView) => void,
  fetcher: typeof fetch = fetch,
) {
  const client = new QueryClient();
  const key = ['app-state'] as const;
  const view: ServerView = { state: null, connected: false, pending: false, message: '' };
  let running = false;
  let activeCommand: AbortController | null = null;
  const options = (enabled: boolean) => ({
    queryKey: key,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<PlaybackState> => {
      const response = await fetcher('/api/state', {
        signal: AbortSignal.any([signal, AbortSignal.timeout(2000)]),
      });
      if (!response.ok) throw new Error('Server offline');
      return response.json();
    },
    enabled,
    retry: false,
    networkMode: 'always' as const,
    refetchInterval: 500,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });
  const observer = new QueryObserver(client, options(false));
  const notify = () => {
    if (running) onChange({ ...view });
  };
  observer.subscribe((result) => {
    if (result.data) view.state = result.data;
    if (result.status === 'error') view.connected = false;
    else if (result.status === 'success') view.connected = true;
    notify();
  });
  return {
    start() {
      running = true;
      observer.setOptions(options(!view.pending));
      notify();
    },
    suspend() {
      running = false;
      observer.setOptions(options(false));
      void client.cancelQueries({ queryKey: key });
      activeCommand?.abort();
    },
    async command<T = PlaybackState>(route: string, body: unknown, timeout = 5000): Promise<T> {
      if (!running || view.pending || !view.connected)
        throw new Error('Wait for the current action or reconnect to the server.');
      view.pending = true;
      observer.setOptions(options(false));
      notify();
      const controller = new AbortController();
      activeCommand = controller;
      try {
        await client.cancelQueries({ queryKey: key });
        const response = await fetcher(route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'The action could not be completed.');
        view.message = '';
        if (result.queue) client.setQueryData(key, result as PlaybackState);
        return result as T;
      } catch (error) {
        if (
          error instanceof Error &&
          ['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
        )
          view.connected = false;
        const text =
          error instanceof Error &&
          !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
            ? error.message
            : 'Connection interrupted. Check the current state before trying again.';
        view.message = text;
        throw new Error(text);
      } finally {
        activeCommand = null;
        view.pending = false;
        observer.setOptions(options(running));
        notify();
      }
    },
  };
}
