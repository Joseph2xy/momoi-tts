import { ensureFrontend } from './frontend.ts';

try {
  await ensureFrontend();
  await import('../../src/app/main.ts');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The app could not start.');
  process.exitCode = 1;
}
