import { bookingIncomeDefault } from './income-month';
import {
  ContactAllocationError,
  contactStatement,
  mulDivRound,
  withinBankWindow,
} from '@budget/domain';
import { actualContactMovements, savedContactSettlements } from './contact-invariants';
import { contactCreditRecords, saveContactCreditRecord } from './contact-credit';
import { resolveContactForWrite } from './contact-label';
import { ensureAdvanceCategory } from './categories';
import { manualTransferStatus, type ManualBankStatus } from '@budget/domain';
import { assertContactBookingWrite, assertContactSettlementInvariants } from './contact-invariants';
import {
  assertStatementBookingWrite,
  assertStatementSettlementInvariants,
} from './statement-settlement-invariants';
import { learnBankPayee, learnInboxAssignment } from './assignment-rules';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, ne, type SQL } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  category,
  contact,
  contactSettlement,
  contactAllocation,
  expectedOccurrence,
  project,
  transfer,
  bankSyncCandidate,
  inboxItem,
} from '../schema';
import {
  deleteTracked,
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import {
  BookingContactArchivedError,
  BookingIntegrityError,
  BookingInvariantError,
  ContactArchivedError,
  EntityNotFoundError,
  ReconciledLockedError,
} from './errors';
import {
  assertLedgerInvariants,
  assertCounterTransferRestore,
  assertTradeSettlementBookingWrite,
  relatedTransferBookings,
  connectedTransferBookings,
} from './invariants';
import { expectedLinkPatches } from './expected-links';
import { bookingReviewedOn } from './booking-review';
import { runInTransaction, type Executor } from './types';

/**
 * Bookings, splits and transfers (SPEC §5). Invariants enforced here, not in SQL:
 * - the splits of a booking sum to its `amount_cents` (and there is at least one split);
 * - a transfer (Umbuchung) has exactly two legs with opposite amounts: two whole bookings, or one
 *   split and one booking (split-level transfer, e.g. part of a salary straight to savings);
 * - a transfer between two budget accounts is neutral and carries no category; between a budget
 *   and a tracking account the category sits on the budget leg (C2);
 * - imports are idempotent through `(account_id, import_key)`, also for soft-deleted rows;
 * - foreign currency: amount = round(original × rate) + fee, ±1 cent (C7);
 * - a split's category is live and never a `card_payment` envelope (that one is filled by the
 *   automatic card move); a split with a contact (receivable share) runs through an `advance`
 *   category ("Auslagen").
 *
 * Every function is one transaction and one audit group (`ctx.groupId` or a fresh id), so a whole
 * user action is undoable with `undo(db, { groupId })`. Deleting is soft; the splits of a deleted
 * booking stay in the table and are ignored by all reads through their parent.
 *
 * The `transfer` row itself is structural (no `deleted_at`) and not audited: undoing a transfer
 * soft-deletes its two bookings and leaves the unreferenced row behind.
 */

export type BookingRow = typeof booking.$inferSelect;
export type SplitRow = typeof bookingSplit.$inferSelect;
export type BookingWithSplits = BookingRow & { splits: SplitRow[] };

export interface SplitInput {
  /** `null` / omitted on an inflow means "Zu verteilen". */
  categoryId?: string | null;
  amountCents: number;
  memo?: string | null;
  /** Receivable share: paid for or repaid by this contact (concept §3.4). */
  contactId?: string | null;
  /** What an advance ("Auslagen" split) was for: an expense category; refused on other splits. */
  purposeCategoryId?: string | null;
  /** New shared purchases only. Omission keeps the automatic offset. */
  offsetContactCredit?: false;
  /** Income type of an inflow (Gehalt, Sonderzahlung, …). */
  incomeTypeId?: string | null;
  /**
   * Make this split a transfer leg: the other leg is a new booking on this account with the
   * opposite amount, same date (C4). The split's category follows the budget-leg rule.
   */
  transferAccountId?: string | null;
  /** Import key of the other leg (unique per account). */
  transferImportKey?: string | null;
}

type BookingColumns = Omit<
  typeof booking.$inferInsert,
  'id' | 'transferId' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** Booking input: `amountCents` is signed (outflow negative); `currency` defaults to the account's. */
export interface BookingInput extends BookingColumns {
  splits: SplitInput[];
}
export type ImportBookingInput = BookingInput & { importKey: string };
export type BookingPatch = Partial<BookingColumns> & { splits?: SplitInput[] };

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  /** Positive; the from leg gets `-amountCents`, the to leg `+amountCents`. */
  amountCents: number;
  /**
   * Envelope of a transfer between a budget and a tracking account; it is put on the budget leg.
   * Refused between two budget accounts (neutral) and between two tracking accounts.
   */
  categoryId?: string | null;
  memo?: string | null;
  status?: BookingRow['status'];
  source?: BookingRow['source'];
  /** Import key of both legs (unique per account, so the same key may be used twice). */
  importKey?: string | null;
  /** Overrides `importKey` for the inflow leg. */
  toImportKey?: string | null;
  projectId?: string | null;
  payeeId?: string | null;
}
export interface TransferResult {
  transferId: string;
  fromBookingId: string;
  toBookingId: string;
}

/** Options of the writes that touch existing bookings. */
export interface WriteOptions {
  /** Allow changing or deleting `reconciled` bookings (they are locked otherwise). */
  unlockReconciled?: boolean;
  /** Owner capture/edit opts into current contact receipts and new shared-category pairs. */
  contactModel?: boolean;
  /** Owner confirmed editing an outlay that a contact repayment allocates (#1108). */
  unlockContactLinked?: boolean;
}

/** Fields of a reconciled booking that stay editable without an unlock (no effect on any figure). */
const FREE_ON_RECONCILED = new Set(['flag', 'memo']);

function assertUnlocked(tx: Executor, rows: readonly BookingRow[], options: WriteOptions): void {
  if (options.unlockReconciled) return;
  const locked = rows.filter((r) => r.status === 'reconciled').map((r) => r.id);
  if (locked.length > 0) throw new ReconciledLockedError(locked);
  const reviewed = rows.filter((r) => bookingReviewedOn(tx, r.id)).map((r) => r.id);
  if (reviewed.length > 0)
    throw new ReconciledLockedError(
      reviewed,
      'Diese Buchung wurde in Prüfen bestätigt. Bitte gib sie ausdrücklich frei.',
    );
}

