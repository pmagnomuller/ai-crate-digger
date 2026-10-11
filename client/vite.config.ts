import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const clientDir = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = 'http://127.0.0.1:3000';

export default defineConfig({
  root: clientDir,
  server: {
    port: 5173,
    proxy: {
      '/chat': { target: apiTarget, changeOrigin: true },
      '/auth': { target: apiTarget, changeOrigin: true },
      '/taste': { target: apiTarget, changeOrigin: true },
      '/recommendations': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
