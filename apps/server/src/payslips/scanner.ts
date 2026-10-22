import { PAYSLIP_PARSER_VERSION } from '@budget/domain';
import {
  findPayslipIntake,
  getPayslipIntake,
  assertPayslipScanLease,
  claimPayslipScan,
  commitPayslipScan,
  renewPayslipScan,
  reevaluatePayslipIntake,
  PayslipScanLeaseLost,
  type PayslipScanLease,
  type Db,
} from '@budget/db';
import { RECEIPT_LIMIT } from '../receipts/files';
import {
  DropboxError,
  eligiblePayslipPath,
  payslipFolderYear,
  type DropboxPayslipSource,
} from './dropbox';
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
const storedParserVersion = (row: { parsedJson: string }) => {
  try {
    return (JSON.parse(row.parsedJson) as { parserVersion?: number }).parserVersion ?? 0;
  } catch {
    return 0;
  }
};
export class PayslipScanner {
  private running = false;
  /** Counts of the last run; no names or paths. */
  lastRun = { skippedBeforeStart: 0, alreadyRecorded: 0 };
  /** Pending intakes read again with a newer parser in the last run. */
  lastReparsed = 0;
  constructor(
    private readonly db: Db,
    private readonly source: DropboxPayslipSource,
    private readonly intake: PayslipIntakeService,
  ) {}
  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    this.lastRun = { skippedBeforeStart: 0, alreadyRecorded: 0 };
    this.lastReparsed = 0;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lost = false;
    try {
      const claimed = claimPayslipScan(this.db, this.source.root, PAYSLIP_PARSER_VERSION, now);
      if (!claimed) return;
      const { full, parserStale, start } = claimed;
      const startYear = start ? Number(start.slice(0, 4)) : null;
      let cursor = claimed.cursor;
      let filesFound = 0, errors = 0;
      const ensure = () => {
        if (lost) throw new PayslipScanLeaseLost();
        assertPayslipScanLease(this.db, claimed.lease);
      };
      heartbeat = setInterval(() => {
        try {
          if (!renewPayslipScan(this.db, claimed.lease)) lost = true;
        } catch {
          lost = true;
        }
      }, 30_000);
      const write = (
        errorCode: string | null,
        nextRunAt?: string,
        release = false,
        completedFull = false,
      ) => {
        ensure();
        commitPayslipScan(
          this.db,
          claimed.lease,
          {
            cursor,
            lastScanAt: now.toISOString(),
            ...(nextRunAt ? { nextRunAt } : {}),
            filesFound,
            errors,
            errorCode,
          },
          { release, completedFull, start, parserVersion: PAYSLIP_PARSER_VERSION },
        );
      };
      try {
        let reset = false;
        for (let pages = 0; pages < 100; pages++) {
          let result;
          try {
            ensure();
            result = await this.source.list(cursor);
            ensure();
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
            ensure();
            if (
              file['.tag'] !== 'file' ||
              !file.path_lower ||
              !eligiblePayslipPath(this.source.root, file.path_lower)
            )
              continue;
            filesFound++;
            const folderYear = payslipFolderYear(this.source.root, file.path_lower);
            const seen = file.content_hash
              ? findPayslipIntake(this.db, undefined, file.content_hash)
              : undefined;
            if (seen && !seen.deletedAt) {
              // Intakes created before the scope rules existed are tidied up in the full listing.
              if (full && seen.status === 'pending') {
                if (
                  parserStale &&
                  seen.source === 'dropbox' &&
                  storedParserVersion(seen) !== PAYSLIP_PARSER_VERSION
                ) {
                  try {
                    await this.intake.reparse(seen.id, claimed.lease);
                    ensure();
                    this.lastReparsed++;
                  } catch (error) {
                    if (error instanceof PayslipScanLeaseLost) throw error;
                    // The earlier result stays; only the count of open warnings is kept.
                    errors++;
                  }
                }
                const scope = reevaluatePayslipIntake(
                  this.db,
                  seen.id,
                  folderYear,
                  { actor: 'system' },
                  claimed.lease,
                );
                if (scope === 'before_start') this.lastRun.skippedBeforeStart++;
                else if (scope === 'recorded') this.lastRun.alreadyRecorded++;
              }
              continue;
            }
            // Year folders before the records start are not even downloaded.
            if (startYear !== null && folderYear !== null && folderYear < startYear) {
              this.lastRun.skippedBeforeStart++;
              continue;
            }
            if ((file.size ?? 0) > RECEIPT_LIMIT) {
              errors++;
              this.warning('PDF überschreitet 15 MB. Bitte Datei manuell prüfen.', claimed.lease);
              continue;
            }
            let stage: ScanStage = 'download';
            try {
              ensure();
              const bytes = await this.source.download(file);
              ensure();
              stage = 'ingest';
              const staged = await this.intake.ingest(
                bytes,
                file.name,
                'dropbox',
                file.content_hash,
                {
                  folderYear,
                  scanLease: claimed.lease,
                },
              );
              ensure();
              if ('skipped' in staged) {
                this.lastRun.skippedBeforeStart++;
                continue;
              }
              // Extraction failures are durable inbox warnings, so this page can still advance.
              if (staged.id) {
                // Count open document warnings without logging their values or the original text.
                const row = getPayslipIntake(this.db, staged.id);
                if (row.status === 'pending' && row.parsed.warnings.length) errors++;
                else if (!staged.duplicate && row.status !== 'pending')
                  this.lastRun.alreadyRecorded++;
              }
            } catch (error) {
              if (error instanceof PayslipScanLeaseLost) throw error;
              // Only the failure class is kept: no file names, paths, provider text or amounts.
              const code = scanErrorCode(stage, error);
              // Auth, scope and rate limits affect every file: stop instead of repeating them.
              if (FATAL_SCAN_CLASSES.has(code)) throw new ScanStageError(code);
              errors++;
              if (PERMANENT_SCAN_CLASSES.has(code))
                this.warning(
                  `Eine PDF konnte nicht verarbeitet werden (${code}). Bitte Datei manuell prüfen.`,
                  claimed.lease,
                );
              else retry ??= code;
            }
          }
          if (retry) {
            // Keep the previous cursor so the page is listed again; stored files are skipped by hash.
            this.warning(
              `Gehaltszettel-Abruf fehlgeschlagen (${retry}). Der Scan wird erneut versucht.`,
              claimed.lease,
            );
            write(retry, new Date(now.getTime() + 15 * 60_000).toISOString(), true);
            return;
          }
          cursor = result.cursor;
          write(
            errors ? 'document_warning' : null,
            result.has_more ? undefined : nextPayslipScan(now),
            !result.has_more,
            !result.has_more && full,
          );
          if (!result.has_more) return;
        }
        write(
          errors ? 'document_warning' : null,
          new Date(now.getTime() + 60_000).toISOString(),
          true,
        );
      } catch (error) {
        if (error instanceof PayslipScanLeaseLost) return;
        errors++;
        const code = scanErrorCode('list', error);
        this.warning(
          `Gehaltszettel-Abruf fehlgeschlagen (${code}). Der Scan wird erneut versucht.`,
          claimed.lease,
        );
        write(code, new Date(now.getTime() + 15 * 60_000).toISOString(), true);
      }
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.running = false;
    }
  }
  private warning(detail: string, lease: PayslipScanLease) {
    payslipSourceWarning(this.db, detail, lease);
  }
}
