// Development entry (`npm run dev`), never part of the production bundle (esbuild builds index.ts).
// It fills in the settings a local browser needs, then starts the normal server:
//  - origin/RP id for http://localhost:5173: the browser talks to Vite, which proxies /api to this
//    server, so passkeys and the CSRF origin check must expect the Vite origin, not port 3000;
//  - the same database file as `npm run db:seed` (data/dev.sqlite);
//  - a random one-time setup token, printed here, for the first passkey.
// Values from a `.env` file in the repository root (see .env.example) and from the real environment
// win over these defaults.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { devDatabasePath } from '@budget/db';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('dev.ts is for local development only; run the built server in production.');
}

const envFile = resolve(import.meta.dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env['BUDGET_ORIGIN'] ??= 'http://localhost:5173';
process.env['DATABASE_PATH'] ??= devDatabasePath();
if (!process.env['BUDGET_SETUP_TOKEN']) {
  process.env['BUDGET_SETUP_TOKEN'] = randomBytes(18).toString('base64url');
  console.log(
    `Dev setup token (only needed until the first passkey exists): ${process.env['BUDGET_SETUP_TOKEN']}`,
  );
}
console.log(`Open ${process.env['BUDGET_ORIGIN']} (Vite), not the API port.`);

await import('./index');
