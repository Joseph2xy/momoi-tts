import type { PlaybackState, ManagementState, SettingsSection } from '../../src/shared/protocol.ts';
import { get, esc } from '../shared/dom.ts';

export function createSettings(
  command: (route: string, body: unknown) => Promise<PlaybackState>,
  render: (state: PlaybackState) => void,
  route: (page: string, section?: string) => void,
) {
  let initialized = false;
  let lastSettingsRevision = -1;
  const dirty = new Set<SettingsSection>();
  const saved = new Set<SettingsSection>();
  const edits = new Map<SettingsSection, number>();
  const forms = () => [...document.querySelectorAll<HTMLFormElement>('form[data-section]')];
  function feedback(section: string, text: string) {
    const node = document.querySelector<HTMLElement>(`[data-feedback="${section}"]`);
    if (node) node.textContent = text;
  }
  function fill(section: SettingsSection, m: ManagementState) {
    if (section === 'generation') {
      get<HTMLSelectElement>('provider').value = m.generation.provider;
      get<HTMLInputElement>('model').value = m.generation.model;
      get<HTMLInputElement>('tokens').value = String(m.generation.maxTokens);
      get<HTMLInputElement>('generation-key').value = '';
      providerFields();
    } else if (section === 'speech') get<HTMLInputElement>('speech-key').value = '';
    else if (section === 'characters') {
      get('voices').innerHTML = m.characters
        .map(
          (p) =>
            `<label class="field" for="voice-${esc(p.id)}"><span>${esc(p.name)} — ${p.voiceConfigured ? 'Voice configured' : 'Voice not configured'}</span><input id="voice-${esc(p.id)}" data-character="${esc(p.id)}" autocomplete="off" placeholder="${p.voiceConfigured ? 'Leave blank to keep assigned voice' : '32-character voice ID'}"></label>`,
        )
        .join('');
    } else if (section === 'playback')
      get<HTMLInputElement>('default-volume').value = String(m.volume);
  }
  function providerFields() {
    const provider = get<HTMLSelectElement>('provider').value;
    get('openrouter-fields').hidden = provider !== 'openrouter';
    get('codex-fields').hidden = provider !== 'codex';
    get('generation-check').hidden = provider !== 'openrouter';
  }
  forms().forEach((form) => {
    const section = form.dataset.section as SettingsSection;
    form.addEventListener('input', () => {
      dirty.add(section);
      edits.set(section, (edits.get(section) ?? 0) + 1);
      const check = document.querySelector(`[data-check-result="${section}"]`);
      if (check) check.textContent = '';
      feedback(section, 'Unsaved changes');
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let body: Record<string, unknown>;
      if (section === 'generation')
        body = {
          provider: get<HTMLSelectElement>('provider').value,
          model: get<HTMLInputElement>('model').value,
          key: get<HTMLInputElement>('generation-key').value,
          maxTokens: Number(get<HTMLInputElement>('tokens').value),
        };
      else if (section === 'speech') body = { key: get<HTMLInputElement>('speech-key').value };
      else if (section === 'characters')
        body = {
          voices: Object.fromEntries(
            [...get('voices').querySelectorAll<HTMLInputElement>('input[data-character]')].map(
              (n) => [n.dataset.character!, n.value],
            ),
          ),
        };
      else body = { volume: Number(get<HTMLInputElement>('default-volume').value) };
      const submittedEdit = edits.get(section);
      void command(`/api/config/${section}`, body)
        .then((result) => {
          saved.add(section);
          const check = document.querySelector(`[data-check-result="${section}"]`);
          if (check) check.textContent = '';
          if (edits.get(section) === submittedEdit) {
            dirty.delete(section);
            if (result.management) fill(section, result.management);
          }
          render(result);
        })
        .catch((error) => {
          if (edits.get(section) === submittedEdit) feedback(section, error.message);
        });
    });
  });
  get('provider').addEventListener('change', providerFields);
  window.addEventListener('beforeunload', (event) => {
    if (dirty.size) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  return {
    discard(section: SettingsSection, management: ManagementState) {
      edits.set(section, (edits.get(section) ?? 0) + 1);
      dirty.delete(section);
      fill(section, management);
      feedback(section, 'Changes discarded');
    },
    refreshCharacters(management: ManagementState) {
      if (!dirty.has('characters')) fill('characters', management);
    },
    render(next: PlaybackState) {
      const q = next.queue;
      const m = next.management;
      if (!m) return;
      if (lastSettingsRevision !== m.revision) {
        for (const form of forms()) {
          const section = form.dataset.section as SettingsSection;
          if (!dirty.has(section)) fill(section, m);
        }
        lastSettingsRevision = m.revision;
      }
      if (!initialized) {
        initialized = true;
        forms().forEach((f) => fill(f.dataset.section as SettingsSection, m));
        route(m.setupSeen ? 'activity' : 'setup');
        if (!m.setupSeen)
          void command('/api/config/application', { setupSeen: true }).catch(() => {});
      }
      get('generation-status').textContent =
        `${m.generation.ready ? 'Configured' : 'Not configured'}${m.generation.provider === 'openrouter' ? ' · Key ' + (m.generation.keyConfigured ? 'configured' : 'not configured') : ''}`;
      get('speech-status').textContent =
        `Key ${m.speech.keyConfigured ? 'configured' : 'not configured'}`;
      get('overrides').textContent = m.overrides.length
        ? `Environment overrides: ${m.overrides.join(', ')}. Saving a file value does not replace an environment override.`
        : '';
      get('readiness').textContent =
        q?.mode === 'demo'
          ? ''
          : m.localReady
            ? ''
            : 'Finish provider and voice configuration in Settings to run full local response tests.';
      get('diagnostics').textContent = Object.values(m.errors).filter(Boolean).join(' ');
      for (const f of forms()) {
        const section = f.dataset.section as SettingsSection;
        if (!dirty.has(section) && saved.has(section))
          feedback(
            section,
            m.overrides.some((name) =>
              section === 'generation'
                ? name.startsWith('OPENROUTER_') || name === 'TYRONE_TEXT_PROVIDER'
                : section === 'speech'
                  ? name === 'FISH_API_KEY'
                  : section === 'characters'
                    ? name.endsWith('VOICE_ID')
                    : false,
            )
              ? 'Saved locally — environment overrides remain active'
              : m.pending && ['generation', 'speech', 'characters'].includes(section)
                ? 'Saved — applies after the current request'
                : section === 'playback'
                  ? 'Saved — default for the next launch'
                  : 'Saved and active',
          );
      }
      get('checklist').innerHTML = [
        ['Generation', m.generation.ready, 'generation'],
        ['Speech', m.speech.ready, 'speech'],
        [
          'Character voices',
          m.characters.length > 0 && m.characters.every((p) => p.voiceConfigured),
          'characters',
        ],
        ['Playback preferences', true, 'playback-settings'],
        ['Twitch and reward — later phase', false, 'connections'],
      ]
        .map(
          ([label, ready, target]) =>
            `<button class="checklist-item" data-target="${target}">${label}<span>${ready ? 'Configured locally' : target === 'connections' ? 'Deferred' : 'Needs configuration'}</span></button>`,
        )
        .join('');
    },
  };
}