export interface BookingReadOptions {
  includeDeleted?: boolean;
}
export interface BookingFilter extends BookingReadOptions {
  accountId?: string;
  /** Inclusive `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive `YYYY-MM-DD`. */
  to?: string;
  /** Bookings with at least one split in this category; `null` = an uncategorized split. */
  categoryId?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

function assertDate(date: string): void {
  const parsed = new Date(`${date}T00:00:00Z`);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().startsWith(date);
  if (!valid)
    throw new BookingInvariantError('Bitte ein gültiges Datum im Format YYYY-MM-DD eingeben.');
}

function assertSplits(amountCents: number, splits: readonly SplitInput[]): void {
  if (!isCents(amountCents)) {
    throw new BookingInvariantError('Der Buchungsbetrag muss in ganzen Cent angegeben werden.');
  }
  if (splits.length < 1)
    throw new BookingInvariantError('Die Buchung braucht mindestens eine Aufteilung.');
  let sum = 0;
  for (const s of splits) {
    if (!isCents(s.amountCents)) {
      throw new BookingInvariantError('Jeder Teilbetrag muss in ganzen Cent angegeben werden.');
    }
    sum += s.amountCents;
  }
  if (sum !== amountCents) {
    throw new BookingInvariantError(
      'Die Summe der Teilbeträge muss dem Buchungsbetrag entsprechen.',
    );
  }
}

interface FxFields {
  amountCents?: number | undefined;
  originalAmountCents?: number | null | undefined;
  originalCurrency?: string | null | undefined;
  fxRateMicro?: number | null | undefined;
  fxFeeCents?: number | null | undefined;
}

/**
 * Foreign-currency fields are all set or all empty (the fee defaults to 0 when the others are
 * given) and must reproduce the amount: `amount = round(original × rate / 1e6) + fee`, allowing
 * one cent of rounding. The CHECK constraints guard the shape, this guards the arithmetic.
 */
function normalizeFx<T extends FxFields>(input: T): T {
  const given = [input.originalAmountCents, input.originalCurrency, input.fxRateMicro].filter(
    (v) => v !== undefined && v !== null,
  ).length;
  if (given === 0) {
    if (input.fxFeeCents !== undefined && input.fxFeeCents !== null)
      throw new BookingInvariantError(
        'Eine Wechselgebühr braucht einen Originalbetrag, eine Originalwährung und einen Wechselkurs.',
      );
    return input;
  }
  if (given !== 3) {
    throw new BookingInvariantError(
      'Für eine Fremdwährungsbuchung sind Originalbetrag, Originalwährung und Wechselkurs gemeinsam erforderlich.',
    );
  }
  const fee = input.fxFeeCents ?? 0;
  const original = input.originalAmountCents as number;
  const rate = input.fxRateMicro as number;
  if (!isCents(original) || !isCents(fee))
    throw new BookingInvariantError(
      'Originalbetrag und Wechselgebühr müssen in ganzen Cent angegeben werden.',
    );
  if (!Number.isSafeInteger(rate) || rate <= 0)
    throw new BookingInvariantError(
      'Der Wechselkurs muss in ganzen Millionsteln angegeben werden und größer als null sein.',
    );
  const amount = input.amountCents as number;
  const converted = mulDivRound(original, rate, 1_000_000);
  if (Math.abs(amount - (converted + fee)) > 1) {
    throw new BookingInvariantError(
      'Der Buchungsbetrag passt nicht zum Originalbetrag, Wechselkurs und zur Wechselgebühr.',
    );
  }
  return { ...input, fxFeeCents: fee };
}

/** Keep historical zero lines editable while requiring amounts on newly entered contact shares. */
function assertContactShares(splits: readonly SplitInput[], existing: readonly SplitInput[] = []) {
  const oldZeros = existing.filter((s) => s.contactId && s.amountCents === 0);
  for (const s of splits) {
    if (!s.contactId) continue;
    if (s.incomeTypeId)
      throw new BookingInvariantError('Ein Kontaktanteil darf keine Einnahmenart haben.');
    if (s.amountCents !== 0) continue;
    const previous = oldZeros.findIndex(
      (old) => old.contactId === s.contactId && old.categoryId === s.categoryId,
    );
    if (previous < 0)
      throw new BookingInvariantError('Ein Kontaktanteil braucht einen Betrag ungleich null.');
    oldZeros.splice(previous, 1);
  }
}

/** Categories and contacts referenced by splits (see the invariants at the top). */
function assertSplitRefs(
  tx: Executor,
  splits: readonly SplitInput[],
  allowSharedCategories = false,
  /** Contacts the booking already carried: history of an archived contact stays editable. */
  existingContactIds: ReadonlySet<string> = new Set(),
  contactModel = false,
): void {
  for (const s of splits) {
    if (s.contactId && !existingContactIds.has(s.contactId)) {
      const owner = tx
        .select({ archivedAt: contact.archivedAt, mergedIntoId: contact.mergedIntoId })
        .from(contact)
        .where(and(eq(contact.id, s.contactId), isNull(contact.deletedAt)))
        .get();
      if (!owner)
        throw new BookingInvariantError(
          'Der ausgewählte Kontakt ist nicht verfügbar. Bitte einen anderen Kontakt wählen.',
        );
      if (owner.archivedAt && !owner.mergedIntoId) {
        if (contactModel) throw new BookingContactArchivedError(s.contactId);
        throw new ContactArchivedError(s.contactId);
      }
    }
    const categoryId = s.categoryId ?? null;
    if (s.purposeCategoryId && categoryId === null)
      throw new BookingInvariantError('Ein Zweck ist nur bei der Kategorie „Auslagen“ möglich.');
    if (categoryId === null) {
      if (s.contactId)
        throw new BookingInvariantError('Ein Kontaktanteil braucht die Kategorie „Auslagen“.');
      continue;
    }
    const row = tx
      .select({ kind: category.kind, class: category.class })
      .from(category)
      .where(and(eq(category.id, categoryId), isNull(category.deletedAt)))
      .get();
    if (!row)
      throw new BookingInvariantError(
        'Die ausgewählte Kategorie ist nicht verfügbar. Bitte eine andere Kategorie wählen.',
      );
    if (s.purposeCategoryId) {
      if (row.kind !== 'advance')
        throw new BookingInvariantError('Ein Zweck ist nur bei der Kategorie „Auslagen“ möglich.');
      const purpose = tx
        .select({ kind: category.kind })
        .from(category)
        .where(and(eq(category.id, s.purposeCategoryId), isNull(category.deletedAt)))
        .get();
      if (!purpose || ['advance', 'card_payment', 'income'].includes(purpose.kind))
        throw new BookingInvariantError('Als Zweck ist nur eine Ausgabenkategorie möglich.');
    }
    if (row.kind === 'card_payment') {
      throw new BookingInvariantError(
        'Die Kategorie für die Kartenzahlung wird automatisch befüllt. Bitte die Ausgabenkategorie wählen.',
      );
    }
    if (
      s.contactId &&
      row.kind !== 'advance' &&
      (!allowSharedCategories || row.class === null || row.kind === 'income')
    ) {
      throw new BookingInvariantError(
        'Ein Kontaktanteil braucht eine zulässige Ausgabenkategorie oder die Kategorie „Auslagen“.',
      );
    }
  }
}

function liveAccount(tx: Executor, accountId: string) {
  const row = tx
    .select()
    .from(account)
    .where(and(eq(account.id, accountId), isNull(account.deletedAt)))
    .get();
  if (!row)
    throw new BookingInvariantError(
      'Das ausgewählte Konto ist nicht verfügbar. Bitte ein anderes Konto wählen.',
    );
  return row;
}

function loadBooking(tx: Executor, id: string, includeDeleted = false): BookingRow | undefined {
  return tx
    .select()
    .from(booking)
    .where(and(eq(booking.id, id), includeDeleted ? undefined : isNull(booking.deletedAt)))
    .get();
}

function loadSplits(tx: Executor, bookingId: string): SplitRow[] {
  return tx
    .select()
    .from(bookingSplit)
    .where(eq(bookingSplit.bookingId, bookingId))
    .orderBy(asc(bookingSplit.sortOrder), asc(bookingSplit.id))
    .all();
}

const splitValues = (s: SplitInput) => ({
  categoryId: s.categoryId ?? null,
  amountCents: s.amountCents,
  memo: s.memo ?? null,
  contactId: s.contactId ?? null,
  purposeCategoryId: s.purposeCategoryId ?? null,
  incomeTypeId: s.incomeTypeId ?? null,
});

function assertTransferDateWindow(from: string, to: string): void {
  if (!withinBankWindow(from, to))
    throw new BookingInvariantError(
      'Zwischen Abgang und Eingang einer Umbuchung dürfen höchstens fünf Tage liegen.',
    );
}

/** Which leg of a transfer carries the category (C2): the budget leg, if exactly one is. */
function categoryLegs(
  from: { onBudget: boolean },
  to: { onBudget: boolean },
  categoryId: string | null | undefined,
): { from: string | null; to: string | null } {
  if (!categoryId) return { from: null, to: null };
  if (from.onBudget === to.onBudget) {
    throw new BookingInvariantError(
      from.onBudget
        ? 'Eine Umbuchung zwischen zwei Budgetkonten ist neutral und hat keine Kategorie.'
        : 'Eine Umbuchung zwischen zwei Beobachtungskonten wirkt sich nicht auf das Budget aus und hat keine Kategorie.',
    );
  }
  return from.onBudget ? { from: categoryId, to: null } : { from: null, to: categoryId };
}

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

function insertBooking(
  tx: Executor,
  input: BookingInput,
  transferId: string | null,
  ctx: GroupedContext,
  contactModel = false,
  /** Contact settlement bookings carry the exact owner chosen by their caller (#871). */
  resolveContacts = true,
): string {
  if (resolveContacts)
    input = {
      ...input,
      splits: input.splits.map((s) =>
        s.contactId ? { ...s, contactId: resolveContactForWrite(tx, s.contactId) } : s,
      ),
    };
  assertDate(input.date);
  assertProjectAssignment(tx, input.projectId);
  assertSplits(input.amountCents, input.splits);
  if (contactModel) assertContactShares(input.splits);
  assertSplitRefs(tx, input.splits, contactModel, undefined, contactModel);
  const acct = liveAccount(tx, input.accountId);
  const currency = input.currency ?? acct.currency;
  if (currency !== acct.currency)
    throw new BookingInvariantError('Die Währung der Buchung muss der Kontowährung entsprechen.');
  const id = randomUUID();
  const { splits, ...columns } = normalizeFx(input);
  insertTracked(tx, booking, { ...columns, id, transferId, currency }, ctx);
  const partners: { transferId: string; split: SplitInput; categoryId: string | null }[] = [];
  splits.forEach((s, i) => {
    let splitTransferId: string | null = null;
    let categoryId = s.categoryId ?? null;
    if (s.transferAccountId) {
      if (transferId !== null)
        throw new BookingInvariantError(
          'Eine Umbuchungsseite kann keine weiteren Teilumbuchungen enthalten.',
        );
      if (s.transferAccountId === input.accountId)
        throw new BookingInvariantError('Für eine Teilumbuchung bitte ein anderes Konto wählen.');
      if (s.contactId || s.incomeTypeId)
        throw new BookingInvariantError(
          'Eine Teilumbuchung hat weder einen Kontakt noch eine Einnahmenart.',
        );
      if (s.amountCents === 0)
        throw new BookingInvariantError('Der Betrag einer Teilumbuchung darf nicht null sein.');
      const other = liveAccount(tx, s.transferAccountId);
      if (other.currency !== acct.currency)
        throw new BookingInvariantError(
          'Umbuchungen sind nur zwischen Konten derselben Währung möglich.',
        );
      const legs = categoryLegs(acct, other, s.categoryId);
      splitTransferId = randomUUID();
      tx.insert(transfer).values({ id: splitTransferId }).run();
      categoryId = legs.from;
      partners.push({ transferId: splitTransferId, split: s, categoryId: legs.to });
    }
    insertTracked(
      tx,
      bookingSplit,
      {
        ...splitValues(s),
        categoryId,
        transferId: splitTransferId,
        id: randomUUID(),
        bookingId: id,
        sortOrder: i,
      },
      ctx,
    );
  });
  for (const p of partners) {
    insertBooking(
      tx,
      {
        accountId: p.split.transferAccountId as string,
        date: input.date,
        amountCents: -p.split.amountCents,
        memo: p.split.memo ?? input.memo ?? null,
        status: input.status,
        source: input.source,
        importKey: p.split.transferImportKey ?? null,
        importRunId: input.importRunId ?? null,
        splits: [{ categoryId: p.categoryId, amountCents: -p.split.amountCents }],
      },
      p.transferId,
      ctx,
    );
  }
  return id;
}

/** Only blame the input for an allocation conflict if the unchanged contact ledger can replay. */
export function runBookingWrite<T>(db: Executor, write: (tx: Executor) => T): T {
  try {
    return runInTransaction(db, write);
  } catch (error) {
    if (error instanceof ContactAllocationError) {
      // The failed write has rolled back. Replay the original state only on this error path.
      try {
        assertContactSettlementInvariants(db);
      } catch (storedError) {
        if (storedError instanceof ContactAllocationError)
          throw new BookingIntegrityError('Saved contact allocations could not be replayed');
        throw storedError;
      }
    }
    throw error;
  }
}

/** Create a booking with its splits. Returns the booking id. */
export function createBooking(
  db: Executor,
  input: BookingInput,
  ctx: AuditContext,
  options: WriteOptions = {},
): string {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const incomeNextMonth = input.incomeNextMonth ?? false;
    const id = insertBooking(
      tx,
      { ...input, incomeNextMonth },
      null,
      grouped,
      options.contactModel,
    );
    const parts = loadSplits(tx, id);
    const shared = sharedContactOutlays(tx, parts);
    const sharedIds = new Set(shared.map((s) => s.id));
    const declined = parts.filter((s) => input.splits[s.sortOrder]?.offsetContactCredit === false);
    if (declined.some((s) => !sharedIds.has(s.id)))
      throw new BookingInvariantError(
        'Guthaben kann nur bei einem Ausgabenanteil abgewählt werden.',
      );
    const excluded = new Set(declined.map((s) => s.id));
    // Category-share records pin all outlays in this booking. Exclude standalone lines
    // from provisional use too, so they cannot reduce what is available to category shares.
    if (shared.length)
      for (const s of parts)
        if (s.contactId && s.amountCents < 0 && !sharedIds.has(s.id)) excluded.add(s.id);
    if (options.contactModel) recordContactReceipts(tx, id, grouped, excluded);
    applyContactCredit(tx, id, grouped, { excluded, declined: declined.length > 0 });
    assertLedgerInvariants(tx, relatedTransferBookings(tx, id));
    return id;
  });
}

