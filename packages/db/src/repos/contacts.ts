import { randomUUID } from 'node:crypto';
import { allocateContactReceipt, contactStatement, type ContactAllocation } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { account, bookingSplit, contact, contactAllocation, contactSettlement } from '../schema';
import { insertTracked, withGroup, type AuditContext } from './audit';
import { createContactSettlementBooking } from './bookings';
import { ensureAdvanceCategory } from './categories';
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
      return { ...s.contact, balanceCents: s.balanceCents, creditCents: s.creditCents };
    })
    .filter((c) => history || c.balanceCents !== 0);
}

export interface ContactReceiptInput {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
  allocations?: ContactAllocation[];
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
    const bookingId = createContactSettlementBooking(
      tx,
      {
        accountId: input.accountId,
        date: input.date,
        amountCents: input.amountCents,
        memo: input.memo ?? null,
        status: 'confirmed',
        splits: [{ categoryId, contactId, amountCents: input.amountCents }],
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
    assertContactSettlementInvariants(tx);
    return { id, bookingId, ...plan, groupId: grouped.groupId };
  });
}
