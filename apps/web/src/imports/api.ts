import { ApiError, request } from '../api/http';

/**
 * Typed calls of the YNAB import API (`docs/api-ledger.md` §YNAB import). The mapping document is
 * the importer's zod schema (`packages/import-ynab/src/mapping.ts`), mirrored here as a type;
 * the server validates every save.
 */

export const ACCOUNT_TYPES = [
  'checking',
  'cash',
  'savings',
  'credit_card',
  'loan',
  'brokerage',
  'crypto',
  'p2p',
  'receivable',
  'other_asset',
  'other_liability',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type TargetKind =
  | 'fixed'
  | 'periodic'
  | 'variable'
  | 'project'
  | 'saving'
  | 'invest'
  | 'debt'
  | 'advance'
  | 'card_payment'
  | 'income';
export type TargetClass = 'need' | 'want' | 'future';
export const DROP = 'drop';

export interface MappingAccount {
  id: string;
  name: string;
  type: AccountType;
  onBudget: boolean;
  closedAt: string | null;
}
export interface MappingTarget {
  name: string;
  group: string;
  kind: TargetKind;
  class: TargetClass | null;
  hidden: boolean;
  cardAccount: string | null;
}
export interface MappingRule {
  id: string;
  from?: string;
  match: {
    account?: string;
    payee?: string;
    memo?: string;
    category?: string;
    minCents?: number;
    maxCents?: number;
    dateFrom?: string;
    dateTo?: string;
  };
  set: { category?: string | null; contact?: string; project?: string; incomeType?: string };
}
export interface Mapping {
  version: 1;
  startMonth: string;
  rulesFrom: string | null;
  accounts: Record<string, 'skip' | MappingAccount>;
  targets: Record<string, MappingTarget>;
  categories: Record<string, string>;
  rules: MappingRule[];
  payees: Record<string, { name?: string; contact?: string }>;
  names: { stripNotes: boolean; stripEmoji: boolean };
  expectedPayments: { fromNotes: boolean };
}

export interface Problem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  lines: number[];
}
export interface RunView {
  id: string;
  status: 'staged' | 'dry_run' | 'committed' | 'reverted' | 'failed';
  fileName: string | null;
  mappingVersion: number | null;
  startedAt: string;
  committedAt: string | null;
  revertedAt: string | null;
  summary: {
    counts?: { register: number; plan: number; bookings: number };
    differences?: number;
    missing?: number;
  };
}
export interface RawAccount {
  name: string;
  firstDate: string;
  lastDate: string;
  rows: number;
  balanceCents: number;
  proposal: { onBudget: boolean; creditCard: boolean; type: AccountType; closedAt: string | null };
}
export type YearSums = Record<string, number>;
export interface RawCategory {
  key: string;
  group: string;
  name: string;
  hidden: boolean;
  count: number;
  years: YearSums;
}
export interface Overview {
  asOf: string | null;
  months: string[];
  accounts: RawAccount[];
  categories: RawCategory[];
  payees: { name: string; count: number }[];
  problems: Problem[];
}
export interface StructureRow {
  id: string;
  name: string;
  group: string;
  kind: TargetKind;
  sources: string[];
  count: number;
  years: YearSums;
}
export interface RuleEffect {
  id: string;
  count: number;
  sumCents: number;
  samples: { date: string; payee: string; memo: string; amountCents: number }[];
}
export type Check = 'balance' | 'activity' | 'available' | 'to_be_assigned' | 'total';
export interface Difference {
  check: Check;
  month: string;
  account?: string;
  category?: string;
  day?: string;
  expectedCents: number;
  actualCents: number;
}
export interface ChangeReport {
  bookings: {
    added: number;
    unchanged: number;
    updated: number;
    skipped: number;
    deleted: number;
    missing: {
      id: string;
      accountId: string;
      date: string;
      amountCents: number;
      payee: string | null;
    }[];
  };
  accounts: { created: number; reused: number; updated: number };
  categories: { created: number; reused: number; updated: number };
  payees: { created: number };
  assigned: { changed: number };
  classDefaulted: number;
}
export interface EvaluationResult {
  mappingVersion: number;
  startMonth: string;
  problems: Problem[];
  reconciliation: {
    differences: Difference[];
    moved: {
      ruleId: string;
      month: string;
      fromCategory: string | null;
      toCategory: string | null;
      cents: number;
    }[];
    creditShift: { month: string; cents: number }[];
    checked: Record<Check, number>;
  };
  structure: StructureRow[];
  accounts: {
    id: string;
    name: string;
    type: AccountType;
    onBudget: boolean;
    openingDate: string;
    openingBalanceCents: number;
  }[];
  change: ChangeReport | null;
  ledger: { month: string; category?: string; expectedCents: number; actualCents: number }[];
}

const base = '/api/imports';

export const fetchRuns = () => request<{ runs: RunView[] }>('GET', base);
export const fetchRun = (id: string) =>
  request<{ run: RunView; overview: Overview | null }>('GET', `${base}/${id}`);
export const fetchMapping = (id: string) =>
  request<{ version: number | null; proposed: boolean; mapping: Mapping }>(
    'GET',
    `${base}/${id}/mapping`,
  );
export const saveMapping = (id: string, mapping: Mapping) =>
  request<{ version: number }>('PUT', `${base}/${id}/mapping`, mapping);
export const previewMapping = (id: string, mapping: Mapping) =>
  request<{ problems: Problem[]; structure: StructureRow[]; rules: RuleEffect[] }>(
    'POST',
    `${base}/${id}/preview`,
    { mapping },
  );
