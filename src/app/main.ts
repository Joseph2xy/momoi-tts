import { configuredPipeline } from './provider-actions.ts';
import { createAppServer } from './server.ts';
import { SettingsStore } from './settings.ts';
import { startRestart } from './restart.ts';
import { launchMode } from './launch-mode.ts';
const args = process.argv.slice(2);
launchMode(args);
const store = new SettingsStore();
const port = store.port;
const server = createAppServer({
  pipeline: configuredPipeline(store),
  management: store,
  settings: store.queueSettings(),
  configurationProof: (nonce) => store.proof(nonce),
  onQuit: shutdown,
  onRestart: () => {
    startRestart(port, args.includes('--no-open'));
    shutdown();
  },
});
server.once('error', () => {
  console.error('Cannot start the app. Check whether the port is already in use.');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Local management: http://127.0.0.1:${port}/`);
  console.log(`OBS audio source: http://127.0.0.1:${port}/player`);
  console.log(
    'Local management ready. Twitch connects only after an explicit saved connection choice. Keep the OBS audio source active and turn replies on when ready.',
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
