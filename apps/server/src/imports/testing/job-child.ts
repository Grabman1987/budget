import { openDatabase } from '@budget/db';
import { ImportJobs } from '../jobs';

/**
 * Test aid for `jobs.test.ts`: a "server" process that starts a commit of a staged run in the
 * import worker and holds it right before the transaction commits, then tells the parent, which
 * kills this process (a crash or restart in the middle of the job).
 *
 * argv: <database file> <run id>
 */
const [path, runId] = process.argv.slice(2) as [string, string];
const { db } = openDatabase(path);
const jobs = new ImportJobs(db, { holdMs: 120_000 });
const job = jobs.start({ kind: 'commit', runId, deleteMissing: false }, '2026-09-29');
const timer = setInterval(() => {
  const now = jobs.get(job.id);
  if (now?.step === 'commit') {
    clearInterval(timer);
    process.send?.('holding');
  }
  if (now?.state !== 'running') {
    clearInterval(timer);
    process.send?.(`ended:${now?.state}`);
  }
}, 20);
