import { randomUUID } from 'node:crypto';
import {
  addDays,
  allocateContactReceipt,
  contactStatement,
  type ContactAllocation,
} from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import {
  account,
  bookingSplit,
  category,
  contact,
  contactAllocation,
  contactSettlement,
  incomeType,
  INCOME_TYPES,
} from '../schema';
import { insertTracked, withGroup, type AuditContext } from './audit';
import {
  createBooking,
  createContactSettlementBooking,
  getBooking,
  updateBooking,
  type SplitInput,
} from './bookings';
import { ensureAdvanceCategory } from './categories';
import { saveContactCreditRecord } from './contact-credit';
import {
  actualContactMovements,
  assertContactSettlementInvariants,
  savedContactSettlements,
} from './contact-invariants';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';

export function getContactStatement(db: Executor, id: string, asOf: string) {
  const row = db
    .select()
    .from(contact)
    .where(and(eq(contact.id, id), isNull(contact.deletedAt)))
    .get();
  if (!row) throw new EntityNotFoundError('contact', id);
  const movements = actualContactMovements(db, id, asOf);
  if (movements.some((m) => m.currency !== 'EUR'))
    throw new BookingInvariantError('Contact statements require EUR movements');
  return {
    contact: { id: row.id, name: row.name, note: row.note },
    asOf,
    currency: 'EUR' as const,
    ...contactStatement(movements, savedContactSettlements(db, id, asOf)),
  };
}

export function listContactStatements(db: Executor, asOf: string, history = false) {
  return db
    .select()
    .from(contact)
    .where(isNull(contact.deletedAt))
    .all()
    .map((c) => {
      const s = getContactStatement(db, c.id, asOf);
      return {
        ...s.contact,
        balanceCents: s.balanceCents,
        creditCents: s.creditCents,
        receivableCents: s.outlays.reduce((sum, o) => sum + o.remainingCents, 0),
      };
    })
    .filter((c) => history || c.receivableCents !== 0 || c.creditCents !== 0);
}

/** One reminder per contact with a still-open actual outlay older than 30 calendar days. */
export function readOverdueContactReminders(db: Executor, today: string) {
  const cutoff = addDays(today, -30);
  const items: {
    contactId: string;
    contactName: string;
    oldestDate: string;
    overdueCents: number;
  }[] = [];
  let unavailableCount = 0;
  for (const row of db
    .select({ id: contact.id })
    .from(contact)
    .where(isNull(contact.deletedAt))
    .all()) {
    let statement: ReturnType<typeof getContactStatement>;
    try {
      statement = getContactStatement(db, row.id, today);
    } catch (error) {
      if (
        error instanceof BookingInvariantError &&
        error.message === 'Contact statements require EUR movements'
      ) {
        unavailableCount++;
        continue;
      }
      throw error;
    }
    const overdue = statement.outlays.filter(
      (outlay) => outlay.remainingCents > 0 && outlay.date < cutoff,
    );
    if (!overdue.length) continue;
    items.push({
      contactId: row.id,
      contactName: statement.contact.name,
      oldestDate: overdue[0]!.date,
      overdueCents: overdue.reduce((sum, outlay) => sum + outlay.remainingCents, 0),
    });
  }
  return { items, unavailableCount };
}

export interface ContactReceiptInput {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
  allocations?: ContactAllocation[];
}

