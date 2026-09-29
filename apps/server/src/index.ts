import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { migrateDatabase, openDatabase } from '@budget/db';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { authConfigFromEnv } from './auth/config';
import { createAuth } from './auth/routes';
import { AuthStore } from './auth/store';

const port = Number(process.env['PORT'] ?? 3000);
const webDir = resolve(process.env['WEB_DIR'] ?? resolve(import.meta.dirname, '../../web/dist'));

// SQLite lives in DATA_DIR (the Fly volume in production). Migrations run at start.
const dataDir = resolve(process.env['DATA_DIR'] ?? 'data');
const databasePath = resolve(process.env['DATABASE_PATH'] ?? resolve(dataDir, 'budget.sqlite'));
const migrationsDir =
  process.env['BUDGET_MIGRATIONS_DIR'] ??
  resolve(import.meta.dirname, '../../../packages/db/drizzle');

mkdirSync(dirname(databasePath), { recursive: true });
const { db, close: closeDatabase } = openDatabase(databasePath);
migrateDatabase(db, migrationsDir);

const config = authConfigFromEnv();
if (!config.setupToken && new AuthStore(db).activePasskeyCount() === 0) {
  console.warn(
    'No passkey is registered and BUDGET_SETUP_TOKEN is not set: nobody can log in yet.',
  );
}
const auth = createAuth({ store: new AuthStore(db), config });

// The debug endpoint is opt-in, read-only (seed check) and behind the session guard.
const app = createApp({
  webDir,
  auth,
  database: process.env['BUDGET_DEBUG_API'] === '1' ? db : undefined,
});

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(
    `Budget server listening on http://localhost:${info.port} (web: ${webDir}, origin: ${config.origin})`,
  );
});

// Graceful stop. As PID 1 in the container Node ignores SIGTERM unless a handler exists, and under
// Litestream the parent waits for this process to exit before it flushes the last WAL frames.
let stopping = false;
function shutdown(signal: NodeJS.Signals): void {
  if (stopping) return;
  stopping = true;
  console.log(`${signal} received, closing the server and the database`);
  // Force-close after 10 s so a stuck connection cannot delay the stop past Fly's kill_timeout.
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  (server as Partial<Server>).closeIdleConnections?.();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