function preventCreditOffset<T extends { splitId: string }>(
  movements: T[],
  excluded?: ReadonlySet<string>,
) {
  return excluded?.size
    ? movements.map((movement) =>
        excluded.has(movement.splitId) ? { ...movement, creditAllocations: [] } : movement,
      )
    : movements;
}

/** Manual capture uses the same persisted FIFO allocations as the contact receipt form. */
function recordContactReceipts(
  tx: Executor,
  bookingId: string,
  ctx: GroupedContext,
  excluded?: ReadonlySet<string>,
) {
  const cash = loadBooking(tx, bookingId)!;
  const parts = loadSplits(tx, bookingId);
  const receipts = parts.filter((s) => s.contactId && s.amountCents > 0);
  if (!receipts.length) return;
  const acct = liveAccount(tx, cash.accountId);
  if (
    cash.currency !== 'EUR' ||
    !['checking', 'savings', 'cash'].includes(acct.type) ||
    cash.transferId ||
    cash.originalAmountCents !== null
  )
    throw new BookingInvariantError(
      'Für eine Rückzahlung von einem Kontakt bitte ein Giro-, Spar- oder Bargeldkonto in EUR wählen und keine Fremdwährungsdaten angeben.',
    );
  const advanceId = ensureAdvanceCategory(tx, ctx);
  for (const receipt of receipts) {
    if (receipt.categoryId !== advanceId)
      updateTracked(tx, bookingSplit, [receipt.id], { categoryId: advanceId }, ctx);
  }
  const refunds = new Map<string, number>();
  const records = contactCreditRecords(tx);
  for (const receipt of receipts) {
    const statement = contactStatement(
      preventCreditOffset(
        actualContactMovements(tx, receipt.contactId!, undefined, records),
        excluded,
      ),
      savedContactSettlements(tx, receipt.contactId!),
    );
    const plan = statement.receipts.find((r) => r.receiptSplitId === receipt.id)!;
    const id = randomUUID();
    insertTracked(
      tx,
      contactSettlement,
      {
        id,
        contactId: receipt.contactId!,
        bookingId,
        receiptSplitId: receipt.id,
        creditCents: plan.creditCents,
      },
      ctx,
    );
    for (const a of plan.allocations) {
      insertTracked(tx, contactAllocation, { id: randomUUID(), settlementId: id, ...a }, ctx);
      const original = statement.outlays.find((o) => o.splitId === a.outlaySplitId)!;
      if (original.categoryId) {
        if (!acct.onBudget)
          throw new BookingInvariantError(
            'Rückzahlungen für geteilte Ausgaben brauchen ein Budgetkonto.',
          );
        refunds.set(original.categoryId, (refunds.get(original.categoryId) ?? 0) + a.amountCents);
      }
    }
  }
  const returned = [...refunds].map(([categoryId, amountCents]) => ({ categoryId, amountCents }));
  if (returned.length)
    [
      ...returned,
      { categoryId: advanceId, amountCents: -returned.reduce((sum, r) => sum + r.amountCents, 0) },
    ].forEach((s, i) =>
      insertTracked(
        tx,
        bookingSplit,
        {
          id: randomUUID(),
          bookingId,
          sortOrder: parts.length + i,
          ...s,
          memo: 'Rückzahlung in die ursprüngliche Kategorie',
        },
        ctx,
      ),
    );
  saveContactCreditRecord(
    tx,
    { bookingId, repayments: receipts.map((r) => r.id), repaymentRefunds: returned },
    ctx,
  );
}

