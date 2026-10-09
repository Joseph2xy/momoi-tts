import type { PlaybackState, RequestEntry } from '../../src/shared/protocol.ts';
import { get, esc } from '../shared/dom.ts';

export const statusLabels: Record<string, string> = {
  waiting: 'Waiting',
  generating: 'Writing reply',
  synthesizing: 'Creating speech',
  ready: 'Ready',
  playing: 'Speaking',
  blocked: 'Audio blocked',
  completed: 'Answered',
  skipped: 'Skipped',
  removed: 'Removed',
  expired: 'Expired',
  failed: 'Failed',
};
export function createActivityFeed() {
  let feedSignature = '';
  function row(entry: RequestEntry, kind: 'current' | 'waiting' | 'past', paused: boolean) {
    const line = `<span class="${entry.dialogue ? 'chevron' : 'chevron-space'}" aria-hidden="true"></span><span class="character">${esc(entry.characterName)}</span><strong class="viewer">${esc(entry.viewer)}</strong><span class="question">${esc(entry.question)}</span><span class="status">${paused && kind === 'current' ? 'Held' : statusLabels[entry.status] || esc(entry.status)}</span>`;
    return `<article class="request ${kind}">${entry.dialogue ? `<details data-request-id="${entry.id}"><summary class="request-line">${line}</summary><div class="expanded"><p>${esc(entry.dialogue)}</p></div></details>` : `<div class="request-line">${line}</div>`}${entry.error ? `<p class="error request-error">${esc(entry.error)}</p>` : ''}${kind === 'waiting' ? `<button class="remove" data-remove="${entry.id}" aria-label="Remove question from ${esc(entry.viewer)}">×</button>` : ''}</article>`;
  }
  return function renderFeed(next: PlaybackState) {
    const q = next.queue;
    if (!q) return;
    const signature = JSON.stringify([q.requests, q.activeId, q.waitingIds, q.paused]);
    if (signature === feedSignature) return;
    feedSignature = signature;
    const expanded = new Set(
      [...get('feed').querySelectorAll<HTMLDetailsElement>('details[open]')].map(
        (n) => n.dataset.requestId,
      ),
    );
    const current = q.requests.find((r) => r.id === q.activeId);
    const waiting = q.waitingIds.flatMap((id) => q.requests.filter((r) => r.id === id));
    const history = q.requests
      .filter((r) => r.id !== q.activeId && !q.waitingIds.includes(r.id))
      .reverse();
    get('feed').innerHTML =
      `${current ? row(current, 'current', q.paused) : `<p class="empty">${q.paused ? 'Queue paused. Resume when ready.' : 'Waiting for questions.'}</p>`}${waiting.map((r) => row(r, 'waiting', q.paused)).join('')}${history.length ? '<h2 class="history-label">Earlier</h2>' + history.map((r) => row(r, 'past', q.paused)).join('') : ''}`;
    get('feed')
      .querySelectorAll<HTMLDetailsElement>('details')
      .forEach((n) => (n.open = expanded.has(n.dataset.requestId)));
  };
}