/** Explicit decision on one remaining receipt lot; never sweeps older or unrelated credit. */
export function chooseContactCredit(
  db: Executor,
  contactId: string,
  input: {
    receiptSplitId: string;
    amountCents: number;
    date: string;
    choice: 'free' | 'category' | 'gift';
    categoryId?: string;
    accountId?: string;
  },
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = getContactStatement(tx, contactId, today);
    const dated = getContactStatement(tx, contactId, input.date);
    const credit = current.credits.find((c) => c.receiptSplitId === input.receiptSplitId);
    const available = dated.credits.find((c) => c.receiptSplitId === input.receiptSplitId);
    if (
      input.date > today ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      !credit ||
      !available ||
      input.amountCents > credit.remainingCents ||
      input.amountCents > available.remainingCents
    )
      throw new BookingInvariantError('Das gewählte Kontaktguthaben ist nicht mehr verfügbar.');
    const sourceSplit = tx
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.id, input.receiptSplitId))
      .get()!;
    const source = getBooking(tx, sourceSplit.bookingId)!;
    const cash = tx
      .select()
      .from(account)
      .where(
        eq(
          account.id,
          input.choice === 'gift' ? (input.accountId ?? source.accountId) : source.accountId,
        ),
      )
      .get();
    if (
      !cash ||
      cash.deletedAt ||
      input.date < cash.openingDate ||
      (input.choice === 'gift' && (cash.closedAt || !cash.onBudget)) ||
      cash.currency !== 'EUR' ||
      !['checking', 'savings', 'cash'].includes(cash.type)
    )
      throw new BookingInvariantError(
        'Für diese Entscheidung ist ein offenes EUR-Budgetkonto erforderlich.',
      );
    const categoryId = input.choice === 'category' ? input.categoryId : null;
    if (input.choice === 'category') {
      const target =
        categoryId && tx.select().from(category).where(eq(category.id, categoryId)).get();
      if (
        !target ||
        target.deletedAt ||
        target.class === null ||
        ['advance', 'income', 'card_payment'].includes(target.kind)
      )
        throw new BookingInvariantError('Bitte eine Ausgabenkategorie für das Guthaben wählen.');
    }
    const advanceId = ensureAdvanceCategory(tx, grouped);
    const memo =
      input.choice === 'gift'
        ? 'Geschenk erhalten'
        : categoryId
          ? 'Kontaktguthaben vorgemerkt'
          : 'Freies Kontaktguthaben';
    const bookingId = createContactSettlementBooking(
      tx,
      {
        accountId: cash.id,
        date: input.date,
        amountCents: 0,
        status: 'confirmed',
        memo,
        splits: [
          { categoryId: advanceId, contactId, amountCents: -input.amountCents, memo },
          input.choice === 'gift'
            ? { incomeTypeId: INCOME_TYPES.other.id, amountCents: input.amountCents, memo }
            : { categoryId: advanceId, contactId, amountCents: input.amountCents, memo },
        ],
      },
      grouped,
    );
    const parts = getBooking(tx, bookingId)!.splits;
    saveContactCreditRecord(
      tx,
      {
        bookingId,
        decision: {
          debitSplitId: parts[0]!.id,
          sourceSplitId: input.receiptSplitId,
          ...(input.choice !== 'gift' ? { creditSplitId: parts[1]!.id } : {}),
          categoryId: categoryId ?? null,
        },
      },
      grouped,
    );
    assertContactSettlementInvariants(tx);
    return { bookingId, groupId: grouped.groupId };
  });
}

export interface ContactWriteOffInput {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
  categoryId?: string | null;
  incomeTypeId?: string | null;
}

