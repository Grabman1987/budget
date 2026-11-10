import { resolveContactForWrite } from './contact-label';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { category, contactAllocation, contactSettlement } from '../schema';
import { insertTracked, withGroup, type AuditContext } from './audit';
import { createContactSettlementBooking, getBooking } from './bookings';
import { ensureAdvanceCategory } from './categories';
import { saveContactCreditRecord } from './contact-credit';
import { getContactStatement } from './contacts';
import { assertContactAllocationUnlocked } from './contact-reallocation';
import type { ContactAllocationOptions } from './contact-allocation-lock';
import { BookingInvariantError } from './errors';
import { assertLedgerInvariants } from './invariants';
import { runInTransaction, type Executor } from './types';

/** Waive an outstanding share without editing any original booking or category spend. */
export function waiveContactOutlay(
  db: Executor,
  contactId: string,
  outlaySplitId: string,
  input: { amountCents: number; categoryId?: string },
  ctx: AuditContext,
  today: string,
  options: ContactAllocationOptions = {},
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    contactId = resolveContactForWrite(tx, contactId);
    const outlay = getContactStatement(tx, contactId, today).outlays.find(
      (o) => o.splitId === outlaySplitId && !o.creditSourceSplitId,
    );
    if (
      !outlay ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > outlay.remainingCents
    )
      throw new BookingInvariantError(
        'Bitte höchstens den offenen Kontaktanteil als Geschenk übernehmen.',
      );
    const source = assertContactAllocationUnlocked(tx, outlay.bookingId, options, grouped);
    const categoryId = outlay.categoryId ?? input.categoryId;
    const expense =
      categoryId && tx.select().from(category).where(eq(category.id, categoryId)).get();
    if (
      !expense ||
      expense.deletedAt ||
      expense.class === null ||
      ['advance', 'income', 'card_payment'].includes(expense.kind) ||
      (outlay.categoryId && input.categoryId && input.categoryId !== outlay.categoryId)
    )
      throw new BookingInvariantError(
        'Das Geschenk bleibt in der Ursprungskategorie; für alte Auslagen bitte eine Ausgabenkategorie wählen.',
      );
    const advanceId = ensureAdvanceCategory(tx, grouped);
    const bookingId = createContactSettlementBooking(
      tx,
      {
        accountId: source.accountId,
        date: today,
        amountCents: 0,
        status: 'confirmed',
        memo: 'Geschenk an Kontakt',
        splits: [
          {
            categoryId: advanceId,
            contactId,
            amountCents: input.amountCents,
            memo: 'Geschenk an Kontakt',
          },
          {
            categoryId: outlay.categoryId ? advanceId : expense.id,
            amountCents: -input.amountCents,
          },
        ],
      },
      grouped,
    );
    const receiptSplitId = getBooking(tx, bookingId)!.splits[0]!.id;
    const settlementId = randomUUID();
    insertTracked(
      tx,
      contactSettlement,
      { id: settlementId, contactId, bookingId, receiptSplitId, creditCents: 0 },
      grouped,
    );
    insertTracked(
      tx,
      contactAllocation,
      { id: randomUUID(), settlementId, outlaySplitId, amountCents: input.amountCents },
      grouped,
    );
    saveContactCreditRecord(
      tx,
      {
        bookingId,
        waiver: {
          outlaySplitId,
          receiptSplitId,
          amountCents: input.amountCents,
          categoryId: expense.id,
        },
      },
      grouped,
    );
    assertLedgerInvariants(tx, [bookingId]);
    return { bookingId, amountCents: input.amountCents, groupId: grouped.groupId };
  });
}
