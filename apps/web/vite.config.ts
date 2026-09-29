import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
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