/** Reclassify the chosen source share, keeping its original date and every bank amount. */
export function convertContactOutlayToGift(
  db: Executor,
  contactId: string,
  outlaySplitId: string,
  input: { amountCents: number; categoryId: string },
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const outlay = getContactStatement(tx, contactId, today).outlays.find(
      (o) => o.splitId === outlaySplitId,
    );
    if (
      !outlay ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > outlay.remainingCents
    )
      throw new BookingInvariantError(
        'Bitte eine aktuell offene Auslage und höchstens deren offenen Betrag wählen.',
      );
    const expense = tx
      .select()
      .from(category)
      .where(and(eq(category.id, input.categoryId), isNull(category.deletedAt)))
      .get();
    if (
      !expense ||
      expense.class === null ||
      ['advance', 'income', 'card_payment'].includes(expense.kind)
    )
      throw new BookingInvariantError(
        'Bitte eine eigene Ausgabenkategorie für das Geschenk wählen.',
      );
    const source = getBooking(tx, outlay.bookingId)!;
    if (source.transferId || source.splits.some((s) => s.transferId))
      throw new BookingInvariantError(
        'Diese Auslage ist mit einer Umbuchung verknüpft. Bitte die Ursprungsbuchung öffnen.',
      );
    const splits: SplitInput[] = source.splits.map((s) => ({
      amountCents: s.amountCents,
      categoryId: s.categoryId,
      contactId: s.contactId,
      incomeTypeId: s.incomeTypeId,
      memo: s.memo,
    }));
    const index = source.splits.findIndex((s) => s.id === outlaySplitId);
    const selected = splits[index]!;
    if (input.amountCents === -selected.amountCents) {
      splits[index] = {
        amountCents: selected.amountCents,
        categoryId: input.categoryId,
        memo: selected.memo ?? null,
      };
    } else {
      splits[index] = { ...selected, amountCents: selected.amountCents + input.amountCents };
      splits.push({
        amountCents: -input.amountCents,
        categoryId: input.categoryId,
        memo: selected.memo ?? null,
      });
    }
    // The ordinary writer retains reconciled, contact-allocation, receipt and transfer guards.
    updateBooking(tx, source.id, { splits }, grouped);
    return {
      bookingId: source.id,
      date: source.date,
      amountCents: input.amountCents,
      groupId: grouped.groupId,
    };
  });
}

/** Reclassify an existing contact share; the ordinary zero booking is deletable and undoable. */
export function writeOffContact(
  db: Executor,
  contactId: string,
  input: ContactWriteOffInput,
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const current = getContactStatement(tx, contactId, today).balanceCents;
    const dated = getContactStatement(tx, contactId, input.date).balanceCents;
    if (
      input.date > today ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      Math.sign(current) !== Math.sign(dated) ||
      input.amountCents > Math.abs(current) ||
      input.amountCents > Math.abs(dated)
    )
      throw new BookingInvariantError(
        'Der Betrag darf den offenen Kontaktsaldo nicht übersteigen.',
      );
    const cash = tx
      .select()
      .from(account)
      .where(and(eq(account.id, input.accountId), isNull(account.deletedAt)))
      .get();
    if (
      !cash ||
      cash.closedAt !== null ||
      !cash.onBudget ||
      cash.currency !== 'EUR' ||
      !['checking', 'savings', 'cash'].includes(cash.type) ||
      input.date < cash.openingDate
    )
      throw new BookingInvariantError('Bitte ein offenes EUR-Budgetkonto wählen.');
    const contactAmount = Math.sign(current) * input.amountCents;
    let counter: SplitInput;
    if (current < 0) {
      const typeId = input.incomeTypeId ?? INCOME_TYPES.other.id;
      const type = tx
        .select()
        .from(incomeType)
        .where(and(eq(incomeType.id, typeId), isNull(incomeType.deletedAt)))
        .get();
      if (input.categoryId || !type || typeId === INCOME_TYPES.capital.id)
        throw new BookingInvariantError('Bitte eine Einnahmenart außer Kapitalerträge wählen.');
      counter = { incomeTypeId: typeId, amountCents: -contactAmount };
    } else {
      const expense =
        input.categoryId &&
        tx
          .select()
          .from(category)
          .where(and(eq(category.id, input.categoryId), isNull(category.deletedAt)))
          .get();
      if (
        !expense ||
        expense.class === null ||
        ['advance', 'income', 'card_payment'].includes(expense.kind) ||
        input.incomeTypeId
      )
        throw new BookingInvariantError('Bitte eine Ausgabenkategorie wählen.');
      counter = { categoryId: expense.id, amountCents: -contactAmount };
    }
    const memo = `Ausgleich Kontakt${input.memo?.trim() ? ` · ${input.memo.trim()}` : ''}`;
    let bookingId: string;
    try {
      bookingId = createBooking(
        tx,
        {
          accountId: input.accountId,
          date: input.date,
          amountCents: 0,
          status: 'confirmed',
          memo,
          splits: [
            {
              categoryId: ensureAdvanceCategory(tx, grouped),
              contactId,
              amountCents: contactAmount,
              memo,
            },
            counter,
          ],
        },
        grouped,
      );
    } catch (error) {
      if (error instanceof Error && /Allocation exceeds/.test(error.message))
        throw new BookingInvariantError(
          'Ausgleich zu diesem Datum nicht möglich: spätere Zahlungen sind bereits zugeordnet.',
        );
      throw error;
    }
    return { bookingId, groupId: grouped.groupId };
  });
}