/** Progress of a running import job (the server's task steps). */
export type JobStep = 'load' | 'check' | 'save' | 'write' | 'verify' | 'commit';
interface JobView {
  id: string;
  state: 'running' | 'done' | 'failed';
  step: JobStep | null;
  result: { status: number; body: Record<string, unknown> } | null;
}
/** How often a running job is asked for its state. */
const POLL_MS = 600;
/** Polls that may fail in a row (a phone switching networks) before the wizard gives up. */
const POLL_RETRIES = 20;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Dry run, commit and revert run as jobs on the server (a worker thread): the POST answers 202
 * with the job at once, then the job is polled until it is done. Its result is the answer the
 * call used to give directly; a failed job becomes an `ApiError` like every other call.
 */
async function runJob<T>(
  path: string,
  body: unknown,
  onStep?: (step: JobStep | null) => void,
): Promise<T> {
  let { job } = await request<{ job: JobView }>('POST', path, body);
  let failures = 0;
  while (job.state === 'running') {
    onStep?.(job.step);
    await pause(POLL_MS);
    try {
      ({ job } = await request<{ job: JobView }>('GET', `${base}/jobs/${job.id}`));
      failures = 0;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 0 || ++failures > POLL_RETRIES)
        throw error;
    }
  }
  const result = job.result;
  if (job.state === 'done' && result) return result.body as T;
  const fields = result?.body ?? {};
  throw new ApiError(
    result?.status ?? 500,
    typeof fields['error'] === 'string' ? fields['error'] : 'unknown',
    typeof fields['message'] === 'string' ? fields['message'] : undefined,
  );
}

export const dryRun = (id: string, onStep?: (step: JobStep | null) => void) =>
  runJob<EvaluationResult>(`${base}/${id}/dry-run`, undefined, onStep);
export const commitRun = (
  id: string,
  deleteMissing: boolean,
  onStep?: (step: JobStep | null) => void,
) => runJob<EvaluationResult & { run: RunView }>(`${base}/${id}/commit`, { deleteMissing }, onStep);
export const fetchReport = (id: string) =>
  request<EvaluationResult & { run: RunView }>('GET', `${base}/${id}/report`);
export const revertRun = (id: string, force = false) =>
  runJob<{ run: RunView }>(`${base}/${id}/revert`, { force });
export const deleteRun = (id: string) =>
  request<{ deleted: 'run' | 'staging' }>('DELETE', `${base}/${id}`);

/** Multipart upload of both files; errors become `ApiError` like every other call. */
export async function uploadExport(
  files: File[],
): Promise<{ run: RunView; sameExportAs: string[]; overview: Overview }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  let response: Response;
  try {
    response = await fetch(`${base}/ynab`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const file = payload['file'] === 'plan' ? 'Plan.tsv' : 'Register.tsv';
    throw new ApiError(
      response.status,
      typeof payload['error'] === 'string' ? payload['error'] : 'unknown',
      typeof payload['line'] === 'number'
        ? `${file} ist in Zeile ${payload['line']} nicht im Format des YNAB-Exports.`
        : undefined,
    );
  }
  return payload as unknown as { run: RunView; sameExportAs: string[]; overview: Overview };
}

/** `… as of 2026-09-29 18-30 - Register.tsv` → `29.09.2026`. */
export function exportDate(fileName: string | null): string {
  const m = / as of (\d{4})-(\d{2})-(\d{2})/.exec(fileName ?? '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '–';
}

const MESSAGES: Record<string, string> = {
  files: 'Bitte genau die beiden Dateien „… - Register.tsv“ und „… - Plan.tsv“ wählen.',
  invalid: 'Die Zuordnung ist nicht gültig.',
  import_problems: 'Der Probelauf hat Fehler; bitte zuerst die Zuordnung korrigieren.',
  newer_run: 'Zuerst den neueren Import rückgängig machen.',
  in_use:
    'Seit dem Import wurden Buchungen oder Budgetwerte auf seinen Konten oder Kategorien erfasst; bitte zuerst verschieben oder löschen.',
  undo_refused:
    'Importierte Daten wurden seither geändert; der Import lässt sich nicht mehr ganz zurücknehmen.',
  run_closed: 'Dieser Lauf ist abgeschlossen. Für eine neue Zuordnung den Export neu hochladen.',
  no_staging: 'Die Exportdateien dieses Laufs wurden gelöscht.',
  step_up_required: 'Bitte mit dem Passkey bestätigen.',
  network: 'Keine Verbindung zum Server.',
  invariant: 'Die Daten verletzen eine Regel des Kontobuchs.',
  import_running: 'Gerade läuft ein anderer Importschritt; bitte kurz warten und erneut versuchen.',
  job_lost:
    'Der Server wurde während des Vorgangs neu gestartet. Bitte die Importläufe prüfen und bei Bedarf erneut starten.',
};

/** What a running job does, for the progress line. */
export const JOB_STEPS: Record<JobStep, string> = {
  load: 'Exportdaten laden',
  check: 'Zuordnung prüfen',
  save: 'Exportdaten speichern',
  write: 'Buchungen schreiben',
  verify: 'Budget abgleichen',
  commit: 'Abschließen',
};

/** German message for a failed import call (server texts are English and never shown). */
export function importErrorText(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === 'parse' && error.detail) return error.detail;
  return MESSAGES[error.code] ?? fallback;
}