function sharedContactOutlays(tx: Executor, parts: SplitRow[]) {
  return parts.filter(
    (s) =>
      s.contactId &&
      s.amountCents < 0 &&
      s.categoryId &&
      tx.select().from(category).where(eq(category.id, s.categoryId)).get()?.kind !== 'advance',
  );
}

/** A new shared purchase consumes available credit in the same audit group, without cash. */
function applyContactCredit(
  tx: Executor,
  bookingId: string,
  ctx: GroupedContext,
  choice?: { excluded: ReadonlySet<string>; declined: boolean },
) {
  const parts = loadSplits(tx, bookingId);
  const shared = sharedContactOutlays(tx, parts);
  if (!shared.length) return;
  const records = contactCreditRecords(tx);
  const uses = [...new Set(shared.map((s) => s.contactId!))].flatMap((id) =>
    contactStatement(
      preventCreditOffset(actualContactMovements(tx, id, undefined, records), choice?.excluded),
      savedContactSettlements(tx, id),
    ).creditUses.filter((u) => shared.some((s) => s.id === u.outlaySplitId)),
  );
  const totals = new Map<string, number>();
  for (const use of uses) {
    const categoryId = shared.find((s) => s.id === use.outlaySplitId)!.categoryId!;
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + use.amountCents);
  }
  const refunds = [...totals].map(([categoryId, amountCents]) => ({ categoryId, amountCents }));
  if (refunds.length) {
    const advanceId = ensureAdvanceCategory(tx, ctx);
    const adjustments = [
      ...refunds,
      { categoryId: advanceId, amountCents: -refunds.reduce((sum, r) => sum + r.amountCents, 0) },
    ];
    adjustments.forEach((s, i) =>
      insertTracked(
        tx,
        bookingSplit,
        {
          id: randomUUID(),
          bookingId,
          sortOrder: parts.length + i,
          ...s,
          memo: 'Mit Kontaktguthaben ausgeglichen',
        },
        ctx,
      ),
    );
  }
  saveContactCreditRecord(
    tx,
    { bookingId, uses, refunds, ...(choice?.declined ? { creditOffsetDeclined: true } : {}) },
    ctx,
  );
}

/** Internal settlement path: allocations are persisted by its outer transaction before validation. */
export function createContactSettlementBooking(
  db: Executor,
  input: BookingInput,
  ctx: AuditContext,
): string {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const id = insertBooking(tx, input, null, grouped, false, false);
    assertLedgerInvariants(tx, [id], false);
    return id;
  });
}

/** Create a transfer (Umbuchung): the `transfer` row and two opposite bookings with one split each. */
export function createTransfer(
  db: Executor,
  input: TransferInput,
  ctx: AuditContext,
  options: {
    manualCashBank?: { bankStatus?: ManualBankStatus };
    /** Explicit bank-side facts, including a pending receipt while the debit is confirmed. */
    bankLegs?: {
      from: { date: string; status: ManualBankStatus };
      to: { date: string; status: ManualBankStatus };
    };
  } = {},
): TransferResult {
  const grouped = withGroup(ctx);
  if (!isCents(input.amountCents)) {
    throw new BookingInvariantError('Der Umbuchungsbetrag muss in ganzen Cent angegeben werden.');
  }
  if (input.amountCents <= 0)
    throw new BookingInvariantError('Der Umbuchungsbetrag muss größer als null sein.');
  if (input.fromAccountId === input.toAccountId) {
    throw new BookingInvariantError('Eine Umbuchung braucht zwei unterschiedliche Konten.');
  }
  return runInTransaction(db, (tx) => {
    const from = liveAccount(tx, input.fromAccountId);
    const to = liveAccount(tx, input.toAccountId);
    if (from.currency !== to.currency) {
      throw new BookingInvariantError(
        'Umbuchungen sind nur zwischen Konten derselben Währung möglich.',
      );
    }
    const bankLegs = options.bankLegs;
    if (bankLegs) {
      const bank = (type: string) => type === 'checking' || type === 'savings';
      if (!bank(from.type) || !bank(to.type) || options.manualCashBank?.bankStatus !== undefined)
        throw new BookingInvariantError(
          'Getrennte Buchungsdaten brauchen zwei Bankkonten und je Seite einen eigenen Status.',
        );
      if (bankLegs.from.date < to.openingDate)
        throw new BookingInvariantError(
          'Der Abgang darf nicht vor dem Eröffnungsdatum des Zielkontos liegen.',
        );
      assertTransferDateWindow(bankLegs.from.date, bankLegs.to.date);
    }
    // Only the manual whole-transfer API opts in. Import/operator callers retain their policy.
    const manual = options.manualCashBank
      ? manualTransferStatus(from.type, to.type, options.manualCashBank.bankStatus)
      : null;
    if (options.manualCashBank?.bankStatus !== undefined && !manual) {
      throw new BookingInvariantError(
        'Ein gemeinsamer Bankstatus gilt nur für eine Umbuchung zwischen Bargeld und einem Giro- oder Sparkonto.',
      );
    }
    const legs = categoryLegs(from, to, input.categoryId);
    const transferId = randomUUID();
    tx.insert(transfer).values({ id: transferId }).run();
    const common = {
      date: input.date,
      memo: input.memo ?? null,
      status: input.status,
      source: input.source,
      projectId: input.projectId ?? null,
      payeeId: input.payeeId ?? null,
    };
    const fromBookingId = insertBooking(
      tx,
      {
        ...common,
        ...(manual ? { status: manual.fromStatus } : {}),
        ...(bankLegs ? bankLegs.from : {}),
        accountId: input.fromAccountId,
        amountCents: -input.amountCents,
        importKey: input.importKey ?? null,
        splits: [{ categoryId: legs.from, amountCents: -input.amountCents }],
      },
      transferId,
      grouped,
    );
    const toBookingId = insertBooking(
      tx,
      {
        ...common,
        ...(manual ? { status: manual.toStatus } : {}),
        ...(bankLegs ? bankLegs.to : {}),
        accountId: input.toAccountId,
        amountCents: input.amountCents,
        importKey: input.toImportKey ?? input.importKey ?? null,
        splits: [{ categoryId: legs.to, amountCents: input.amountCents }],
      },
      transferId,
      grouped,
    );
    assertLedgerInvariants(tx, [fromBookingId, toBookingId]);
    return { transferId, fromBookingId, toBookingId };
  });
}

