import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { pwaShell } from './pwa-plugin';

/** Hash of the web sources: the cache buster of the persisted read cache. */
function sourceHash(): string {
  const hash = createHash('sha256');
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(entry.name)) hash.update(entry.name).update(readFileSync(path));
    }
  };
  walk(fileURLToPath(new URL('./src', import.meta.url)));
  return hash.digest('hex').slice(0, 12);
}

const server = process.env['VITE_API_TARGET'] ?? 'http://localhost:3000';

export default defineConfig({
  define: { 'import.meta.env.VITE_BUDGET_BUILD': JSON.stringify(sourceHash()) },
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