/** One transaction and audit group for cash, chosen allocation and explicit contact credit. */
export function settleContact(
  db: Executor,
  contactId: string,
  input: ContactReceiptInput,
  ctx: AuditContext,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      throw new BookingInvariantError('A contact receipt must be positive integer cents');
    const cash = tx
      .select()
      .from(account)
      .where(and(eq(account.id, input.accountId), isNull(account.deletedAt)))
      .get();
    if (
      !cash ||
      cash.closedAt !== null ||
      cash.currency !== 'EUR' ||
      !['checking', 'savings', 'cash'].includes(cash.type)
    )
      throw new BookingInvariantError('Choose an open EUR cash account for the contact receipt');
    const before = getContactStatement(tx, contactId, input.date);
    let plan;
    try {
      plan = allocateContactReceipt(before.outlays, input.amountCents, input.allocations);
    } catch (error) {
      throw new BookingInvariantError(
        error instanceof Error ? error.message : 'Invalid contact allocation',
      );
    }
    const categoryId = ensureAdvanceCategory(tx, grouped);
    const refunds = new Map<string, number>();
    for (const allocation of plan.allocations) {
      const target = before.outlays.find((o) => o.splitId === allocation.outlaySplitId)!;
      if (target.categoryId)
        refunds.set(
          target.categoryId,
          (refunds.get(target.categoryId) ?? 0) + allocation.amountCents,
        );
    }
    const returned = [...refunds].map(([categoryId, amountCents]) => ({
      categoryId,
      amountCents,
      memo: 'Rückzahlung in die ursprüngliche Kategorie',
    }));
    if (returned.length && !cash.onBudget)
      throw new BookingInvariantError('Shared category repayments require a budget account');
    const bookingId = createContactSettlementBooking(
      tx,
      {
        accountId: input.accountId,
        date: input.date,
        amountCents: input.amountCents,
        memo: input.memo ?? null,
        status: 'confirmed',
        splits: [
          { categoryId, contactId, amountCents: input.amountCents },
          ...returned,
          ...(returned.length
            ? [{ categoryId, amountCents: -returned.reduce((sum, r) => sum + r.amountCents, 0) }]
            : []),
        ],
      },
      grouped,
    );
    const split = tx
      .select()
      .from(bookingSplit)
      .where(eq(bookingSplit.bookingId, bookingId))
      .get()!;
    const id = randomUUID();
    insertTracked(
      tx,
      contactSettlement,
      { id, contactId, bookingId, receiptSplitId: split.id, creditCents: plan.creditCents },
      grouped,
    );
    for (const a of plan.allocations)
      insertTracked(tx, contactAllocation, { id: randomUUID(), settlementId: id, ...a }, grouped);
    saveContactCreditRecord(
      tx,
      {
        bookingId,
        repayments: [split.id],
        repaymentRefunds: returned.map(({ categoryId, amountCents }) => ({
          categoryId,
          amountCents,
        })),
      },
      grouped,
    );
    assertContactSettlementInvariants(tx);
    return { id, bookingId, ...plan, groupId: grouped.groupId };
  });
}
