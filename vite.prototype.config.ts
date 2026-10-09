import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Throwaway visual review only; the production build does not include this page.
export default defineConfig({
  root: fileURLToPath(new URL('./web/', import.meta.url)),
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web/management/prototype/', import.meta.url)) },
  },
  server: { host: '127.0.0.1', port: 3222, strictPort: true, open: false },
});
