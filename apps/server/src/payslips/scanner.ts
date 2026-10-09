import {
  findPayslipIntake,
  getPayslipIntake,
  readPayslipScan,
  writePayslipScan,
  type Db,
} from '@budget/db';
import { RECEIPT_LIMIT } from '../receipts/files';
import { DropboxError, eligiblePayslipPath, type DropboxPayslipSource } from './dropbox';
import {
  FATAL_SCAN_CLASSES,
  PERMANENT_SCAN_CLASSES,
  ScanStageError,
  scanErrorCode,
  type ScanErrorClass,
  type ScanStage,
} from './scan-error';
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
        // First retryable per-file failure on this page; it keeps the page (and cursor) open.
        let retry: ScanErrorClass | null = null;
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
            this.warning('PDF �berschreitet 15 MB. Bitte Datei manuell pr�fen.');
            continue;
          }
          let stage: ScanStage = 'download';
          try {
            const bytes = await this.source.download(file);
            stage = 'ingest';
            const staged = await this.intake.ingest(bytes, file.name, 'dropbox', file.content_hash);
            // Extraction failures are durable inbox warnings, so this page can still advance.
            if (staged.id) {
              // Count document warnings without logging their values or the original text.
              if (getPayslipIntake(this.db, staged.id).parsed.warnings.length) errors++;
            }
          } catch (error) {
            // Only the failure class is kept: no file names, paths, provider text or amounts.
            const code = scanErrorCode(stage, error);
            // Auth, scope and rate limits affect every file: stop instead of repeating them.
            if (FATAL_SCAN_CLASSES.has(code)) throw new ScanStageError(code);
            errors++;
            if (PERMANENT_SCAN_CLASSES.has(code))
              this.warning(
                `Eine PDF konnte nicht verarbeitet werden (${code}). Bitte Datei manuell pr�fen.`,
              );
            else retry ??= code;
          }
        }
        if (retry) {
          // Keep the previous cursor so the page is listed again; stored files are skipped by hash.
          write(new Date(now.getTime() + 15 * 60_000).toISOString(), retry);
          this.warning(
            `Gehaltszettel-Abruf fehlgeschlagen (${retry}). Der Scan wird erneut versucht.`,
          );
          return;
        }
        cursor = result.cursor;
        write(
          result.has_more ? now.toISOString() : nextPayslipScan(now),
          errors ? 'document_warning' : null,
        );
        if (!result.has_more) return;
      }
      write(new Date(now.getTime() + 60_000).toISOString(), errors ? 'document_warning' : null);
    } catch (error) {
      errors++;
      const code = scanErrorCode('list', error);
      write(new Date(now.getTime() + 15 * 60_000).toISOString(), code);
      this.warning(`Gehaltszettel-Abruf fehlgeschlagen (${code}). Der Scan wird erneut versucht.`);
    } finally {
      this.running = false;
    }
  }
  private warning(detail: string) {
    payslipSourceWarning(this.db, detail);
  }
}
