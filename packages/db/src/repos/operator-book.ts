import { randomUUID } from 'node:crypto';
import { isNull } from 'drizzle-orm';
import { account, payee } from '../schema';
import { type AuditContext, type GroupedContext } from './audit';
import {
  createBooking,
  createTransfer,
  deleteBooking,
  listBookings,
  updateBooking,
  type BookingRow,
} from './bookings';
import { BookingInvariantError, ConflictError, ReconciledLockedError } from './errors';
import { OperatorInputError, resolveCategoryNames } from './operator-ops';
import { createPayee } from './payees';
import { runInTransaction, type Executor } from './types';

/**
 * Operator bookings (`migrate-cli.js book`): add, change the amount or date of, and delete
 * bookings by account, category and payee *name*. Nothing here writes on its own: every entry goes
 * through the functions behind the booking routes (`createBooking`, `createTransfer`,
 * `updateBooking`, `deleteBooking`, `createPayee`), so transfer pairing, splits, trade-linked cash
 * flows, payment links, reconciliation locks and the envelope recomputation hold exactly as in the
 * app, and whatever the app refuses is skipped here with a reason. One audit group per entry
 * (actor `operator`), so the app's Rückgängig can undo each one individually.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');

/** Thrown inside the transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

export interface BookMatch {
  account: string;
  date: string;
  amountCents: number;
  payee?: string;
  memo?: string;
}

interface EntryBase {
  /** Stable id chosen by the operator; only used to report. */
  id: string;
}

export interface BookAdd extends EntryBase {
  kind: 'add';
  account: string;
  date: string;
  amountCents: number;
  payee?: string;
  category?: string;
  transferAccount?: string;
  memo?: string;
  cleared: 'cleared' | 'uncleared';
}
/**
 * `unlock: true` on an entry that changes or deletes a booking is the explicit, per-entry switch
 * for a reconciled (geprüft, locked) booking: it passes `unlockReconciled` to the same functions
 * the app and the API use (`PATCH /api/bookings/:id` with `unlockReconciled`, `DELETE ...?unlock=1`),
 * so the change is audited and undoable like any other. Without it a reconciled booking is still
 * skipped as `reconciled_locked`.
 */
export interface BookChangeAmount extends EntryBase {
  kind: 'change_amount';
  match: BookMatch;
  newAmountCents: number;
  unlock?: true;
}
export interface BookChangeDate extends EntryBase {
  kind: 'change_date';
  match: BookMatch;
  newDate: string;
  unlock?: true;
}
export interface BookDelete extends EntryBase {
  kind: 'delete';
  match: BookMatch;
  unlock?: true;
}
export type BookEntry = BookAdd | BookChangeAmount | BookChangeDate | BookDelete;

export interface BookDone {
  status: 'done';
  kind: BookEntry['kind'];
  id: string;
  account: string;
  date: string;
  cents: number;
  /** The entry's audit group (empty in a dry run). */
  groupId: string;
}
export interface BookSkipped {
  status: 'skipped';
  kind: BookEntry['kind'];
  id: string;
  reason: string;
  /** Number of bookings the match resolved to (0 for entries without a match). */
  candidates: number;
  /** The refusing rule's message, for the operator's terminal (`--details`). */
  detail?: string;
}
export type BookOutcome = BookDone | BookSkipped;

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function validDay(value: unknown, at: string): string {
  if (
    typeof value !== 'string' ||
    !DAY.test(value) ||
    !new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  )
    throw new OperatorInputError(`${at} must be a valid YYYY-MM-DD date`);
  return value;
}
function text(value: unknown, at: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new OperatorInputError(`${at} must be a non-empty name`);
  return value.trim();
}
function optionalText(value: unknown, at: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, at);
}
function wholeCents(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new OperatorInputError(`${at} must be an integer number of cents`);
  return value;
}

