import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Explicit build-only allowlist: runtime requests can never widen the cache. */
export function pwaShell(): Plugin {
  return {
    name: 'budget-static-pwa',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const publicFiles = [
        'theme-init.js',
        'manifest.webmanifest',
        'offline.html',
        'offline.css',
        'icons/budget.svg',
        'icons/budget-192.png',
        'icons/budget-512.png',
      ];
      const files = Object.keys(bundle).filter(
        (name) => name === 'index.html' || name.startsWith('assets/'),
      );
      const hash = createHash('sha256');
      for (const name of files.sort()) {
        const item = bundle[name]!;
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const name of publicFiles)
        hash.update(readFileSync(new URL(`./public/${name}`, import.meta.url)));
      const template = readFileSync(new URL('./pwa/service-worker.js', import.meta.url), 'utf8');
      hash.update(template);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replace(/['"]__VERSION__['"]/, JSON.stringify(hash.digest('hex').slice(0, 16)))
          .replace(
            /['"]__PRECACHE__['"]/,
            JSON.stringify([...files, ...publicFiles].map((name) => `/${name}`)),
          ),
      });
    },
  };
}