export interface ImportTransferResult extends TransferResult {
  /** `created`: both legs new; `linked`: an existing leg got its missing partner or both got
   * linked; `existing`: the pair was already there (or a leg was deleted by the user). */
  outcome: 'created' | 'linked' | 'existing';
}

/**
 * Idempotent transfer import (C4). Legs are found by `(account, import key)` on both sides
 * (`toImportKey` defaults to `importKey`):
 * - both exist as one transfer, or one of them was deleted by the user: nothing is written;
 * - both exist as plain bookings (imported one file at a time): they are linked into a transfer;
 * - one exists: the missing leg is created and linked (a one-legged pair is repaired);
 * - none exists: the transfer is created.
 */
export function importTransfer(
  db: Executor,
  input: TransferInput & { importKey: string },
  ctx: AuditContext,
): ImportTransferResult {
  const grouped = withGroup(ctx);
  const toKey = input.toImportKey ?? input.importKey;
  return runInTransaction(db, (tx) => {
    const find = (accountId: string, key: string) =>
      tx
        .select()
        .from(booking)
        .where(and(eq(booking.accountId, accountId), eq(booking.importKey, key)))
        .get();
    const fromLeg = find(input.fromAccountId, input.importKey);
    const toLeg = find(input.toAccountId, toKey);
    if (!fromLeg && !toLeg) {
      const created = createTransfer(tx, { source: 'import', ...input }, grouped);
      return { ...created, outcome: 'created' };
    }
    const existing = (a: BookingRow, b: BookingRow): ImportTransferResult => ({
      transferId: (a.transferId ?? b.transferId) as string,
      fromBookingId: a.id,
      toBookingId: b.id,
      outcome: 'existing',
    });
    if (fromLeg && toLeg) {
      if (fromLeg.transferId && fromLeg.transferId === toLeg.transferId)
        return existing(fromLeg, toLeg);
      if (fromLeg.deletedAt || toLeg.deletedAt) return existing(fromLeg, toLeg);
      if (fromLeg.transferId || toLeg.transferId)
        throw new BookingInvariantError('An import leg already belongs to another transfer');
      const transferId = randomUUID();
      tx.insert(transfer).values({ id: transferId }).run();
      for (const leg of [fromLeg, toLeg]) {
        assertStatementBookingWrite(tx, leg.id, 'update', ['transferId']);
        updateTracked(tx, booking, [leg.id], { transferId }, grouped);
      }
      assertLedgerInvariants(tx, [fromLeg.id, toLeg.id]);
      return { transferId, fromBookingId: fromLeg.id, toBookingId: toLeg.id, outcome: 'linked' };
    }
    const found = (fromLeg ?? toLeg) as BookingRow;
    if (found.deletedAt || found.transferId) {
      return {
        transferId: found.transferId ?? '',
        fromBookingId: found.id,
        toBookingId: found.id,
        outcome: 'existing',
      };
    }
    const transferId = randomUUID();
    tx.insert(transfer).values({ id: transferId }).run();
    assertStatementBookingWrite(tx, found.id, 'update', ['transferId']);
    updateTracked(tx, booking, [found.id], { transferId }, grouped);
    const missing = insertBooking(
      tx,
      {
        accountId: fromLeg ? input.toAccountId : input.fromAccountId,
        date: found.date,
        amountCents: -found.amountCents,
        memo: input.memo ?? found.memo,
        status: input.status ?? found.status,
        source: input.source ?? 'import',
        importKey: fromLeg ? toKey : input.importKey,
        splits: [{ amountCents: -found.amountCents }],
      },
      transferId,
      grouped,
    );
    assertLedgerInvariants(tx, [found.id, missing]);
    return {
      transferId,
      fromBookingId: fromLeg ? found.id : missing,
      toBookingId: fromLeg ? missing : found.id,
      outcome: 'linked',
    };
  });
}

/**
 * Idempotent import: when a booking with the same `(accountId, importKey)` exists, even a
 * soft-deleted one, nothing is written and `{ created: false, id }` is returned, so a booking the
 * user deleted is not resurrected. `source` defaults to `import`.
 */
export function importBooking(
  db: Executor,
  input: ImportBookingInput,
  ctx: AuditContext,
): { created: boolean; id: string } {
  if (!input.importKey) throw new BookingInvariantError('An imported booking needs an import key');
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const existing = tx
      .select({ id: booking.id })
      .from(booking)
      .where(and(eq(booking.accountId, input.accountId), eq(booking.importKey, input.importKey)))
      .get();
    if (existing) return { created: false, id: existing.id };
    return { created: true, id: insertBooking(tx, { source: 'import', ...input }, null, grouped) };
  });
}

// ---------------------------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------------------------

/** Bring `current` splits to `next`: in place when the count matches, else replace them all. */
function syncSplits(
  tx: Executor,
  bookingId: string,
  current: SplitRow[],
  next: readonly SplitInput[],
  ctx: GroupedContext,
): void {
  if (current.length === next.length) {
    current.forEach((s, i) => {
      updateTracked(tx, bookingSplit, [s.id], { ...splitValues(next[i]!), sortOrder: i }, ctx);
    });
    return;
  }
  for (const s of current) deleteTracked(tx, bookingSplit, [s.id], ctx);
  next.forEach((s, i) => {
    insertTracked(
      tx,
      bookingSplit,
      { ...splitValues(s), id: randomUUID(), bookingId, sortOrder: i },
      ctx,
    );
  });
}

/**
 * Patch a booking and optionally replace its splits. The split sum is re-validated. Without
 * `splits`, an amount change moves a single split along and is refused for several splits. On a
 * transfer leg, `amountCents` is mirrored to the partner leg (opposite amount). Date edits
 * move both legs unless the bank pair already has different dates. Flipping the sign or
 * moving a leg to another account is refused.
 */
