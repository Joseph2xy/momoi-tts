import { createAppServer } from './server.ts';
import { SettingsStore } from './settings.ts';
import { startRestart } from './setup-actions.ts';
const args = process.argv.slice(2);
if (args.some((arg) => !['--demo', '--no-open'].includes(arg)))
  throw new Error('Unknown app option.');
const store = new SettingsStore({ demo: args.includes('--demo') });
const port = store.port;
const server = createAppServer({
  pipeline: store.pipeline(),
  management: store,
  settings: store.queueSettings(),
  configurationProof: (nonce) => store.proof(nonce),
  onQuit: shutdown,
  onRestart: () => {
    startRestart(port, store.demo, args.includes('--no-open'));
    shutdown();
  },
});
server.once('error', () => {
  console.error('Cannot start the app. Check whether the port is already in use.');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local management: http://127.0.0.1:${port}/`);
  console.log(
    store.demo
      ? 'Demo: synthetic dialogue/audio. Twitch is disabled.'
      : 'Local management ready. Provider use requires explicit tests or submitted questions. Twitch integration is deferred.',
  );
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  server.closeAllConnections();
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
