import { randomUUID } from 'node:crypto';
import { payslipInput, type PayslipInput } from '@budget/domain';
import { isNull } from 'drizzle-orm';
import { account, payee, payslip } from '../schema';
import { type GroupedContext } from './audit';
import { listBookings } from './bookings';
import { listEntities } from './entities';
import { BookingInvariantError } from './errors';
import { OperatorInputError } from './operator-ops';
import { savePayslip } from './payroll-projects';
import { runInTransaction, type Executor } from './types';

/**
 * Operator payslip import (`migrate-cli.js payslips`): historical payslips from a JSON file, one
 * `savePayslip` call (the function behind `POST/PUT /api/payslips`) per entry, so the input rules
 * (net = gross + earnings - SV - tax - deductions + reimbursements, kind and special type, one
 * payslip per month/kind/special type) and the link rules (an existing EUR salary booking) are the
 * app's own. One savepoint and one audit group per payslip (actor `operator`), so the app's
 * Rückgängig or `undo-group --group <id>` reverts each one on its own.
 *
 * The file mirrors `savePayslip`'s input 1:1; the only differences are that the booking is not
 * given by id but found by `salaryBooking` (account name, date within 3 days, booking amount,
 * optional payee), and that `receiptId` is not available. The link is made only when exactly one
 * booking matches; otherwise the payslip is imported without link and reported as unlinked.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LINK_WINDOW_DAYS = 3;
const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');

/** Thrown inside the transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

export interface SalaryBookingRef {
  account: string;
  date: string;
  /** Amount of the booking (the payout). Payslips of one payout (regular + special) repeat it. */
  amountCents: number;
  payee?: string;
}

export interface PayslipEntry {
  /** Fields of `savePayslip`'s input, without `bookingId` and `receiptId`. */
  input: Omit<PayslipInput, 'bookingId' | 'receiptId'>;
  salaryBooking?: SalaryBookingRef;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseSalaryBooking(raw: unknown, at: string): SalaryBookingRef {
  if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
  for (const key of Object.keys(raw))
    if (!['account', 'date', 'amountCents', 'payee'].includes(key))
      throw new OperatorInputError(`${at}.${key} is not a known field`);
  const name = raw['account'];
  if (typeof name !== 'string' || !name.trim())
    throw new OperatorInputError(`${at}.account must be a non-empty name`);
  const date = raw['date'];
  if (
    typeof date !== 'string' ||
    !DAY.test(date) ||
    !new Date(`${date}T00:00:00Z`).toISOString().startsWith(date)
  )
    throw new OperatorInputError(`${at}.date must be a valid YYYY-MM-DD date`);
  const amount = raw['amountCents'];
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0)
    throw new OperatorInputError(`${at}.amountCents must be a positive integer number of cents`);
  const payeeName = raw['payee'];
  if (payeeName !== undefined && (typeof payeeName !== 'string' || !payeeName.trim()))
    throw new OperatorInputError(`${at}.payee must be a non-empty name`);
  return {
    account: name.trim(),
    date,
    amountCents: amount,
    ...(typeof payeeName === 'string' && { payee: payeeName.trim() }),
  };
}

/** Identity of a payslip in the model: `other` special payments may repeat within a month. */
const slot = (p: Pick<PayslipInput, 'month' | 'kind' | 'specialType'>) =>
  `${p.month}/${p.kind}/${p.specialType ?? '-'}`;
const figures = (p: Pick<PayslipInput, 'grossCents' | 'svCents' | 'taxCents' | 'netCents'>) =>
  `${p.grossCents}/${p.svCents}/${p.taxCents}/${p.netCents}`;

