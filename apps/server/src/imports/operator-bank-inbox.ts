import { randomUUID } from 'node:crypto';
import {
  EntityNotFoundError,
  BookingInvariantError,
  ConflictError,
  ReconciledLockedError,
  OperatorInputError,
  bankBookingMatches,
  candidateMatches,
  createPayee,
  linkBankCandidate,
  mergeBankBooking,
  mergeBankCandidate,
  readAssignmentCandidate,
  resolveCategoryNames,
  resolveInboxItem,
  runInTransaction,
  schema,
  updateTracked,
  withGroup,
  type Db,
  type Executor,
} from '@budget/db';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { BankSync } from '../bank-sync/service';

/**
 * Operator path for the bank-sync inbox (`migrate-cli.js bank-inbox list|apply`). Nothing here
 * writes ledger data on its own: every entry calls the function behind the matching inbox action
 * of the app (`mergeBankCandidate`, `mergeBankBooking`, `linkBankCandidate`, the single-row
 * confirm of `BankSync`, the "Nicht übernehmen" resolve), so audit groups, undo, ledger invariants
 * and reconciliation locks hold as in the app. One audit group per entry (actor `operator`);
 * whatever the app refuses is skipped with a reason.
 */

const { account, bankSyncAccount, bankSyncCandidate, booking, bookingSplit, category, inboxItem } =
  schema;
const fold = (name: string) => name.trim().toLocaleLowerCase('de-AT');

/** Inbox items of these kinds are information only; resolving them changes no ledger data. */
const INFO_REF_TYPES = ['security', 'payslip-intake', 'payslip-source', 'bank-sync'] as const;
const isInfoItem = (row: { refType: string | null; title: string }) =>
  (INFO_REF_TYPES as readonly (string | null)[]).includes(row.refType) ||
  (row.refType === 'read_source' && row.title.startsWith('Quellsaldo'));

/** Thrown inside the transaction to roll a dry run back; never leaves this module. */
class DryRunRollback extends Error {}