function updateBookingImpl(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
  options: WriteOptions = {},
  tradeNative = false,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    assertStatementBookingWrite(
      tx,
      id,
      'update',
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k),
    );
    if (!tradeNative)
      assertTradeSettlementBookingWrite(
        tx,
        id,
        'update',
        Object.entries(patch)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key),
      );
    assertContactBookingWrite(
      tx,
      id,
      'update',
      Object.entries(patch)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k),
      { unlockLinked: options.unlockContactLinked ?? false, groupId: grouped.groupId },
    );
    // Reconciled bookings: only flag and memo are free; a status change also needs the unlock.
    const touchesLocked = Object.entries(patch).some(
      ([key, value]) => value !== undefined && !FREE_ON_RECONCILED.has(key),
    );
    if (touchesLocked) assertUnlocked(tx, [cur], options);
    const curSplits = loadSplits(tx, id);
    // Split-level transfers are changed by deleting and re-creating them, on both sides.
    const splitTransfer =
      curSplits.some((s) => s.transferId) ||
      (cur.transferId !== null &&
        tx.select().from(bookingSplit).where(eq(bookingSplit.transferId, cur.transferId)).get());
    if (
      splitTransfer &&
      (patch.splits !== undefined ||
        (patch.amountCents !== undefined && patch.amountCents !== cur.amountCents) ||
        (patch.date !== undefined && patch.date !== cur.date) ||
        (patch.accountId !== undefined && patch.accountId !== cur.accountId))
    ) {
      throw new BookingInvariantError(
        'Betrag, Datum und Konto einer Teilumbuchung bleiben fest. Bitte die Buchung löschen und neu erfassen.',
      );
    }
    if (patch.splits?.some((s) => s.transferAccountId))
      throw new BookingInvariantError(
        'Teilumbuchungen können nur beim Anlegen der Buchung hinzugefügt werden.',
      );

    if (patch.projectId !== undefined && patch.projectId !== cur.projectId)
      assertProjectAssignment(tx, patch.projectId);
    if (patch.date !== undefined) assertDate(patch.date);
    const target = liveAccount(tx, patch.accountId ?? cur.accountId);
    if (patch.accountId !== undefined && patch.accountId !== cur.accountId) {
      if (cur.transferId)
        throw new BookingInvariantError(
          'Eine Umbuchungsseite kann nicht auf ein anderes Konto verschoben werden.',
        );
      // Amounts are cents of the account's currency: a move cannot convert them.
      if (target.currency !== cur.currency) {
        throw new BookingInvariantError(
          `Eine Buchung in ${cur.currency} kann nicht auf ein Konto in ${target.currency} verschoben werden. Bitte dort neu buchen.`,
        );
      }
    }
    const currency = patch.currency ?? cur.currency;
    if (currency !== target.currency)
      throw new BookingInvariantError('Die Währung der Buchung muss der Kontowährung entsprechen.');

    const amount = patch.amountCents ?? cur.amountCents;
    const amountChanged = amount !== cur.amountCents;
    let nextSplits: SplitInput[];
    if (patch.splits) {
      // New contact references resolve to the merge target; ones the booking already had stay.
      // A booking that already carries the source id may add another split under it: the identity
      // statement is the union of both ids, so totals are equal either way (#871, pinned by test).
      const had = new Set(curSplits.flatMap((old) => (old.contactId ? [old.contactId] : [])));
      nextSplits = patch.splits.map((s) =>
        s.contactId && !had.has(s.contactId)
          ? { ...s, contactId: resolveContactForWrite(tx, s.contactId) }
          : s,
      );
    } else if (amountChanged && curSplits.length === 1) {
      nextSplits = [{ ...curSplits[0]!, amountCents: amount }];
    } else if (amountChanged) {
      throw new BookingInvariantError(
        'Wenn sich der Buchungsbetrag ändert, bitte die Teilbeträge neu angeben.',
      );
    } else {
      nextSplits = curSplits;
    }
    if (patch.splits || amountChanged) assertSplits(amount, nextSplits);
    if (options.contactModel && (patch.splits || amountChanged))
      assertContactShares(nextSplits, curSplits);
    if (patch.splits) {
      // Legacy operator edits cannot silently promote historical splits into the new model.
      for (const split of nextSplits) {
        const sharedCategory =
          options.contactModel ||
          curSplits.some(
            (old) => old.contactId === split.contactId && old.categoryId === split.categoryId,
          );
        assertSplitRefs(
          tx,
          [split],
          sharedCategory,
          new Set(curSplits.flatMap((old) => (old.contactId ? [old.contactId] : []))),
          options.contactModel,
        );
      }
    }
    const fx = normalizeFx({ ...cur, ...patch, amountCents: amount });

    // Project-only attribution keeps every other field and related record intact. In particular,
    // do not backfill bankRawText or refresh expected links through the general edit path.
    // The metadata guards, explicit reconciliation unlock and project validation above still apply.
    if (
      patch.projectId !== undefined &&
      Object.entries(patch).every(([key, value]) => value === undefined || key === 'projectId')
    ) {
      // Attribution cannot change contact settlements; avoid validating the entire contact ledger
      // for every metadata edit. Keep the booking/transfer checks and all write guards above.
      assertLedgerInvariants(tx, relatedTransferBookings(tx, id), false);
      updateTracked(tx, booking, [id], { projectId: patch.projectId }, grouped);
      return;
    }

    if (cur.transferId) {
      const partner = tx
        .select()
        .from(booking)
        .where(
          and(
            eq(booking.transferId, cur.transferId),
            ne(booking.id, id),
            isNull(booking.deletedAt),
          ),
        )
        .get();
      if (!partner) throw new BookingIntegrityError('A transfer has no second live leg');
      // Equal-date transfers move together; independently dated bank legs keep their own date.
      const partnerAccount = tx
        .select()
        .from(account)
        .where(eq(account.id, partner.accountId))
        .get();
      const bank = (type: string | undefined) => type === 'checking' || type === 'savings';
      const independentDates =
        cur.date !== partner.date && bank(target.type) && bank(partnerAccount?.type);
      if (patch.date !== undefined && independentDates) {
        const debitDate = cur.amountCents < 0 ? patch.date : partner.date;
        const receiptDate = cur.amountCents > 0 ? patch.date : partner.date;
        const debitAccount = cur.amountCents < 0 ? target : partnerAccount!;
        const receiptAccount = cur.amountCents > 0 ? target : partnerAccount!;
        if (debitDate < debitAccount.openingDate || debitDate < receiptAccount.openingDate)
          throw new BookingInvariantError(
            'Der Abgang darf nicht vor dem Er\u00f6ffnungsdatum eines beteiligten Kontos liegen.',
          );
        if (debitDate > receiptDate)
          throw new BookingInvariantError('Der Abgang darf nicht nach dem Eingang liegen.');
        assertTransferDateWindow(debitDate, receiptDate);
      }
      if (!tradeNative)
        assertTradeSettlementBookingWrite(
          tx,
          partner.id,
          'update',
          Object.keys(patch).filter((key) => key === 'date' || key === 'amountCents'),
        );
      // Preserve the existing pair lock for date and amount edits.
      // Independently dated bank legs keep their own date, so the partner stays untouched (#1195).
      if ((patch.date !== undefined && !independentDates) || amountChanged)
        assertUnlocked(tx, [partner], options);
      const partnerPatch: Record<string, unknown> = {};
      if (patch.date !== undefined && !independentDates) partnerPatch['date'] = patch.date;
      if (amountChanged) {
        if (amount === 0 || Math.sign(amount) !== Math.sign(cur.amountCents)) {
          throw new BookingInvariantError(
            'Eine Umbuchung braucht einen Betrag ungleich null. Zum Umkehren bitte löschen und neu erfassen.',
          );
        }
        partnerPatch['amountCents'] = -amount;
        const partnerSplits = loadSplits(tx, partner.id);
        if (partnerSplits.length !== 1) {
          throw new BookingInvariantError(
            'Die Gegenbuchung hat mehrere Teilbeträge. Bitte dort ändern.',
          );
        }
        syncSplits(
          tx,
          partner.id,
          partnerSplits,
          [{ ...partnerSplits[0]!, amountCents: -amount }],
          grouped,
        );
      }
      updateTracked(tx, booking, [partner.id], partnerPatch, grouped);
    }

    const columns: Record<string, unknown> = { ...patch };
    if (
      cur.source === 'bank' &&
      cur.bankRawText === null &&
      !cur.importKey?.startsWith('bank-transfer:')
    )
      columns['bankRawText'] = cur.memo;
    if (
      patch.incomeNextMonth === undefined &&
      patch.splits &&
      cur.source === 'bank' &&
      curSplits.every((s) => !s.categoryId && !s.incomeTypeId && !s.contactId && !s.transferId)
    ) {
      columns['incomeNextMonth'] = bookingIncomeDefault(tx, {
        amountCents: amount,
        payeeId: patch.payeeId === undefined ? cur.payeeId : patch.payeeId,
        splits: nextSplits,
      });
    }
    delete columns['splits'];
    if (fx.fxFeeCents !== cur.fxFeeCents) columns['fxFeeCents'] = fx.fxFeeCents;
    updateTracked(tx, booking, [id], columns, grouped);
    if (patch.splits || amountChanged) syncSplits(tx, id, curSplits, nextSplits, grouped);
    if (patch.splits || amountChanged || patch.date !== undefined) {
      if (
        options.contactModel &&
        !tx.select().from(contactSettlement).where(eq(contactSettlement.bookingId, id)).get()
      )
        recordContactReceipts(tx, id, grouped);
      const existingCredit = contactCreditRecords(tx).find((r) => r.bookingId === id);
      // An edit without a new credit choice retains the recorded allocations, including none.
      if (
        !existingCredit?.uses?.length &&
        !existingCredit?.decision &&
        !existingCredit?.creditOffsetDeclined
      )
        applyContactCredit(tx, id, grouped);
    }
    const touchedBookings = relatedTransferBookings(tx, id);
    assertLedgerInvariants(tx, touchedBookings);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(tx, touchedBookings))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
    if (
      cur.source === 'bank' &&
      !cur.transferId &&
      patch.payeeId &&
      patch.payeeId !== cur.payeeId
    ) {
      const raw = cur.bankRawPayee || cur.bankRawText || cur.memo || '';
      learnBankPayee(tx, cur.bankSourceId ?? '', raw, patch.payeeId, grouped);
    }
    if (
      ctx.actor === 'owner' &&
      (cur.status === 'pending' ||
        curSplits.some((s) => !s.categoryId && !s.incomeTypeId && s.amountCents !== 0)) &&
      ((patch.status === 'confirmed' && nextSplits.some((s) => s.categoryId || s.incomeTypeId)) ||
        patch.splits ||
        patch.payeeId !== undefined ||
        patch.accountId !== undefined)
    )
      learnInboxAssignment(tx, id, grouped);
    else if (
      ctx.actor === 'owner' &&
      cur.source === 'bank' &&
      cur.transferId &&
      cur.status === 'pending' &&
      patch.status === 'confirmed'
    )
      learnInboxAssignment(tx, id, grouped);
  });
}

