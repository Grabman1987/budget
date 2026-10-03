import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { employerPension, security } from '../schema';
import { type AuditContext, type GroupedContext } from './audit';
import { getBookSettings, saveBookSettings } from './book-settings';
import { getEntity } from './entities';
import { ConflictError, EntityNotFoundError } from './errors';
import { OperatorInputError } from './operator-ops';
import { updateSecurity } from './securities';
import { runInTransaction, type Executor } from './types';

/**
 * Operator instrument facts (`migrate-cli.js instrument-facts`): private per-instrument values the
 * owner does not want in the repo (TER in basis points, leverage in tenths) and the explicit
 * monthly employer pension contributions. Nothing here writes on its own: securities go through
 * `updateSecurity` (the function behind `PATCH /api/securities/:id`), pension months through
 * `saveBookSettings` (behind the rules settings route), so validation and audit match the UI path.
 * One audit group per entry (actor `operator`), each in its own savepoint, so the app's Rückgängig
 * or `undo-group` can revert every entry on its own.
 */

/** Same ranges as the security routes (`terBp` 0..10000, `leverageFactor` 10..1000). */
const TER_BP_MAX = 10_000;
const LEVERAGE_MIN = 10;
const LEVERAGE_MAX = 1_000;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Thrown inside the transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

export interface SecurityFactsEntry {
  isin: string;
  terBp?: number;
  leverageFactorTenths?: number;
}
export interface PensionFactsEntry {
  month: string;
  amountCents: number;
}
export interface BookSettingsFacts {
  birthYear?: number;
  birthMonth?: number;
}
export interface InstrumentFacts {
  securities: SecurityFactsEntry[];
  employerPension: PensionFactsEntry[];
  /** Absent when the file has no `bookSettings`. */
  bookSettings?: BookSettingsFacts;
}

export interface SecurityFactsDone {
  status: 'updated' | 'unchanged';
  isin: string;
  /** Fields that change, as `field old -> new` (empty for an unchanged entry). */
  changes: string[];
  /** The entry's audit group (empty for unchanged entries and in a dry run). */
  groupId: string;
}
export interface SecurityFactsSkipped {
  status: 'skipped';
  isin: string;
  reason: string;
  candidates: number;
  detail?: string;
}
export type SecurityFactsOutcome = SecurityFactsDone | SecurityFactsSkipped;

export interface PensionFactsOutcome {
  status: 'upserted' | 'unchanged' | 'skipped';
  month: string;
  amountCents: number;
  /** `created`, `changed` or `restored` for an upsert; the refusal for a skip. */
  detail: string;
  groupId: string;
}

export interface SettingsFactsOutcome {
  status: 'updated' | 'unchanged' | 'skipped';
  /** `YYYY-MM` after the change (updated), the stored value (unchanged), or empty (skipped). */
  birthMonth: string;
  /** `field old -> new` for an update, the refusal for a skip. */
  detail: string;
  groupId: string;
}

