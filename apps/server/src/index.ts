import { mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, resolve } from 'node:path';
import { ensureDefaultRules, migrateDatabase, openDatabase } from '@budget/db';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { authConfigFromEnv } from './auth/config';
import { backupConfigFromEnv, BackupScheduler } from './backup/backup';
import { createAuth } from './auth/routes';
import { ImportJobs } from './imports/jobs';
import { AuthStore } from './auth/store';
import { createMarketSources, marketModeFromEnv, startDailyMarketTimer } from './market';
import { cryptoReadSource } from './sources/crypto-api';
import { refreshReadSourceIfDue } from './sources/refresh';
import { todayFromEnv } from './today';

const port = Number(process.env['PORT'] ?? 3000);
const webDir = resolve(process.env['WEB_DIR'] ?? resolve(import.meta.dirname, '../../web/dist'));

// SQLite lives in DATA_DIR (the Fly volume in production). Migrations run at start.
const dataDir = resolve(process.env['DATA_DIR'] ?? 'data');
const databasePath = resolve(process.env['DATABASE_PATH'] ?? resolve(dataDir, 'budget.sqlite'));
const migrationsDir =
  process.env['BUDGET_MIGRATIONS_DIR'] ??
  resolve(import.meta.dirname, '../../../packages/db/drizzle');

mkdirSync(dirname(databasePath), { recursive: true });
const { db, sqlite, close: closeDatabase } = openDatabase(databasePath);
migrateDatabase(db, migrationsDir);
ensureDefaultRules(db);

const config = authConfigFromEnv();
if (!config.setupToken && new AuthStore(db).activePasskeyCount() === 0) {
  console.warn(
    'No passkey is registered and BUDGET_SETUP_TOKEN is not set: nobody can log in yet.',
  );
}
const auth = createAuth({ store: new AuthStore(db), config });

// Audit housekeeping: merged rejection counters are written back every minute; rows older than
// 180 days go at start and once a day. Timers are unref'd so they never keep the process alive.
const pruned = auth.events.prune(new Date());
if (pruned > 0)
  console.log(`Pruned ${pruned} audit rows older than ${auth.events.retentionDays} days`);
const housekeeping = [
  setInterval(() => auth.events.flush(new Date()), 60_000),
  setInterval(() => auth.events.prune(new Date()), 86_400_000),
];
for (const timer of housekeeping) timer.unref();

// BUDGET_TODAY pins the ledger's "today" (test aid, refused in production).
const today = todayFromEnv();

// Heavy import tasks (YNAB dry run, commit, revert) run in a worker thread on its own connection.
const importJobs = new ImportJobs(db);

// The debug endpoint is opt-in, read-only (seed check) and behind the session guard.
const app = createApp({
  webDir,
  buildRevision: process.env['BUDGET_BUILD_REVISION'],
  auth,
  ledger: { db, jobs: importJobs, ...(today ? { today } : {}) },
  database: process.env['BUDGET_DEBUG_API'] === '1' ? db : undefined,
});

// Nightly prices (previous day's close) and ECB rates at 02:30 Vienna, plus a catch-up after a
// missed night; in-process until the P4 worker owns scheduling (docs/market-data.md).
if (process.env['BUDGET_MARKET_DAILY'] === '1') {
  const mode = marketModeFromEnv();
  startDailyMarketTimer({
    db,
    sources: createMarketSources(db, mode),
    catchUpOnStart: true,
    onTick: (now) => refreshReadSourceIfDue(db, cryptoReadSource(), now),
  });
  console.log(`Daily market refresh on (${mode} sources)`);
}

// Nightly age-encrypted copy to the bucket (docs/ops.md section 8). Checked every 15 minutes,
// first 2 minutes after start; failures are logged and go to the Posteingang, never stop the app.
const backupConfig = backupConfigFromEnv();
const backupTimers: NodeJS.Timeout[] = [];
if (backupConfig) {
  const scheduler = new BackupScheduler({ sqlite, db, config: backupConfig });
  const tick = () => void scheduler.tick();
  scheduler.init().then(
    () => console.log(`Encrypted backup on (${backupConfig.recipients.length} recipient(s))`),
    (error: unknown) =>
      console.error(
        `Encrypted backup: listing the bucket failed (${error instanceof Error ? error.message : String(error)}); will retry`,
      ),
  );
  backupTimers.push(setTimeout(tick, 2 * 60_000), setInterval(tick, 15 * 60_000));
  for (const timer of backupTimers) timer.unref();
} else {
  console.warn('Encrypted backup is off (BUDGET_BACKUP_RECIPIENT not set).');
}

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
  for (const timer of backupTimers) clearTimeout(timer);
  console.log(`${signal} received, closing the server and the database`);
  // Force-close after 10 s so a stuck connection cannot delay the stop past Fly's kill_timeout.
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  for (const timer of housekeeping) clearInterval(timer);
  // A running import task is stopped; its transaction was not committed, so nothing of it stays.
  void importJobs.terminate();
  server.close(() => {
    auth.events.flush(new Date());
    closeDatabase();
    process.exit(0);
  });
  (server as Partial<Server>).closeIdleConnections?.();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
