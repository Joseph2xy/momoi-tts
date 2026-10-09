import { AppRuntime, type RuntimeOptions } from './runtime.ts';
import { createHttpServer } from '../server/server.ts';

export function createAppServer(options: RuntimeOptions = {}) {
  const runtime = new AppRuntime(options);
  const server = createHttpServer(runtime);
  server.once('close', () => runtime.close());
  return server;
}