/** Check a parsed `payslips --file` JSON; throws `OperatorInputError` naming the entry and problem. */
export function parsePayslipsFile(json: unknown): PayslipEntry[] {
  if (!isObject(json) || !Array.isArray(json['payslips']))
    throw new OperatorInputError('The file must be an object with a "payslips" list');
  const seen = new Set<string>();
  return json['payslips'].map((raw: unknown, i): PayslipEntry => {
    const at = `payslip ${i + 1}`;
    if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
    for (const key of Object.keys(raw))
      if (
        ![
          'month',
          'kind',
          'specialType',
          'grossCents',
          'svCents',
          'taxCents',
          'netCents',
          'lines',
          'salaryBooking',
        ].includes(key)
      )
        throw new OperatorInputError(`${at}.${key} is not a known field`);
    const parsed = payslipInput.safeParse({
      ...raw,
      specialType: raw['specialType'] ?? null,
      svCents: raw['svCents'] ?? 0,
      taxCents: raw['taxCents'] ?? 0,
      lines: raw['lines'] ?? [],
      bookingId: null,
      receiptId: null,
    });
    if (!parsed.success)
      throw new OperatorInputError(
        `${at} (${String(raw['month'])}): ${parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'payslip'}: ${issue.message}`)
          .join('; ')}`,
      );
    const { bookingId, receiptId, ...input } = parsed.data;
    void bookingId;
    void receiptId;
    if (input.specialType !== 'other') {
      const key = slot(input);
      if (seen.has(key))
        throw new OperatorInputError(`${at}: ${key} appears twice (month, kind, special type)`);
      seen.add(key);
    }
    return {
      input,
      ...(raw['salaryBooking'] !== undefined && {
        salaryBooking: parseSalaryBooking(raw['salaryBooking'], `${at}.salaryBooking`),
      }),
    };
  });
}

export type PayslipStatus = 'created' | 'replaced' | 'exists' | 'skipped';

export interface PayslipOutcome {
  status: PayslipStatus;
  month: string;
  kind: PayslipInput['kind'];
  specialType: PayslipInput['specialType'];
  netCents: number;
  /** The payslip's id (empty for a skipped entry; the id of the existing slip for `exists`). */
  id: string;
  /** Linked to a salary booking after this entry (created and replaced only). */
  linked: boolean;
  /** Why there is no link: `no_salary_booking`, `no_booking`, `ambiguous_booking`, ... */
  unlinkedReason?: string;
  /** Number of bookings the salary booking resolved to. */
  candidates?: number;
  /** Reason code of a skipped entry. */
  reason?: string;
  /** The refusing rule's message, for the operator's terminal (`--details`). */
  detail?: string;
  /** The entry's audit group (empty in a dry run, for `exists` and for `skipped`). */
  groupId: string;
}

export interface PayslipSummary {
  payslips: number;
  created: number;
  replaced: number;
  exists: number;
  unlinked: number;
  skipped: number;
}

export function summarizePayslips(outcomes: ReadonlyArray<PayslipOutcome>): PayslipSummary {
  const count = (status: PayslipStatus) => outcomes.filter((o) => o.status === status).length;
  return {
    payslips: outcomes.length,
    created: count('created'),
    replaced: count('replaced'),
    exists: count('exists'),
    unlinked: outcomes.filter(
      (o) => (o.status === 'created' || o.status === 'replaced') && !o.linked,
    ).length,
    skipped: count('skipped'),
  };
}

const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

type Resolved =
  | { bookingId: string; reason?: undefined; candidates?: undefined }
  | { bookingId: null; reason: string; candidates: number };

/** The one booking of this account within 3 days with exactly this amount, or why there is none. */
function resolveSalaryBooking(tx: Executor, ref: SalaryBookingRef | undefined): Resolved {
  if (!ref) return { bookingId: null, reason: 'no_salary_booking', candidates: 0 };
  const accounts = tx
    .select({ id: account.id, name: account.name })
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((a) => fold(a.name) === fold(ref.account));
  if (accounts.length === 0) return { bookingId: null, reason: 'unknown_account', candidates: 0 };
  if (accounts.length > 1) return { bookingId: null, reason: 'ambiguous_account', candidates: 0 };
  let candidates = listBookings(tx, {
    accountId: accounts[0]!.id,
    from: shiftDay(ref.date, -LINK_WINDOW_DAYS),
    to: shiftDay(ref.date, LINK_WINDOW_DAYS),
  }).filter((b) => b.amountCents === ref.amountCents);
  if (ref.payee !== undefined) {
    const ids = new Set(
      tx
        .select({ id: payee.id, name: payee.name })
        .from(payee)
        .where(isNull(payee.deletedAt))
        .all()
        .filter((p) => fold(p.name) === fold(ref.payee!))
        .map((p) => p.id),
    );
    candidates = candidates.filter((b) => b.payeeId !== null && ids.has(b.payeeId));
  }
  if (candidates.length === 0) return { bookingId: null, reason: 'no_booking', candidates: 0 };
  if (candidates.length > 1)
    return { bookingId: null, reason: 'ambiguous_booking', candidates: candidates.length };
  return { bookingId: candidates[0]!.id };
}

/**
 * The stored payslip this entry stands for. `regular`, `salary13` and `salary14` are one per
 * month; `other` special payments may repeat, so they are paired by their figures, and (only with
 * `replace`) by being the only unpaired `other` payslip of the month on both sides.
 */
function findExisting(
  live: ReadonlyArray<typeof payslip.$inferSelect>,
  taken: ReadonlySet<string>,
  entry: PayslipEntry['input'],
  siblings: ReadonlyArray<PayslipEntry['input']>,
  replace: boolean,
) {
  const same = live.filter(
    (p) => p.month === entry.month && p.kind === entry.kind && p.specialType === entry.specialType,
  );
  if (entry.specialType !== 'other') return same[0];
  const free = same.filter((p) => !taken.has(p.id));
  const exact = free.find((p) => figures(p) === figures(entry));
  if (exact) return exact;
  if (!replace) return undefined;
  const unpairedHere = siblings.filter(
    (s) =>
      s.month === entry.month &&
      s.kind === entry.kind &&
      s.specialType === 'other' &&
      !free.some((p) => figures(p) === figures(s)),
  );
  return unpairedHere.length === 1 && free.length === 1 ? free[0] : undefined;
}

/**
 * Import the payslips in file order, each in its own savepoint and audit group. Entries whose
 * month, kind and special type exist already are reported as `exists` and left alone, unless
 * `replace` updates them through `savePayslip` (same id, lines replaced, link kept when no booking
 * matches). What `savePayslip` refuses is skipped with its reason and writes nothing. `dryRun` does
 * it all and rolls everything back, so it reports exactly what the real run would.
 */
export function applyPayslips(
  db: Executor,
  entries: ReadonlyArray<PayslipEntry>,
  ctx: { actor: string },
  options: { dryRun?: boolean; replace?: boolean } = {},
): PayslipOutcome[] {
  const replace = options.replace === true;
  try {
    return runInTransaction(db, (tx) => {
      const outcomes: PayslipOutcome[] = [];
      const taken = new Set<string>();
      for (const entry of entries) {
        const grouped: GroupedContext = { actor: ctx.actor, groupId: randomUUID() };
        const base = {
          month: entry.input.month,
          kind: entry.input.kind,
          specialType: entry.input.specialType,
          netCents: entry.input.netCents,
        };
        const live = listEntities(tx, payslip);
        const existing = findExisting(
          live,
          taken,
          entry.input,
          entries.map((e) => e.input),
          replace,
        );
        if (existing) taken.add(existing.id);
        if (existing && !replace) {
          outcomes.push({ ...base, status: 'exists', id: existing.id, linked: false, groupId: '' });
          continue;
        }
        try {
          outcomes.push(
            runInTransaction(tx, (inner): PayslipOutcome => {
              const resolved = resolveSalaryBooking(inner, entry.salaryBooking);
              // `replace` keeps a working link when the file's booking cannot be found again.
              const wanted = resolved.bookingId ?? existing?.bookingId ?? null;
              const save = (bookingId: string | null) =>
                savePayslip(
                  inner,
                  { ...entry.input, bookingId, receiptId: null },
                  grouped,
                  existing?.id,
                );
              let saved: ReturnType<typeof save>;
              let linkedId = wanted;
              let reason = resolved.reason;
              let detail: string | undefined;
              try {
                saved = save(wanted);
              } catch (error) {
                if (wanted === null || !(error instanceof BookingInvariantError)) throw error;
                // The app refused the link (e.g. the booking has no salary split): import without.
                saved = save(null);
                linkedId = null;
                reason = 'link_refused';
                detail = error.message;
              }
              return {
                ...base,
                status: existing ? 'replaced' : 'created',
                id: saved.id,
                linked: linkedId !== null,
                ...(linkedId === null && reason !== undefined && { unlinkedReason: reason }),
                ...(resolved.candidates !== undefined && { candidates: resolved.candidates }),
                ...(detail !== undefined && { detail }),
                groupId: grouped.groupId,
              };
            }),
          );
        } catch (error) {
          if (existing) taken.delete(existing.id);
          outcomes.push({
            ...base,
            status: 'skipped',
            id: '',
            linked: false,
            reason: error instanceof BookingInvariantError ? 'refused_by_rules' : 'refused',
            detail: error instanceof Error ? error.message : 'failed',
            groupId: '',
          });
        }
      }
      if (options.dryRun) throw Object.assign(new DryRunRollback(), { outcomes });
      return outcomes;
    });
  } catch (error) {
    if (error instanceof DryRunRollback)
      return (error as DryRunRollback & { outcomes: PayslipOutcome[] }).outcomes.map((o) => ({
        ...o,
        groupId: '',
      }));
    throw error;
  }
}
