import {
  findPayslipIntake,
  getPayslipIntake,
  readPayslipScan,
  writePayslipScan,
  type Db,
} from '@budget/db';
import { RECEIPT_LIMIT } from '../receipts/files';
import { DropboxError, eligiblePayslipPath, type DropboxPayslipSource } from './dropbox';
import { payslipSourceWarning } from './source-warning';
import type { PayslipIntakeService } from './service';

export function nextPayslipScan(now: Date) {
  const next = new Date(now);
  next.setUTCHours(2, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
export class PayslipScanner {
  private running = false;
  constructor(
    private readonly db: Db,
    private readonly source: DropboxPayslipSource,
    private readonly intake: PayslipIntakeService,
  ) {}
  async tick(now = new Date()) {
    const old = readPayslipScan(this.db);
    if (this.running || (old?.root === this.source.root && old.nextRunAt > now.toISOString()))
      return;
    this.running = true;
    let cursor = old?.root === this.source.root ? old.cursor : null;
    let filesFound = 0,
      errors = 0;
    const write = (nextRunAt: string, errorCode: string | null) =>
      writePayslipScan(this.db, {
        id: 'dropbox',
        root: this.source.root,
        cursor,
        lastScanAt: now.toISOString(),
        nextRunAt,
        filesFound,
        errors,
        errorCode,
      });
    try {
      let reset = false;
      for (let pages = 0; pages < 100; pages++) {
        let result;
        try {
          result = await this.source.list(cursor);
        } catch (error) {
          if (error instanceof DropboxError && error.code === 'cursor_reset' && !reset) {
            cursor = null;
            reset = true;
            continue;
          }
          throw error;
        }
        for (const file of result.entries) {
          if (
            file['.tag'] !== 'file' ||
            !file.path_lower ||
            !eligiblePayslipPath(this.source.root, file.path_lower)
          )
            continue;
          filesFound++;
          const seen = file.content_hash
            ? findPayslipIntake(this.db, undefined, file.content_hash)
            : undefined;
          if (seen && !seen.deletedAt) continue;
          if ((file.size ?? 0) > RECEIPT_LIMIT) {
            errors++;
            this.warning('PDF überschreitet 15 MB. Bitte Datei manuell prüfen.');
            continue;
          }
          const staged = await this.intake.ingest(
            await this.source.download(file),
            file.name,
            'dropbox',
            file.content_hash,
          );
          // Extraction failures are durable inbox warnings, so this page can still advance.
          if (staged.id) {
            // Count document warnings without logging their values or the original text.
            if (getPayslipIntake(this.db, staged.id).parsed.warnings.length) errors++;
          }
        }
        cursor = result.cursor;
        write(
          result.has_more ? now.toISOString() : nextPayslipScan(now),
          errors ? 'document_warning' : null,
        );
        if (!result.has_more) return;
      }
      write(new Date(now.getTime() + 60_000).toISOString(), errors ? 'document_warning' : null);
    } catch {
      errors++;
      write(new Date(now.getTime() + 15 * 60_000).toISOString(), 'scan_failed');
      this.warning('Gehaltszettel-Abruf fehlgeschlagen. Der Scan wird erneut versucht.');
    } finally {
      this.running = false;
    }
  }
  private warning(detail: string) {
    payslipSourceWarning(this.db, detail);
  }
}