export interface InstrumentFactsResult {
  securities: SecurityFactsOutcome[];
  pension: PensionFactsOutcome[];
  /** `null` when the file has no `bookSettings`. */
  settings: SettingsFactsOutcome | null;
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function optionalInt(value: unknown, at: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new OperatorInputError(`${at} must be a whole number from ${min} to ${max} or null`);
  return value;
}

/** Check a parsed `instrument-facts --file` JSON; throws `OperatorInputError` naming the entry. */
export function parseInstrumentFactsFile(
  json: unknown,
  today: string = new Date().toISOString().slice(0, 10),
): InstrumentFacts {
  if (!isObject(json)) throw new OperatorInputError('The file must hold a JSON object');
  for (const key of Object.keys(json))
    if (key !== 'securities' && key !== 'employerPension' && key !== 'bookSettings')
      throw new OperatorInputError(
        `unknown key "${key}" (expected securities, employerPension, bookSettings)`,
      );
  const list = (key: string): unknown[] => {
    const value = json[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new OperatorInputError(`"${key}" must be a list`);
    return value;
  };
  const seenIsins = new Set<string>();
  const securities = list('securities').map((raw, i): SecurityFactsEntry => {
    const at = `securities[${i}]`;
    if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
    const isin = typeof raw['isin'] === 'string' ? raw['isin'].trim().toUpperCase() : '';
    if (!ISIN.test(isin)) throw new OperatorInputError(`${at}.isin must be a 12 character ISIN`);
    if (seenIsins.has(isin)) throw new OperatorInputError(`${at}: ISIN is listed twice`);
    seenIsins.add(isin);
    const terBp = optionalInt(raw['terBp'], `${at}.terBp`, 0, TER_BP_MAX);
    const leverage = optionalInt(
      raw['leverageFactorTenths'],
      `${at}.leverageFactorTenths`,
      LEVERAGE_MIN,
      LEVERAGE_MAX,
    );
    return {
      isin,
      ...(terBp !== undefined && { terBp }),
      ...(leverage !== undefined && { leverageFactorTenths: leverage }),
    };
  });
  const seenMonths = new Set<string>();
  const pension = list('employerPension').map((raw, i): PensionFactsEntry => {
    const at = `employerPension[${i}]`;
    if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
    const month = raw['month'];
    if (typeof month !== 'string' || !MONTH.test(month))
      throw new OperatorInputError(`${at}.month must be YYYY-MM`);
    if (seenMonths.has(month)) throw new OperatorInputError(`${at}: month is listed twice`);
    seenMonths.add(month);
    const amountCents = raw['amountCents'];
    if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0)
      throw new OperatorInputError(`${at}.amountCents must be a whole number of cents, 0 or more`);
    return { month, amountCents };
  });
  const rawSettings = json['bookSettings'];
  let bookSettings: BookSettingsFacts | undefined;
  if (rawSettings !== undefined && rawSettings !== null) {
    if (!isObject(rawSettings)) throw new OperatorInputError('bookSettings must be an object');
    for (const key of Object.keys(rawSettings))
      if (key !== 'birthYear' && key !== 'birthMonth')
        throw new OperatorInputError(
          `bookSettings: unknown key "${key}" (expected birthYear, birthMonth)`,
        );
    const birthYear = optionalInt(
      rawSettings['birthYear'],
      'bookSettings.birthYear',
      1900,
      Number(today.slice(0, 4)),
    );
    const birthMonth = optionalInt(rawSettings['birthMonth'], 'bookSettings.birthMonth', 1, 12);
    bookSettings = {
      ...(birthYear !== undefined && { birthYear }),
      ...(birthMonth !== undefined && { birthMonth }),
    };
  }
  return {
    securities,
    employerPension: pension,
    ...(bookSettings !== undefined && { bookSettings }),
  };
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

function applySecurity(
  tx: Executor,
  entry: SecurityFactsEntry,
  ctx: GroupedContext,
): SecurityFactsOutcome {
  const skip = (reason: string, candidates: number, detail: string): SecurityFactsSkipped => ({
    status: 'skipped',
    isin: entry.isin,
    reason,
    candidates,
    detail,
  });
  const found = tx
    .select()
    .from(security)
    .where(and(eq(security.isin, entry.isin), isNull(security.deletedAt)))
    .all();
  if (found.length === 0) return skip('unknown_isin', 0, 'no live security has this ISIN');
  if (found.length > 1)
    return skip('ambiguous_isin', found.length, `${found.length} live securities have this ISIN`);
  const row = found[0]!;
  const patch: { terBp?: number; leverageFactor?: number } = {};
  const changes: string[] = [];
  if (entry.terBp !== undefined && entry.terBp !== row.terBp) {
    patch.terBp = entry.terBp;
    changes.push(`terBp ${row.terBp} -> ${entry.terBp}`);
  }
  if (
    entry.leverageFactorTenths !== undefined &&
    entry.leverageFactorTenths !== row.leverageFactor
  ) {
    patch.leverageFactor = entry.leverageFactorTenths;
    changes.push(`leverageFactor ${row.leverageFactor} -> ${entry.leverageFactorTenths}`);
  }
  if (changes.length === 0) return { status: 'unchanged', isin: entry.isin, changes, groupId: '' };
  updateSecurity(tx, row.id, patch, ctx);
  return { status: 'updated', isin: entry.isin, changes, groupId: ctx.groupId };
}

function applyPension(
  tx: Executor,
  entry: PensionFactsEntry,
  ctx: GroupedContext,
  today: string,
): PensionFactsOutcome {
  const result = (
    status: PensionFactsOutcome['status'],
    detail: string,
    groupId = '',
  ): PensionFactsOutcome => ({
    status,
    month: entry.month,
    amountCents: entry.amountCents,
    detail,
    groupId,
  });
  const current = getEntity(tx, employerPension, `pension-${entry.month}`, {
    includeDeleted: true,
  });
  if (current && current.deletedAt === null && current.amountCents === entry.amountCents)
    return result('unchanged', 'same amount');
  saveBookSettings(tx, { pension: [entry] }, ctx, today);
  return result(
    'upserted',
    !current ? 'created' : current.deletedAt !== null ? 'restored' : 'changed',
    ctx.groupId,
  );
}

function applySettings(
  tx: Executor,
  facts: BookSettingsFacts,
  ctx: GroupedContext,
  today: string,
): SettingsFactsOutcome {
  const skip = (detail: string): SettingsFactsOutcome => ({
    status: 'skipped',
    birthMonth: '',
    detail,
    groupId: '',
  });
  const current = getBookSettings(tx).birthMonth;
  const [currentYear, currentMonth] = current ? current.split('-').map(Number) : [];
  const year = facts.birthYear ?? currentYear;
  const month = facts.birthMonth ?? currentMonth;
  if (year === undefined || month === undefined)
    return skip('incomplete_birth_month: no birth month is stored yet, give year and month');
  const next = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  if (next === current)
    return { status: 'unchanged', birthMonth: current, detail: 'same value', groupId: '' };
  saveBookSettings(tx, { birthMonth: next }, ctx, today);
  return {
    status: 'updated',
    birthMonth: next,
    detail: `birthMonth ${current || '(none)'} -> ${next}`,
    groupId: ctx.groupId,
  };
}

/** Any refusal of the domain rules becomes a skip with a stable reason code. */
function refusalReason(error: unknown): { reason: string; message: string } {
  const message = error instanceof Error ? error.message : 'failed';
  if (error instanceof ConflictError) return { reason: 'conflict', message };
  if (error instanceof EntityNotFoundError) return { reason: 'not_found', message };
  if (error instanceof RangeError) return { reason: 'refused_by_rules', message };
  return { reason: 'refused', message };
}

/**
 * Apply securities first, then pension months, then the book settings, each entry in its own savepoint and audit group
 * (actor from `ctx`). An entry the app would refuse writes nothing and is reported as skipped; the
 * rest goes through. `dryRun` does all of it and rolls everything back, so it reports exactly what
 * the real run would change.
 */
export function applyInstrumentFacts(
  db: Executor,
  facts: InstrumentFacts,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean; today?: string } = {},
): InstrumentFactsResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const grouped = () => ({ actor: ctx.actor, groupId: randomUUID() });
  try {
    return runInTransaction(db, (tx) => {
      const result: InstrumentFactsResult = { securities: [], pension: [], settings: null };
      for (const entry of facts.securities) {
        try {
          result.securities.push(
            runInTransaction(tx, (inner) => applySecurity(inner, entry, grouped())),
          );
        } catch (error) {
          const { reason, message } = refusalReason(error);
          result.securities.push({
            status: 'skipped',
            isin: entry.isin,
            reason,
            candidates: 0,
            detail: message,
          });
        }
      }
      for (const entry of facts.employerPension) {
        try {
          result.pension.push(
            runInTransaction(tx, (inner) => applyPension(inner, entry, grouped(), today)),
          );
        } catch (error) {
          const { reason, message } = refusalReason(error);
          result.pension.push({
            status: 'skipped',
            month: entry.month,
            amountCents: entry.amountCents,
            detail: `${reason}: ${message}`,
            groupId: '',
          });
        }
      }
      if (facts.bookSettings) {
        const settings = facts.bookSettings;
        try {
          result.settings = runInTransaction(tx, (inner) =>
            applySettings(inner, settings, grouped(), today),
          );
        } catch (error) {
          const { reason, message } = refusalReason(error);
          result.settings = {
            status: 'skipped',
            birthMonth: '',
            detail: `${reason}: ${message}`,
            groupId: '',
          };
        }
      }
      if (options.dryRun) throw Object.assign(new DryRunRollback(), { result });
      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) {
      const { result } = error as DryRunRollback & { result: InstrumentFactsResult };
      return {
        securities: result.securities.map((o) =>
          o.status === 'updated' ? { ...o, groupId: '' } : o,
        ),
        pension: result.pension.map((o) => (o.status === 'upserted' ? { ...o, groupId: '' } : o)),
        settings:
          result.settings?.status === 'updated'
            ? { ...result.settings, groupId: '' }
            : result.settings,
      };
    }
    throw error;
  }
}
