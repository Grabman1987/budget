import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  findPayslipIntake,
  getPayslipIntake,
  getPayslipSourceConfig,
  getReceipt,
  replaceParsedPayslip,
  stagePayslip,
  type Db,
} from '@budget/db';
import { parsePayrollDocument, type ParsedPayrollDocument } from '@budget/domain';
import {
  digest,
  RECEIPT_LIMIT,
  receiptMime,
  sanitizedFilename,
  storeReceipt,
  verifyReceiptFile,
} from '../receipts/files';

export async function extractPayslipText(
  bytes: Buffer,
  password: string | undefined,
): Promise<{ text?: string; error?: string }> {
  const built = resolve(import.meta.dirname, 'pdf-thread.js');
  const path = existsSync(built) ? built : resolve(import.meta.dirname, 'pdf-thread.mjs');
  return new Promise((done) => {
    const worker = new Worker(path, {
      workerData: { bytes, password },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    });
    // Library diagnostics may include document content. Never forward them to application logs.
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
    const timer = setTimeout(() => finish({ error: 'limit' }), 20_000);
    worker.once('message', finish);
    worker.once('error', () => finish({ error: 'pdf' }));
    worker.once('exit', () => finish({ error: 'pdf' }));
  });
}
export class PayslipIntakeService {
  constructor(
    readonly db: Db,
    readonly dir: string,
    private readonly password = process.env['PAYSLIP_PDF_PASSWORD'],
  ) {}
  async parse(bytes: Buffer, filename: string): Promise<ParsedPayrollDocument> {
    const result = await extractPayslipText(bytes, this.password);
    if (result.text) {
      try {
        return parsePayrollDocument(result.text, filename, getPayslipSourceConfig(this.db));
      } catch {
        return {
          documentType: 'unknown',
          periodSource: null,
          payoutDate: null,
          draft: null,
          differenceCents: null,
          warnings: ['PDF enthält nicht unterstützte Werte. Bitte manuell prüfen.'],
        };
      }
    }
    return {
      documentType: 'unknown',
      periodSource: null,
      payoutDate: null,
      draft: null,
      differenceCents: null,
      warnings: [
        result.error === 'password'
          ? this.password
            ? 'PDF-Passwort falsch. Bitte Server-Einstellung prüfen und erneut auswerten.'
            : 'PDF-Passwort fehlt. Bitte am Server setzen und erneut auswerten.'
          : 'PDF konnte nicht ausgewertet werden (Format oder Verarbeitungslimit).',
      ],
    };
  }
  async ingest(
    bytes: Buffer,
    filename: string,
    source: 'manual' | 'dropbox',
    contentHash?: string,
  ) {
    if (!bytes.length || bytes.length > RECEIPT_LIMIT || receiptMime(bytes) !== 'application/pdf')
      throw new RangeError('Bitte eine PDF-Datei bis 15 MB wählen.');
    const sha256 = digest(bytes);
    const old = findPayslipIntake(this.db, sha256, contentHash);
    if (old && !old.deletedAt) return { id: old.id, duplicate: true, groupId: null };
    const name = sanitizedFilename(filename);
    const parsed = await this.parse(bytes, name);
    await storeReceipt(this.dir, bytes); // Original encrypted bytes only; never persist plaintext.
    return stagePayslip(
      this.db,
      {
        sha256,
        ...(contentHash ? { contentHash } : {}),
        source,
        sizeBytes: bytes.length,
        filename: name,
        parsed,
      },
      { actor: source === 'manual' ? 'owner' : 'system' },
    );
  }
  async retry(id: string) {
    const row = getPayslipIntake(this.db, id),
      receipt = getReceipt(this.db, row.receiptId);
    const file = await verifyReceiptFile(this.dir, row.sha256, receipt.sizeBytes);
    return replaceParsedPayslip(
      this.db,
      id,
      await this.parse(await readFile(file), receipt.originalFilename ?? ''),
      { actor: 'owner' },
    );
  }
}
