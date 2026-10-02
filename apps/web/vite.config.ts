import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { pwaShell } from './pwa-plugin';

const server = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss(), pwaShell()],
  server: {
    port: 5173,
    proxy: { '/health': server, '/api': server },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Strict CSP: never inline assets as data: URIs into scripts/styles.
    assetsInlineLimit: 0,
  },
});
