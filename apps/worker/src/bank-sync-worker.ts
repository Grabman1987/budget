import { resolve } from 'node:path';
import { openDatabase } from '@budget/db';
import { bankSyncFromEnv } from '../../server/src/bank-sync/config';

// Started only after the web process applied migrations, on the same Fly machine/volume.
const opened = openDatabase(
  process.env['DATABASE_PATH'] ?? resolve(process.env['DATA_DIR'] ?? 'data', 'budget.sqlite'),
);
const sync = bankSyncFromEnv(opened.db);
let running = false;
async function tick() {
  if (!sync || running) return;
  running = true;
  try {
    await sync.tick();
  } catch {
    console.error('Bank worker: run unavailable; retry on next tick.');
  } finally {
    running = false;
  }
}
void tick();
const timer = setInterval(() => void tick(), 30_000);
function stop() {
  clearInterval(timer);
  opened.close();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('disconnect', stop);