function parseMatch(raw: unknown, at: string): BookMatch {
  if (!isObject(raw)) throw new OperatorInputError(`${at} must be an object`);
  const payeeName = optionalText(raw['payee'], `${at}.payee`);
  const memo = raw['memo'] === undefined || raw['memo'] === null ? undefined : raw['memo'];
  if (memo !== undefined && typeof memo !== 'string')
    throw new OperatorInputError(`${at}.memo must be a string`);
  return {
    account: text(raw['account'], `${at}.account`),
    date: validDay(raw['date'], `${at}.date`),
    amountCents: wholeCents(raw['amountCents'], `${at}.amountCents`),
    ...(payeeName !== undefined && { payee: payeeName }),
    ...(memo !== undefined && { memo: memo.trim() }),
  };
}

/** `unlock` is optional and, when present, must be a boolean; `false` is the same as absent. */
function unlockFlag(raw: Record<string, unknown>, at: string): { unlock?: true } {
  const value = raw['unlock'];
  if (value === undefined || value === false) return {};
  if (value === true) return { unlock: true };
  throw new OperatorInputError(`${at}.unlock must be true or false`);
}

/** Check a parsed `book --file` JSON; throws `OperatorInputError` naming the entry and the problem. */
export function parseBookFile(json: unknown): BookEntry[] {
  if (!Array.isArray(json)) throw new OperatorInputError('The file must hold a JSON array');
  const seen = new Set<string>();
  return json.map((raw: unknown, i): BookEntry => {
    const where = `entry ${i + 1}`;
    if (!isObject(raw)) throw new OperatorInputError(`${where} must be an object`);
    const id = text(raw['id'], `${where}.id`);
    if (seen.has(id)) throw new OperatorInputError(`${where}: id "${id}" is used twice`);
    seen.add(id);
    const at = `${where} (${id})`;
    switch (raw['kind']) {
      case 'add': {
        const category = optionalText(raw['category'], `${at}.category`);
        const transferAccount = optionalText(raw['transferAccount'], `${at}.transferAccount`);
        if (category !== undefined && transferAccount !== undefined)
          throw new OperatorInputError(
            `${at}: "category" and "transferAccount" exclude each other`,
          );
        const cleared = raw['cleared'] ?? 'uncleared';
        if (cleared !== 'cleared' && cleared !== 'uncleared')
          throw new OperatorInputError(`${at}.cleared must be "cleared" or "uncleared"`);
        if (raw['unlock'] !== undefined)
          throw new OperatorInputError(
            `${at}: "unlock" only applies to change_amount, change_date and delete`,
          );
        const amountCents = wholeCents(raw['amountCents'], `${at}.amountCents`);
        if (transferAccount !== undefined && amountCents === 0)
          throw new OperatorInputError(`${at}: a transfer needs a non-zero amount`);
        const payeeName = optionalText(raw['payee'], `${at}.payee`);
        const memo = optionalText(raw['memo'], `${at}.memo`);
        return {
          kind: 'add',
          id,
          account: text(raw['account'], `${at}.account`),
          date: validDay(raw['date'], `${at}.date`),
          amountCents,
          cleared,
          ...(payeeName !== undefined && { payee: payeeName }),
          ...(category !== undefined && { category }),
          ...(transferAccount !== undefined && { transferAccount }),
          ...(memo !== undefined && { memo }),
        };
      }
      case 'change_amount':
        return {
          kind: 'change_amount',
          id,
          match: parseMatch(raw['match'], `${at}.match`),
          newAmountCents: wholeCents(raw['newAmountCents'], `${at}.newAmountCents`),
          ...unlockFlag(raw, at),
        };
      case 'change_date':
        return {
          kind: 'change_date',
          id,
          match: parseMatch(raw['match'], `${at}.match`),
          newDate: validDay(raw['newDate'], `${at}.newDate`),
          ...unlockFlag(raw, at),
        };
      case 'delete':
        return {
          kind: 'delete',
          id,
          match: parseMatch(raw['match'], `${at}.match`),
          ...unlockFlag(raw, at),
        };
      default:
        throw new OperatorInputError(
          `${at}.kind must be add, change_amount, change_date or delete`,
        );
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

/** An entry that cannot be applied; thrown inside its savepoint, which rolls its writes back. */
class Skip extends Error {
  constructor(
    readonly reason: string,
    readonly candidates = 0,
    message = reason,
  ) {
    super(message);
  }
}

type AccountRef = { id: string; name: string; closed: boolean };

function accountsByName(db: Executor): Map<string, AccountRef[]> {
  const byName = new Map<string, AccountRef[]>();
  for (const a of db
    .select({ id: account.id, name: account.name, closedAt: account.closedAt })
    .from(account)
    .where(isNull(account.deletedAt))
    .all())
    byName.set(fold(a.name), [
      ...(byName.get(fold(a.name)) ?? []),
      { id: a.id, name: a.name, closed: a.closedAt !== null },
    ]);
  return byName;
}

function findAccount(db: Executor, name: string): AccountRef {
  const found = accountsByName(db).get(fold(name)) ?? [];
  if (found.length === 0) throw new Skip('unknown_account', 0, `unknown account "${name}"`);
  if (found.length > 1) throw new Skip('ambiguous_account', 0, `ambiguous account "${name}"`);
  return found[0]!;
}
/** The booking routes refuse a write into a closed account; so does the operator command. */
function findOpenAccount(db: Executor, name: string): AccountRef {
  const found = findAccount(db, name);
  if (found.closed) throw new Skip('account_closed', 0, `account "${name}" is closed`);
  return found;
}

function findCategory(db: Executor, name: string): string {
  const { ids, problems } = resolveCategoryNames(db, [name]);
  if (problems.unknown.length > 0)
    throw new Skip('unknown_category', 0, `unknown category "${name}"`);
  if (problems.ambiguous.length > 0)
    throw new Skip('ambiguous_category', 0, `ambiguous category "${name}"`);
  return ids.get(fold(name))!;
}

const livePayees = (db: Executor) =>
  db.select({ id: payee.id, name: payee.name }).from(payee).where(isNull(payee.deletedAt)).all();

/** The payee with this name (case-insensitive), created like the app does when it is new. */
function payeeForName(db: Executor, name: string, ctx: AuditContext): string {
  const found = livePayees(db).filter((p) => fold(p.name) === fold(name));
  if (found.length > 1) throw new Skip('ambiguous_payee', 0, `ambiguous payee "${name}"`);
  return found[0]?.id ?? createPayee(db, { name }, ctx).id;
}

/** Top-level bookings of the match; both a transfer leg and a split parent count with their total. */
function resolveMatch(db: Executor, match: BookMatch): BookingRow {
  const acct = findAccount(db, match.account);
  let candidates = listBookings(db, {
    accountId: acct.id,
    from: match.date,
    to: match.date,
  }).filter((b) => b.amountCents === match.amountCents);
  if (match.payee !== undefined) {
    const ids = new Set(
      livePayees(db)
        .filter((p) => fold(p.name) === fold(match.payee!))
        .map((p) => p.id),
    );
    candidates = candidates.filter((b) => b.payeeId !== null && ids.has(b.payeeId));
  }
  if (match.memo !== undefined)
    candidates = candidates.filter((b) => (b.memo ?? '').trim() === match.memo);
  if (candidates.length === 0) throw new Skip('no_match', 0, 'no booking matches');
  if (candidates.length > 1)
    throw new Skip('ambiguous_match', candidates.length, `${candidates.length} bookings match`);
  const { splits, ...row } = candidates[0]!;
  void splits;
  return row;
}

/** Any refusal of the domain rules becomes a skip with a stable reason code. */
function refusal(error: unknown): Skip {
  if (error instanceof Skip) return error;
  const message = error instanceof Error ? error.message : 'failed';
  if (error instanceof ReconciledLockedError) return new Skip('reconciled_locked', 0, message);
  if (error instanceof BookingInvariantError) return new Skip('refused_by_rules', 0, message);
  if (error instanceof ConflictError) return new Skip('conflict', 0, message);
  return new Skip('refused', 0, message);
}

/** The explicit per-entry unlock of a reconciled booking; nothing is unlocked by default. */
const writeOptions = (entry: BookChangeAmount | BookChangeDate | BookDelete) => ({
  unlockReconciled: entry.unlock === true,
});

function applyEntry(tx: Executor, entry: BookEntry, ctx: GroupedContext): BookDone {
  const done = (acct: string, date: string, cents: number): BookDone => ({
    status: 'done',
    kind: entry.kind,
    id: entry.id,
    account: acct,
    date,
    cents,
    groupId: ctx.groupId,
  });
  switch (entry.kind) {
    case 'add': {
      const acct = findOpenAccount(tx, entry.account);
      const other =
        entry.transferAccount === undefined
          ? undefined
          : findOpenAccount(tx, entry.transferAccount);
      const categoryId = entry.category === undefined ? null : findCategory(tx, entry.category);
      const payeeId = entry.payee === undefined ? null : payeeForName(tx, entry.payee, ctx);
      const status = entry.cleared === 'cleared' ? 'confirmed' : 'pending';
      if (other) {
        const outflow = entry.amountCents < 0;
        createTransfer(
          tx,
          {
            fromAccountId: outflow ? acct.id : other.id,
            toAccountId: outflow ? other.id : acct.id,
            date: entry.date,
            amountCents: Math.abs(entry.amountCents),
            status,
            payeeId,
            memo: entry.memo ?? null,
          },
          ctx,
        );
      } else {
        createBooking(
          tx,
          {
            accountId: acct.id,
            date: entry.date,
            amountCents: entry.amountCents,
            status,
            payeeId,
            memo: entry.memo ?? null,
            splits: [{ categoryId, amountCents: entry.amountCents }],
          },
          ctx,
        );
      }
      return done(acct.name, entry.date, entry.amountCents);
    }
    case 'change_amount': {
      const row = resolveMatch(tx, entry.match);
      updateBooking(tx, row.id, { amountCents: entry.newAmountCents }, ctx, writeOptions(entry));
      return done(entry.match.account, row.date, entry.newAmountCents);
    }
    case 'change_date': {
      const row = resolveMatch(tx, entry.match);
      updateBooking(tx, row.id, { date: entry.newDate }, ctx, writeOptions(entry));
      return done(entry.match.account, entry.newDate, row.amountCents);
    }
    case 'delete': {
      const row = resolveMatch(tx, entry.match);
      deleteBooking(tx, row.id, ctx, writeOptions(entry));
      return done(entry.match.account, row.date, row.amountCents);
    }
  }
}

/**
 * Apply the entries in file order, each in its own savepoint and audit group (so an entry later
 * in the file can see an earlier one). An entry that cannot be applied (unknown or ambiguous name,
 * zero or several matches, a rule of the app) writes nothing and is reported as skipped; the rest
 * goes through. Names of accounts and categories are never created, payees are. `dryRun` does all
 * of it and rolls everything back, so it skips exactly what the real run would.
 */
export function applyBookEntries(
  db: Executor,
  entries: ReadonlyArray<BookEntry>,
  ctx: Pick<AuditContext, 'actor'>,
  options: { dryRun?: boolean } = {},
): BookOutcome[] {
  try {
    return runInTransaction(db, (tx) => {
      const outcomes: BookOutcome[] = [];
      for (const entry of entries) {
        const grouped = { actor: ctx.actor, groupId: randomUUID() };
        try {
          outcomes.push(runInTransaction(tx, (inner) => applyEntry(inner, entry, grouped)));
        } catch (error) {
          const skip = refusal(error);
          outcomes.push({
            status: 'skipped',
            kind: entry.kind,
            id: entry.id,
            reason: skip.reason,
            candidates: skip.candidates,
            detail: skip.message,
          });
        }
      }
      if (options.dryRun) throw Object.assign(new DryRunRollback(), { outcomes });
      return outcomes;
    });
  } catch (error) {
    if (error instanceof DryRunRollback)
      return (error as DryRunRollback & { outcomes: BookOutcome[] }).outcomes.map((o) =>
        o.status === 'done' ? { ...o, groupId: '' } : o,
      );
    throw error;
  }
}
