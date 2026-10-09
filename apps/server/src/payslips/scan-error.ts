import { DropboxError } from './dropbox';

/** Closed set of scan failure classes; the only failure detail stored or shown (never provider text). */
export type ScanErrorClass =
  | 'dropbox_auth'
  | 'dropbox_scope'
  | 'dropbox_path'
  | 'dropbox_rate'
  | 'dropbox_list'
  | 'dropbox_download'
  | 'dropbox_integrity'
  | 'pdf_format'
  | 'storage'
  | 'db'
  | 'unknown';
export type ScanStage = 'list' | 'download' | 'ingest';

/** `document_warning` is a finished scan with per-document notes; every other code is a failed scan. */
export const isScanFailure = (code: string | null | undefined) =>
  Boolean(code) && code !== 'document_warning';

/** Auth, scope and rate-limit failures hit every file alike, so the page stops at the first one. */
export const FATAL_SCAN_CLASSES: ReadonlySet<ScanErrorClass> = new Set([
  'dropbox_auth',
  'dropbox_scope',
  'dropbox_rate',
]);
/** The file itself cannot be processed (not a PDF, gone from Dropbox); retrying never helps. */
export const PERMANENT_SCAN_CLASSES: ReadonlySet<ScanErrorClass> = new Set([
  'pdf_format',
  'dropbox_path',
]);

/** Carries an already classified failure from the per-file handler to the scan-level handler. */
export class ScanStageError extends Error {
  constructor(readonly scanClass: ScanErrorClass) {
    super(scanClass);
  }
}

const causes = (error: unknown) => {
  const chain: unknown[] = [];
  for (let e = error; e && chain.length < 4; e = (e as { cause?: unknown }).cause) chain.push(e);
  return chain;
};

/** Maps an error to a class from its type and codes only; messages are never inspected or kept. */
export function scanErrorCode(stage: ScanStage, error: unknown): ScanErrorClass {
  if (error instanceof ScanStageError) return error.scanClass;
  if (error instanceof DropboxError) {
    if (error.reason === 'missing_scope') return 'dropbox_scope';
    if (
      error.status === 401 ||
      error.reason === 'expired_access_token' ||
      error.reason === 'invalid_access_token' ||
      error.reason === 'invalid_grant'
    )
      return 'dropbox_auth';
    if (error.status === 429 || error.reason === 'too_many_requests') return 'dropbox_rate';
    if (error.code === 'not_found' || error.reason?.startsWith('path/')) return 'dropbox_path';
    if (error.code === 'integrity') return 'dropbox_integrity';
    return stage === 'download' ? 'dropbox_download' : 'dropbox_list';
  }
  for (const e of causes(error)) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('SQLITE')) return 'db';
    if (typeof code === 'string' && /^E[A-Z0-9]+$/.test(code)) return 'storage';
    if (e instanceof Error && e.name === 'SqliteError') return 'db';
  }
  if (error instanceof RangeError) return stage === 'ingest' ? 'pdf_format' : 'unknown';
  if (error instanceof Error && error.message === 'Receipt storage integrity failure')
    return 'storage';
  // Malformed provider JSON (token or listing response) is a provider problem, not ours.
  const name = (error as { name?: unknown } | null)?.name;
  return stage === 'list' && (error instanceof SyntaxError || name === 'ZodError')
    ? 'dropbox_list'
    : 'unknown';
}
