import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import {
  findPayslipIntake,
  getPayslipIntake,
  getPayslipSourceConfig,
  getReceipt,
  payslipScope,
  payslipScopeReason,
  replaceParsedPayslip,
  stagePayslip,
  type Db,
} from '@budget/db';
import { parsePayrollDocument, type ParsedPayrollDocument } from '@budget/domain';
import {
  dropboxTargetPath,
  dropboxTargetYear,
  dropboxWriteEnabled,
  DropboxPayslipSource,
} from './dropbox';
import { payslipPasswordBox, rememberedPayslipPassword, rememberPayslipPassword } from './password';
import { payslipSourceWarning } from './source-warning';
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
export type PasswordOptions = {
  password?: string | undefined;
  remember?: boolean | undefined;
  /** Dropbox year folder of the file; used only when the document itself shows no period. */
  folderYear?: number | null | undefined;
};
/** 'off': not requested; 'unavailable': BUDGET_PEPPER missing; 'not_opened': did not open the PDF. */
export type PasswordRemember = 'saved' | 'unavailable' | 'not_opened' | 'off';
/** 'off': not attempted (flag unset, not configured, duplicate or fetched from Dropbox). */
export type DropboxCopy = 'saved' | 'failed' | 'off';
const unknownDocument = (warning: string): ParsedPayrollDocument => ({
  documentType: 'unknown',
  periodSource: null,
  payoutDate: null,
  draft: null,
  differenceCents: null,
  warnings: [warning],
});
type Staged = {
  id: string;
  duplicate: boolean;
  groupId: string | null | undefined;
  dropboxCopy: DropboxCopy;
  passwordRemember: PasswordRemember;
};
type Skipped = { skipped: 'before_start' };
export class PayslipIntakeService {
  constructor(
    readonly db: Db,
    readonly dir: string,
    private readonly password = process.env['PAYSLIP_PDF_PASSWORD'],
    /** Write-back target for manual uploads; only present with Dropbox configured and the flag. */
    private readonly dropbox: DropboxPayslipSource | undefined = dropboxWriteEnabled()
      ? new DropboxPayslipSource()
      : undefined,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  /** Order: password sent with this request, remembered app password, server secret, none. */
  private candidates(upload?: string) {
    const list = [upload, rememberedPayslipPassword(this.db), this.password].filter(
      (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
    );
    return list.length ? list : [undefined];
  }
  async parse(bytes: Buffer, filename: string, upload?: string) {
    return (await this.evaluate(bytes, filename, upload)).parsed;
  }
  private async evaluate(
    bytes: Buffer,
    filename: string,
    upload?: string,
  ): Promise<{ parsed: ParsedPayrollDocument; opened: string | undefined }> {
    const candidates = this.candidates(upload);
    let result: { text?: string; error?: string } = { error: 'pdf' },
      opened: string | undefined;
    for (const password of candidates) {
      result = await extractPayslipText(bytes, password);
      if (result.text) {
        opened = password;
        break;
      }
      if (result.error !== 'password') break;
    }
    if (result.text) {
      try {
        return {
          opened,
          parsed: parsePayrollDocument(result.text, filename, getPayslipSourceConfig(this.db)),
        };
      } catch {
        return {
          opened,
          parsed: unknownDocument('PDF enthält nicht unterstützte Werte. Bitte manuell prüfen.'),
        };
      }
    }
    return {
      opened: undefined,
      parsed: unknownDocument(
        result.error === 'password'
          ? candidates.some(Boolean)
            ? 'PDF-Passwort falsch. Bitte Passwort neu eingeben und erneut auswerten.'
            : 'PDF-Passwort fehlt. Bitte Passwort eingeben und erneut auswerten.'
          : 'PDF konnte nicht ausgewertet werden (Format oder Verarbeitungslimit).',
      ),
    };
  }
  /** Remember a typed password only when it demonstrably opened an encrypted PDF. */
  private remember(
    bytes: Buffer,
    opened: string | undefined,
    options: PasswordOptions,
  ): PasswordRemember {
    if (!options.remember || !options.password) return 'off';
    if (!payslipPasswordBox()) return 'unavailable';
    if (opened !== options.password || !bytes.includes('/Encrypt')) return 'not_opened';
    return rememberPayslipPassword(this.db, options.password) ? 'saved' : 'unavailable';
  }
  /** Owner uploads are always staged; scheduled scans may skip months before the records start. */
  ingest(
    bytes: Buffer,
    filename: string,
    source: 'manual',
    contentHash?: string,
    options?: PasswordOptions,
  ): Promise<Staged>;
  ingest(
    bytes: Buffer,
    filename: string,
    source: 'manual' | 'dropbox',
    contentHash?: string,
    options?: PasswordOptions,
  ): Promise<Staged | Skipped>;
  async ingest(
    bytes: Buffer,
    filename: string,
    source: 'manual' | 'dropbox',
    contentHash?: string,
    options: PasswordOptions = {},
  ): Promise<Staged | Skipped> {
    if (!bytes.length || bytes.length > RECEIPT_LIMIT || receiptMime(bytes) !== 'application/pdf')
      throw new RangeError('Bitte eine PDF-Datei bis 15 MB wählen.');
    const sha256 = digest(bytes);
    const old = findPayslipIntake(this.db, sha256, contentHash);
    if (old && !old.deletedAt)
      return {
        id: old.id,
        duplicate: true,
        groupId: null,
        dropboxCopy: 'off' as DropboxCopy,
        passwordRemember: 'off' as PasswordRemember,
      };
    const name = sanitizedFilename(filename);
    const { parsed, opened } = await this.evaluate(bytes, name, options.password);
    // Scheduled scans only: skip months before the records start, close months already captured.
    const scope =
      source === 'dropbox'
        ? payslipScope(this.db, parsed, name, options.folderYear ?? null)
        : 'in_scope';
    if (scope === 'before_start') return { skipped: 'before_start' };
    await storeReceipt(this.dir, bytes); // Original encrypted bytes only; never persist plaintext.
    const staged = stagePayslip(
      this.db,
      {
        sha256,
        ...(contentHash ? { contentHash } : {}),
        source,
        sizeBytes: bytes.length,
        filename: name,
        parsed,
        ...(scope === 'recorded' ? { settle: payslipScopeReason(scope) } : {}),
      },
      { actor: source === 'manual' ? 'owner' : 'system' },
    );
    // Files fetched from Dropbox are never written back; only owner uploads are copied.
    const dropboxCopy =
      source === 'manual' ? await this.copyToDropbox(bytes, name, parsed) : ('off' as DropboxCopy);
    return { ...staged, dropboxCopy, passwordRemember: this.remember(bytes, opened, options) };
  }
  /** Best effort: the staged intake and the stored receipt stay valid whatever happens here. */
  private async copyToDropbox(
    bytes: Buffer,
    filename: string,
    parsed: ParsedPayrollDocument,
  ): Promise<DropboxCopy> {
    if (!this.dropbox) return 'off';
    try {
      const year = dropboxTargetYear(parsed, filename, this.clock());
      await this.dropbox.upload(dropboxTargetPath(this.dropbox.root, year, filename), bytes);
      return 'saved';
    } catch {
      // Provider text, paths and bytes are deliberately neither logged nor kept.
      try {
        payslipSourceWarning(
          this.db,
          'Dropbox-Ablage fehlgeschlagen. Die Datei liegt sicher in der App.',
        );
      } catch {
        // The upload result already tells the owner; a warning failure must not fail the intake.
      }
      return 'failed';
    }
  }
  async retry(id: string, options: PasswordOptions = {}) {
    const row = getPayslipIntake(this.db, id),
      receipt = getReceipt(this.db, row.receiptId);
    const file = await verifyReceiptFile(this.dir, row.sha256, receipt.sizeBytes);
    const bytes = await readFile(file),
      { parsed, opened } = await this.evaluate(
        bytes,
        receipt.originalFilename ?? '',
        options.password,
      );
    return {
      ...replaceParsedPayslip(this.db, id, parsed, { actor: 'owner' }),
      passwordRemember: this.remember(bytes, opened, options),
    };
  }
}
