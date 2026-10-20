import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { parseStatementText, unavailableStatement, type StatementProposal } from '@budget/domain';
import { digest, RECEIPT_LIMIT, verifyReceiptFile } from '../receipts/files';
/** Reuse the existing PDF worker, without loading a parent CLI's TypeScript hooks in its heap. */
function extractStatementText(
  bytes: Buffer,
  password: string | undefined,
): Promise<{ text?: string; error?: string }> {
  const built = resolve(import.meta.dirname, 'pdf-thread.js');
  const path = existsSync(built)
    ? built
    : resolve(import.meta.dirname, '../payslips/pdf-thread.mjs');
  return new Promise((done) => {
    const worker = new Worker(path, {
      workerData: { bytes, password },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    });
    worker.stdout?.resume();
    worker.stderr?.resume();
    let finished = false;
    const finish = (result: { text?: string; error?: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      void worker.terminate();
      done(result);
    };
    const timer = setTimeout(() => finish({ error: 'limit' }), 20000);
    worker.once('message', finish);
    worker.once('error', () => finish({ error: 'pdf' }));
    worker.once('exit', () => finish({ error: 'pdf' }));
  });
}
/** Request-local password only; no remembered payroll password, DB, network or document logging. */
export async function extractStatement(
  bytes: Buffer,
  password?: string,
): Promise<StatementProposal> {
  if (bytes.length > RECEIPT_LIMIT || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new Error('invalid_pdf');
  const sha = digest(bytes),
    result = await extractStatementText(bytes, password);
  if (result.error || result.text === undefined || result.text.length > 200000)
    return unavailableStatement(
      sha,
      result.error === 'password' ? 'password_required' : 'unreadable_or_limit',
    );
  return parseStatementText(result.text, sha);
}
export async function readStatementSource(dir: string, sha: string, size: number) {
  const bytes = await readFile(await verifyReceiptFile(dir, sha, size));
  if (bytes.length !== size || digest(bytes) !== sha) throw new Error('source_unavailable');
  return bytes;
}