/** Owner-selected bank transfer, retaining the original booking identity and source history. */
export function markBankBookingTransfer(
  db: Executor,
  id: string,
  targetAccountId: string,
  categoryId: string | null,
  ctx: AuditContext,
  counterpartId?: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const row = loadBooking(tx, id);
    if (
      !row ||
      row.source !== 'bank' ||
      row.status === 'reconciled' ||
      row.transferId ||
      row.amountCents === 0 ||
      loadSplits(tx, id).some((s) => s.transferId || s.contactId)
    )
      throw new BookingInvariantError(
        'Nur ungeprüfte Bankbuchungen ohne bestehende Umbuchung wählen.',
      );
    assertContactBookingWrite(tx, id, 'update', ['transferId', 'splits']);
    assertStatementBookingWrite(tx, id, 'update', ['transferId', 'splits']);
    assertTradeSettlementBookingWrite(tx, id, 'update', ['transferId', 'splits']);
    const source = liveAccount(tx, row.accountId),
      target = liveAccount(tx, targetAccountId);
    if (source.id === target.id || source.currency !== target.currency)
      throw new BookingInvariantError('Umbuchung benötigt zwei Konten derselben Währung.');
    const legs = categoryLegs(source, target, categoryId);
    // Exact date/currency/amount matching is usable only when there is one unclassified bank leg.
    const candidates = tx
      .select({ candidate: bankSyncCandidate })
      .from(bankSyncCandidate)
      .innerJoin(inboxItem, eq(inboxItem.id, bankSyncCandidate.id))
      .where(
        and(
          eq(bankSyncCandidate.accountId, targetAccountId),
          eq(bankSyncCandidate.date, row.date),
          eq(bankSyncCandidate.amountCents, -row.amountCents),
          eq(bankSyncCandidate.currency, row.currency),
          isNull(inboxItem.resolvedAt),
        ),
      )
      .all()
      .map((r) => r.candidate);
    const livePartners = tx
      .select()
      .from(booking)
      .where(
        and(
          eq(booking.accountId, targetAccountId),
          eq(booking.date, row.date),
          eq(booking.amountCents, -row.amountCents),
          eq(booking.source, 'bank'),
          isNull(booking.transferId),
          isNull(booking.deletedAt),
        ),
      )
      .all()
      .filter(
        (b) =>
          b.status !== 'reconciled' &&
          loadSplits(tx, b.id).every(
            (s) => !s.categoryId && !s.contactId && !s.transferId && !s.incomeTypeId,
          ),
      );
    const candidatePartners = candidates.filter(
      (c) => !livePartners.some((b) => b.importKey === 'bank-sync:' + c.dedupeKey),
    );
    if (!counterpartId && livePartners.length + candidatePartners.length > 1)
      throw new BookingInvariantError(
        'Mehrere Gegenumsätze passen. Bitte die Buchungen einzeln prüfen.',
      );
    counterpartId ??= livePartners[0]?.id;
    const stagedPartner = candidates[0];
    const partnerKey = stagedPartner
      ? 'bank-sync:' + stagedPartner.dedupeKey
      : 'bank-transfer:' + id;
    updateBooking(
      tx,
      id,
      { payeeId: null, splits: [{ amountCents: row.amountCents, categoryId: legs.from }] },
      grouped,
    );
    const transferId = randomUUID();
    tx.insert(transfer).values({ id: transferId }).run();
    let otherId: string;
    if (counterpartId) {
      const other = loadBooking(tx, counterpartId);
      if (
        !other ||
        other.source !== 'bank' ||
        other.status === 'reconciled' ||
        other.transferId ||
        other.accountId !== targetAccountId ||
        other.amountCents !== -row.amountCents ||
        other.date !== row.date ||
        loadSplits(tx, counterpartId).some((s) => s.contactId || s.transferId)
      )
        throw new BookingInvariantError('Gegenbuchung passt nicht.');
      updateBooking(
        tx,
        counterpartId,
        { payeeId: null, splits: [{ amountCents: other.amountCents, categoryId: legs.to }] },
        grouped,
      );
      updateTracked(tx, booking, [counterpartId], { transferId }, grouped);
      otherId = counterpartId;
    } else {
      const old = tx
        .select()
        .from(booking)
        .where(and(eq(booking.accountId, targetAccountId), eq(booking.importKey, partnerKey)))
        .get();
      if (old && !old.deletedAt)
        throw new BookingInvariantError('Eine Gegenbuchung besteht bereits.');
      if (old) {
        updateTracked(
          tx,
          booking,
          [old.id],
          {
            deletedAt: null,
            transferId,
            amountCents: -row.amountCents,
            date: row.date,
            memo: stagedPartner?.memo ?? row.memo,
            status: row.status,
            bankRawText: stagedPartner?.memo ?? null,
            bankRawPayee: stagedPartner?.rawPayee ?? null,
            bankSourceId: stagedPartner?.sourceId ?? null,
          },
          grouped,
          'restore',
        );
        syncSplits(
          tx,
          old.id,
          loadSplits(tx, old.id),
          [{ amountCents: -row.amountCents, categoryId: legs.to }],
          grouped,
        );
        otherId = old.id;
      } else
        otherId = insertBooking(
          tx,
          {
            accountId: targetAccountId,
            date: row.date,
            amountCents: -row.amountCents,
            currency: target.currency,
            source: 'bank',
            status: row.status,
            memo: row.memo,
            importKey: partnerKey,
            bankRawText: stagedPartner?.memo ?? null,
            bankRawPayee: stagedPartner?.rawPayee ?? null,
            bankSourceId: stagedPartner?.sourceId ?? null,
            splits: [{ amountCents: -row.amountCents, categoryId: legs.to }],
          },
          transferId,
          grouped,
        );
    }
    updateTracked(tx, booking, [id], { transferId }, grouped);
    assertLedgerInvariants(tx, [id, otherId]);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(tx, [id, otherId]))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
    if (stagedPartner)
      updateTracked(
        tx,
        inboxItem,
        [stagedPartner.id],
        { resolvedAt: new Date().toISOString(), resolution: 'Bestätigt: ' + otherId },
        grouped,
      );
    // A confirmed bank line moved to an own account teaches the same rule as a categorised one.
    if (grouped.actor === 'owner' && row.status === 'confirmed')
      learnInboxAssignment(tx, id, grouped);
    return { bookingId: id, counterpartId: otherId, groupId: grouped.groupId };
  });
}

