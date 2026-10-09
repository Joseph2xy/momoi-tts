import { createAppServer } from './server.ts';
import { demoPipeline, livePipeline } from './pipeline.ts';
import { configurationProof, readConfig } from './config.ts';

let config: ReturnType<typeof readConfig>;
try {
  config = readConfig();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid app configuration.');
  process.exit(1);
}
const pipeline = config.demo
  ? demoPipeline(config.characters)
  : config.fish
    ? livePipeline(config.fish.apiKey, config.characters, config.generation!)
    : undefined;
const server = createAppServer({
  pipeline,
  settings: config.settings,
  twitch: config.twitch,
  onQuit: shutdown,
  configurationProof: (nonce) => configurationProof(config, nonce),
});
server.once('error', () => {
  console.error('Cannot start the app. Check whether the port is already in use.');
  process.exitCode = 1;
});
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Streamer controls: http://127.0.0.1:${config.port}/`);
  console.log(`Manual testing (separate tab): http://127.0.0.1:${config.port}/testing`);
  console.log(
    pipeline?.mode === 'live'
      ? `Questions use ${config.generation?.provider === 'openrouter' ? 'OpenRouter with zero-price routing' : 'existing Codex access'} and configured Fish speech. OBS setup is deferred.`
      : pipeline?.mode === 'demo'
        ? 'Demo mode: simulated dialogue and a short test tone. No generation or TTS usage. OBS setup is deferred.'
        : 'Generation is not configured. Add private Fish configuration or use npm run demo.',
  );
  console.log(
    config.twitch
      ? 'Twitch is configured but disconnected. Use Connect Twitch in the controls.'
      : 'Twitch is not configured. Manual input is on the separate testing page.',
  );
});
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  server.closeAllConnections();
  // Twurple retains delivery-deduplication timers after disconnect. Give cleanup
  // and private token writes time to finish, then release the launcher promptly.
  setTimeout(() => process.exit(process.exitCode ?? 0), 2000).unref();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
