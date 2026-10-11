import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./web/management/', import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL('./.generated/web/', import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        control: fileURLToPath(new URL('./web/index.html', import.meta.url)),
        player: fileURLToPath(new URL('./web/player.html', import.meta.url)),
      },
    },
  },
});