/** Generic booking updates may change metadata on trade cash, but not its financial shape. */
export function updateBooking(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  updateBookingImpl(db, id, patch, ctx, options);
}

/** Internal repository path used only by trade writes to update their own settlement. */
export function updateTradeSettlementBooking(
  db: Executor,
  id: string,
  patch: BookingPatch,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  updateBookingImpl(db, id, patch, ctx, options, true);
}

// ---------------------------------------------------------------------------------------------
// Delete / restore
// ---------------------------------------------------------------------------------------------

/** The booking and every booking of its transfers (both kinds of legs): they go together. */
const transferLegs = (tx: Executor, row: BookingRow): BookingRow[] =>
  connectedTransferBookings(tx, row.id).map((legId) => loadBooking(tx, legId, true) as BookingRow);

/** Soft-delete a booking; both legs of a transfer go together. Splits stay but are ignored. */
function deleteBookingImpl(
  db: Executor,
  id: string,
  ctx: AuditContext,
  options: WriteOptions = {},
  tradeNative = false,
): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id);
    if (!cur) throw new EntityNotFoundError('booking', id);
    const legs = transferLegs(tx, cur);
    if (!tradeNative)
      for (const leg of legs) assertTradeSettlementBookingWrite(tx, leg.id, 'delete');
    for (const leg of legs)
      assertContactBookingWrite(tx, leg.id, 'delete', [], {
        unlockLinked: options.unlockContactLinked ?? false,
        groupId: grouped.groupId,
      });
    for (const leg of legs) assertStatementBookingWrite(tx, leg.id, 'delete');
    assertUnlocked(
      tx,
      legs.filter((l) => l.deletedAt === null),
      options,
    );
    const deletedAt = new Date().toISOString();
    for (const leg of legs) {
      if (leg.deletedAt === null)
        updateTracked(tx, booking, [leg.id], { deletedAt }, grouped, 'delete');
    }
    assertContactSettlementInvariants(tx);
    assertStatementSettlementInvariants(tx);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(
      tx,
      legs.map((leg) => leg.id),
    ))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
  });
}

export function deleteBooking(
  db: Executor,
  id: string,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  deleteBookingImpl(db, id, ctx, options);
}

/** Internal repository path used only by trade writes to delete their own settlement. */
export function deleteTradeSettlementBooking(
  db: Executor,
  id: string,
  ctx: AuditContext,
  options: WriteOptions = {},
): void {
  deleteBookingImpl(db, id, ctx, options, true);
}

/** Restore a soft-deleted booking (and the deleted legs of its transfer). */
export function restoreBooking(db: Executor, id: string, ctx: AuditContext): void {
  const grouped = withGroup(ctx);
  runInTransaction(db, (tx) => {
    const cur = loadBooking(tx, id, true);
    if (!cur) throw new EntityNotFoundError('booking', id);
    if (cur.deletedAt === null) throw new BookingInvariantError(`Booking ${id} is not deleted`);
    assertContactBookingWrite(tx, id, 'restore');
    assertStatementBookingWrite(tx, id, 'restore');
    assertTradeSettlementBookingWrite(tx, id, 'restore');
    assertCounterTransferRestore(tx, cur);
    for (const leg of transferLegs(tx, cur)) {
      assertCounterTransferRestore(tx, leg);
      assertTradeSettlementBookingWrite(tx, leg.id, 'restore');
      if (leg.deletedAt !== null)
        updateTracked(tx, booking, [leg.id], { deletedAt: null }, grouped, 'restore');
    }
    const touchedBookings = connectedTransferBookings(tx, id);
    assertLedgerInvariants(tx, touchedBookings);
    for (const { id: occurrenceId, patch } of expectedLinkPatches(tx, touchedBookings))
      updateTracked(tx, expectedOccurrence, [occurrenceId], patch, grouped);
  });
}

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** One booking with its splits; soft-deleted only with `includeDeleted`. */
export function getBooking(
  db: Executor,
  id: string,
  options: BookingReadOptions = {},
): BookingWithSplits | undefined {
  const row = loadBooking(db, id, options.includeDeleted);
  return row ? { ...row, splits: loadSplits(db, id) } : undefined;
}

/** Bookings with splits, ordered by date then id; one query (bookings left-joined to splits). */
export function listBookings(db: Executor, filter: BookingFilter = {}): BookingWithSplits[] {
  const conditions: (SQL | undefined)[] = [
    filter.includeDeleted ? undefined : isNull(booking.deletedAt),
    filter.accountId === undefined ? undefined : eq(booking.accountId, filter.accountId),
    filter.from === undefined ? undefined : gte(booking.date, filter.from),
    filter.to === undefined ? undefined : lte(booking.date, filter.to),
  ];
  if (filter.categoryId !== undefined) {
    conditions.push(
      inArray(
        booking.id,
        db
          .select({ id: bookingSplit.bookingId })
          .from(bookingSplit)
          .where(
            filter.categoryId === null
              ? isNull(bookingSplit.categoryId)
              : eq(bookingSplit.categoryId, filter.categoryId),
          ),
      ),
    );
  }
  const rows = db
    .select({ booking, split: bookingSplit })
    .from(booking)
    .leftJoin(bookingSplit, eq(bookingSplit.bookingId, booking.id))
    .where(and(...conditions))
    .orderBy(asc(booking.date), asc(booking.id), asc(bookingSplit.sortOrder), asc(bookingSplit.id))
    .all();
  const result: BookingWithSplits[] = [];
  for (const { booking: b, split } of rows) {
    let last = result.at(-1);
    if (last?.id !== b.id) {
      last = { ...b, splits: [] };
      result.push(last);
    }
    if (split) last.splits.push(split);
  }
  return result;
}

/** Archived projects retain their ledger, but cannot receive a new attribution. */
function assertProjectAssignment(tx: Executor, id: string | null | undefined) {
  if (!id) return;
  const row = tx
    .select()
    .from(project)
    .where(and(eq(project.id, id), isNull(project.deletedAt), isNull(project.archivedAt)))
    .get();
  if (!row)
    throw new BookingInvariantError('Projekt ist nicht aktiv. Bitte ein aktives Projekt wählen.');
}
