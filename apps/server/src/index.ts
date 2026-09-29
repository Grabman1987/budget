import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';

const port = Number(process.env['PORT'] ?? 3000);
const webDir = resolve(process.env['WEB_DIR'] ?? resolve(import.meta.dirname, '../../web/dist'));

const app = createApp({ webDir });

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`Budget server listening on http://localhost:${info.port} (web: ${webDir})`);
});
