import { resolve } from 'node:path';
import { openDatabase } from '@budget/db';
import { bankSyncFromEnv } from '../../server/src/bank-sync/config';
import { dropboxConfigured, DropboxPayslipSource } from '../../server/src/payslips/dropbox';
import { PayslipScanner } from '../../server/src/payslips/scanner';
import { PayslipIntakeService } from '../../server/src/payslips/service';
import { receiptDirectory } from '../../server/src/receipts/files';

// Started only after the web process applied migrations, on the same Fly machine/volume.
const opened = openDatabase(
  process.env['DATABASE_PATH'] ?? resolve(process.env['DATA_DIR'] ?? 'data', 'budget.sqlite'),
);
const sync = bankSyncFromEnv(opened.db);
const payslips = dropboxConfigured()
  ? new PayslipScanner(
      opened.db,
      new DropboxPayslipSource(),
      new PayslipIntakeService(opened.db, receiptDirectory(opened.sqlite.name)),
    )
  : null;
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    try {
      await sync?.tick();
    } catch {
      console.error('Bank worker: run unavailable; retry on next tick.');
    }
    try {
      await payslips?.tick();
    } catch {
      console.error('Payslip worker: run unavailable; retry on next tick.');
    }
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
