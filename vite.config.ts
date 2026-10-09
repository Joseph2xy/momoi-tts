import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('./.generated/web/', import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        control: fileURLToPath(new URL('./web/index.html', import.meta.url)),
        testing: fileURLToPath(new URL('./web/testing.html', import.meta.url)),
      },
    },
  },
});