class Skip extends Error {
  constructor(
    readonly reason: string,
    message = reason,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------------------------

const name = z.string().trim().min(1).max(200);
const target = {
  id: name,
  candidate: z.string().trim().min(1).max(100).optional(),
  bankBooking: z.string().trim().min(1).max(100).optional(),
};
const entrySchema = z.discriminatedUnion('action', [
  z.strictObject({ ...target, action: z.literal('merge'), bookingId: name }),
  z.strictObject({
    ...target,
    action: z.literal('transfer'),
    bookingId: name.optional(),
    counterAccount: name.optional(),
    /** Envelope of the budget leg when the transfer crosses budget and tracking accounts. */
    category: name.optional(),
  }),
  z.strictObject({
    ...target,
    action: z.literal('confirm'),
    payee: name.optional(),
    category: name.optional(),
    incomeType: name.optional(),
    memo: z.string().trim().min(1).max(4096).optional(),
    /** Id of an assignment rule shown by `list`; replaces payee, category and income type. */
    ruleId: name.optional(),
  }),
  z.strictObject({ ...target, action: z.literal('dismiss'), reason: name }),
  z.strictObject({
    id: name,
    action: z.literal('resolve-info'),
    inboxItemId: name,
    reason: name,
  }),
]);
export type BankInboxEntry = z.infer<typeof entrySchema>;

/** Check a parsed `bank-inbox apply --file` JSON; throws `OperatorInputError` naming the problem. */
export function parseBankInboxFile(json: unknown): BankInboxEntry[] {
  if (!Array.isArray(json)) throw new OperatorInputError('The file must hold a JSON array');
  const seen = new Set<string>();
  return json.map((raw: unknown, i): BankInboxEntry => {
    const parsed = entrySchema.safeParse(raw);
    const where = `entry ${i + 1}`;
    if (!parsed.success)
      throw new OperatorInputError(
        `${where}: ${parsed.error.issues.map((x) => `${x.path.join('.') || 'entry'}: ${x.message}`).join('; ')}`,
      );
    const entry = parsed.data;
    if (seen.has(entry.id))
      throw new OperatorInputError(`${where}: id "${entry.id}" is used twice`);
    seen.add(entry.id);
    const at = `${where} (${entry.id})`;
    if (entry.action === 'resolve-info') return entry;
    if (!entry.candidate === !entry.bankBooking)
      throw new OperatorInputError(`${at}: give exactly one of "candidate" or "bankBooking"`);
    if (entry.bankBooking && entry.action !== 'merge')
      throw new OperatorInputError(
        entry.action === 'dismiss'
          ? `${at}: a booked bank row is never dismissed here; it is a ledger booking`
          : `${at}: "${entry.action}" applies to a candidate, a booked bank row can only be merged`,
      );
    if (entry.action === 'transfer' && !entry.bookingId === !entry.counterAccount)
      throw new OperatorInputError(`${at}: give exactly one of "bookingId" or "counterAccount"`);
    if (entry.action === 'transfer' && entry.category && !entry.counterAccount)
      throw new OperatorInputError(`${at}: "category" only goes with "counterAccount"`);
    if (
      entry.action === 'confirm' &&
      entry.ruleId &&
      (entry.payee || entry.category || entry.incomeType || entry.memo)
    )
      throw new OperatorInputError(`${at}: "ruleId" excludes payee, category, incomeType and memo`);
    if (entry.action === 'confirm' && entry.category && entry.incomeType)
      throw new OperatorInputError(`${at}: "category" and "incomeType" exclude each other`);
    return entry;
  });
}

// ---------------------------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------------------------

type BookingLike = {
  id: string;
  accountId: string;
  date: string;
  amountCents: number;
  payeeId: string | null;
  memo: string | null;
  status: string;
  accountName?: string;
};

function describeBooking(db: Executor, row: BookingLike) {
  const payee = row.payeeId
    ? db
        .select({ name: schema.payee.name })
        .from(schema.payee)
        .where(eq(schema.payee.id, row.payeeId))
        .get()
    : undefined;
  const categories = db
    .select({ name: category.name })
    .from(bookingSplit)
    .innerJoin(category, eq(category.id, bookingSplit.categoryId))
    .where(eq(bookingSplit.bookingId, row.id))
    .all()
    .map((c) => c.name);
  return {
    bookingId: row.id,
    accountName:
      row.accountName ??
      db.select({ name: account.name }).from(account).where(eq(account.id, row.accountId)).get()
        ?.name ??
      null,
    date: row.date,
    amountCents: row.amountCents,
    payee: payee?.name ?? null,
    categories,
    memo: row.memo,
    status: row.status,
  };
}

const describeAll = (db: Executor, rows: readonly BookingLike[]) =>
  rows.map((r) => describeBooking(db, r));

function lookup(
  db: Executor,
  table: 'payee' | 'category' | 'incomeType' | 'account',
  id?: string | null,
) {
  if (!id) return null;
  const t = schema[table];
  return db.select({ name: t.name }).from(t).where(eq(t.id, id)).get()?.name ?? null;
}

function candidateView(db: Executor, row: typeof bankSyncCandidate.$inferSelect) {
  const acct = db.select().from(account).where(eq(account.id, row.accountId)).get();
  const source = row.sourceId
    ? db.select().from(bankSyncAccount).where(eq(bankSyncAccount.id, row.sourceId)).get()
    : undefined;
  const base = {
    type: 'candidate' as const,
    id: row.id,
    sourceId: row.sourceId,
    sourceLabel: source?.label ?? null,
    accountName: acct?.name ?? null,
    date: row.date,
    amountCents: row.amountCents,
    currency: row.currency,
    bankStatus: row.bankStatus,
    memo: row.memo,
    rawPayee: row.rawPayee,
  };
  try {
    const matches = candidateMatches(db, row.id);
    const review = readAssignmentCandidate(db, row.id);
    return {
      ...base,
      matches: {
        merge: describeAll(db, matches.merge),
        link: describeAll(db, matches.link),
        transfers: describeAll(db, matches.transfers),
      },
      cleanup: { payee: review.cleanup.payeeName, cleaned: review.cleanup.cleaned },
      existingTransfer: review.existingTransfer,
      suggestions: review.suggestions.map((rule) => ({
        ruleId: rule.id,
        name: rule.name,
        automatic: rule.automatic,
        unavailable: rule.unavailable,
        payee: lookup(db, 'payee', rule.actions.payeeId),
        category: lookup(db, 'category', rule.actions.categoryId),
        incomeType: lookup(db, 'incomeType', rule.actions.incomeTypeId),
        transferAccount: lookup(db, 'account', rule.actions.transferAccountId),
        splits: rule.actions.splits ? rule.actions.splits.length : 0,
        memo: rule.actions.memo ?? null,
      })),
    };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Read-only: open bank candidates and unchecked bank bookings with the app's match suggestions. */
export function listBankInbox(db: Executor, options: { sourceId?: string } = {}) {
  return runInTransaction(db, (tx) => {
    const candidates = tx
      .select({ row: bankSyncCandidate })
      .from(bankSyncCandidate)
      .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
      .where(
        and(
          isNull(inboxItem.resolvedAt),
          eq(inboxItem.refType, 'bank-sync-candidate'),
          ...(options.sourceId ? [eq(bankSyncCandidate.sourceId, options.sourceId)] : []),
        ),
      )
      .all()
      .map((r) => r.row)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const bankBookings = tx
      .select()
      .from(booking)
      .innerJoin(account, eq(account.id, booking.accountId))
      .where(
        and(
          isNull(booking.deletedAt),
          isNull(account.deletedAt),
          eq(booking.source, 'bank'),
          eq(booking.status, 'pending'),
          ...(options.sourceId ? [eq(booking.bankSourceId, options.sourceId)] : []),
        ),
      )
      .all()
      .map((r) => r.booking)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
      .map((row) => {
        const base = {
          type: 'bankBooking' as const,
          ...describeBooking(tx, row),
          sourceId: row.bankSourceId,
          rawText: row.bankRawText,
          rawPayee: row.bankRawPayee,
        };
        try {
          return {
            ...base,
            matches: { merge: describeAll(tx, bankBookingMatches(tx, row.id).merge) },
          };
        } catch (error) {
          return { ...base, error: error instanceof Error ? error.message : String(error) };
        }
      });
    return { candidates: candidates.map((row) => candidateView(tx, row)), bankBookings };
  });
}

// ---------------------------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------------------------

export interface BankInboxDone {
  status: 'done';
  id: string;
  action: BankInboxEntry['action'];
  /** The candidate, booked bank row or inbox item the entry acted on. */
  target: string;
  bookingId?: string;
  counterpartId?: string;
  /** The entry's audit group (empty in a dry run). */
  groupId: string;
}
export interface BankInboxSkipped {
  status: 'skipped';
  id: string;
  action: BankInboxEntry['action'];
  reason: string;
  detail: string;
}
export type BankInboxOutcome = BankInboxDone | BankInboxSkipped;

function refusal(error: unknown): Skip {
  if (error instanceof Skip) return error;
  const message = error instanceof Error ? error.message : 'failed';
  if (error instanceof EntityNotFoundError) return new Skip('not_found', message);
  if (error instanceof ReconciledLockedError) return new Skip('reconciled_locked', message);
  if (error instanceof BookingInvariantError) return new Skip('refused_by_rules', message);
  if (error instanceof ConflictError) return new Skip('conflict', message);
  return new Skip('refused', message);
}

function uniqueByName<T extends { id: string; name: string }>(
  rows: T[],
  wanted: string,
  what: string,
) {
  const found = rows.filter((r) => fold(r.name) === fold(wanted));
  if (found.length === 0) throw new Skip(`unknown_${what}`, `unknown ${what} "${wanted}"`);
  if (found.length > 1) throw new Skip(`ambiguous_${what}`, `ambiguous ${what} "${wanted}"`);
  return found[0]!.id;
}

const categoryId = (db: Executor, wanted: string) => {
  const { ids, problems } = resolveCategoryNames(db, [wanted]);
  if (problems.unknown.length) throw new Skip('unknown_category', `unknown category "${wanted}"`);
  if (problems.ambiguous.length)
    throw new Skip('ambiguous_category', `ambiguous category "${wanted}"`);
  return ids.get(fold(wanted))!;
};
const incomeTypeId = (db: Executor, wanted: string) =>
  uniqueByName(
    db
      .select({ id: schema.incomeType.id, name: schema.incomeType.name })
      .from(schema.incomeType)
      .where(isNull(schema.incomeType.deletedAt))
      .all(),
    wanted,
    'income_type',
  );
const openAccountId = (db: Executor, wanted: string) => {
  const id = uniqueByName(
    db
      .select({ id: account.id, name: account.name })
      .from(account)
      .where(isNull(account.deletedAt))
      .all(),
    wanted,
    'account',
  );
  if (db.select().from(account).where(eq(account.id, id)).get()!.closedAt)
    throw new Skip('account_closed', `account "${wanted}" is closed`);
  return id;
};
/** The payee with this name (case-insensitive), created like the app does when it is new. */
const payeeId = (db: Executor, wanted: string, ctx: { actor: string; groupId: string }) => {
  const found = db
    .select({ id: schema.payee.id, name: schema.payee.name })
    .from(schema.payee)
    .where(isNull(schema.payee.deletedAt))
    .all()
    .filter((p) => fold(p.name) === fold(wanted));
  if (found.length > 1) throw new Skip('ambiguous_payee', `ambiguous payee "${wanted}"`);
  return found[0]?.id ?? createPayee(db, { name: wanted }, ctx).id;
};

/** An open bank candidate; the same predicate the bulk route uses before touching a row. */
function openCandidateId(db: Executor, id: string) {
  const item = db.select().from(inboxItem).where(eq(inboxItem.id, id)).get();
  const row = db.select().from(bankSyncCandidate).where(eq(bankSyncCandidate.id, id)).get();
  if (!item || !row || item.refType !== 'bank-sync-candidate' || item.refId !== id)
    throw new Skip('not_a_candidate', `"${id}" is not a bank-sync candidate`);
  if (item.resolvedAt) throw new Skip('already_resolved', 'the candidate was already handled');
  return id;
}

function applyEntry(
  tx: Db,
  sync: BankSync,
  entry: BankInboxEntry,
  ctx: { actor: string; groupId: string },
  now: string,
): BankInboxDone {
  const done = (
    targetId: string,
    extra: { bookingId?: string; counterpartId?: string } = {},
  ): BankInboxDone => ({
    status: 'done',
    id: entry.id,
    action: entry.action,
    target: targetId,
    ...extra,
    groupId: ctx.groupId,
  });
  if (entry.action === 'resolve-info') {
    const item = tx.select().from(inboxItem).where(eq(inboxItem.id, entry.inboxItemId)).get();
    if (!item) throw new Skip('not_found', `inbox item "${entry.inboxItemId}" not found`);
    if (item.refType === 'bank-sync-candidate')
      throw new Skip(
        'not_info',
        'a bank candidate is decided with merge, transfer, confirm or dismiss',
      );
    if (!isInfoItem(item))
      throw new Skip(
        'not_info',
        `inbox item of type "${item.refType ?? item.kind}" is not an information item`,
      );
    if (item.resolvedAt) throw new Skip('already_resolved', 'the item was already resolved');
    updateTracked(tx, inboxItem, [item.id], { resolvedAt: now, resolution: entry.reason }, ctx);
    return done(item.id);
  }
  if (entry.bankBooking) {
    // parseBankInboxFile allows only merge here.
    const result = mergeBankBooking(
      tx,
      entry.bankBooking,
      (entry as { bookingId: string }).bookingId,
      ctx,
    );
    return done(entry.bankBooking, { bookingId: result.bookingId });
  }
  const id = openCandidateId(tx, entry.candidate!);
  switch (entry.action) {
    case 'merge': {
      const result = mergeBankCandidate(tx, id, entry.bookingId, ctx, now);
      return done(id, { bookingId: result.bookingId });
    }
    case 'transfer': {
      if (entry.bookingId) {
        const result = linkBankCandidate(tx, id, entry.bookingId, ctx, now);
        return done(id, { bookingId: result.bookingId });
      }
      // No counterpart booking: the app's confirm creates the booked leg and the counter leg
      // (markBankBookingTransfer), taking over a staged or booked counter row of the same day.
      const result = sync.confirm(
        id,
        null,
        {
          actions: {
            transferAccountId: openAccountId(tx, entry.counterAccount!),
            ...(entry.category !== undefined && { categoryId: categoryId(tx, entry.category) }),
          },
        },
        ctx,
      );
      const counter = tx
        .select({ id: booking.id })
        .from(booking)
        .where(eq(booking.importKey, 'bank-transfer:' + result.bookingId))
        .get();
      return done(id, {
        bookingId: result.bookingId,
        ...(counter && { counterpartId: counter.id }),
      });
    }
    case 'confirm': {
      const hasAssignment = entry.payee || entry.category || entry.incomeType || entry.memo;
      const result = sync.confirm(
        id,
        null,
        entry.ruleId
          ? { ruleId: entry.ruleId }
          : hasAssignment
            ? {
                actions: {
                  ...(entry.payee !== undefined && { payeeId: payeeId(tx, entry.payee, ctx) }),
                  ...(entry.category !== undefined && {
                    categoryId: categoryId(tx, entry.category),
                  }),
                  ...(entry.incomeType !== undefined && {
                    incomeTypeId: incomeTypeId(tx, entry.incomeType),
                  }),
                  ...(entry.memo !== undefined && { memo: entry.memo }),
                },
              }
            : {},
        ctx,
      );
      return done(id, { bookingId: result.bookingId });
    }
    case 'dismiss': {
      resolveInboxItem(tx, id, ctx, entry.reason);
      return done(id);
    }
  }
}

/**
 * Apply the entries in file order, each in its own savepoint and audit group. An entry the app
 * would refuse writes nothing and is reported as skipped; the rest goes through. `dryRun` does all
 * of it and rolls everything back, so it skips exactly what the real run would.
 */
export function applyBankInboxEntries(
  db: Db,
  entries: ReadonlyArray<BankInboxEntry>,
  ctx: { actor: string },
  options: { dryRun?: boolean; now?: () => Date } = {},
): BankInboxOutcome[] {
  const clock = options.now ?? (() => new Date());
  // confirm() reads neither the bank provider nor the key box: only the ledger side is used here.
  const sync = new BankSync(db, null as never, null as never, '', clock);
  try {
    return runInTransaction(db, (outer) => {
      const outcomes: BankInboxOutcome[] = [];
      for (const entry of entries) {
        const grouped = { actor: ctx.actor, groupId: randomUUID() };
        try {
          outcomes.push(
            runInTransaction(outer, (tx) =>
              applyEntry(tx as Db, sync, entry, withGroup(grouped), clock().toISOString()),
            ),
          );
        } catch (error) {
          const skip = refusal(error);
          outcomes.push({
            status: 'skipped',
            id: entry.id,
            action: entry.action,
            reason: skip.reason,
            detail: skip.message,
          });
        }
      }
      if (options.dryRun) throw Object.assign(new DryRunRollback(), { outcomes });
      return outcomes;
    });
  } catch (error) {
    if (error instanceof DryRunRollback)
      return (error as DryRunRollback & { outcomes: BankInboxOutcome[] }).outcomes.map((o) =>
        o.status === 'done' ? { ...o, groupId: '' } : o,
      );
    throw error;
  }
}
