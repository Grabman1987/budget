import {
  applyChecklistCredits,
  lastDayOfMonth,
  planContactChecklist,
  type ChecklistItem,
} from '@budget/domain';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import {
  account,
  category,
  contactSettlement,
  expectedOccurrence,
  expectedPayment,
  INCOME_TYPES,
} from '../schema';
import { updateTracked, withGroup, type AuditContext } from './audit';
import { createBooking, type SplitInput } from './bookings';
import {
  chooseContactCredit,
  getContactStatement,
  settleContact,
  waiveContactOutlay,
} from './contacts';
import { contactIdentityIds, resolveContactForWrite } from './contact-label';
import { getContactRepaymentAllocation, reallocateContactRepayment } from './contact-reallocation';
import { BookingInvariantError } from './errors';
import { assertLedgerInvariants } from './invariants';
import { runInTransaction, type Executor } from './types';

export interface ChecklistOutlay {
  splitId: string;
  bookingId: string;
  date: string;
  remainingCents: number;
  memo: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

/** A credit lot the contact holds (negative in the list). Usable only for a plain repayment lot. */
export interface ChecklistCredit {
  receiptSplitId: string;
  date: string;
  remainingCents: number;
  categoryId: string | null;
  categoryName: string | null;
  /**
   * A category-earmarked credit is a decision lot that no existing outlay can be re-pointed to
   * (the replay only lets it cover later outlays of its category), so it is shown disabled.
   */
  usable: boolean;
}

export interface ChecklistContribution {
  occurrenceId: string;
  paymentId: string;
  name: string;
  dueDate: string;
  amountCents: number;
  categoryId: string | null;
  categoryName: string | null;
  incomeTypeId: string | null;
  /** False when the expected payment has neither category nor income type: shown, not tickable. */
  selectable: boolean;
}

/**
 * Open items of a contact a payment can settle (#1322): open outlays (oldest first) and the
 * contact's expected inflows that are due up to the end of the payment's month and not yet linked.
 */
export function listContactChecklist(
  db: Executor,
  askedId: string,
  date: string,
): {
  outlays: ChecklistOutlay[];
  contributions: ChecklistContribution[];
  credits: ChecklistCredit[];
} {
  const contactId = resolveContactForWrite(db, askedId);
  const statement = getContactStatement(db, contactId, date);
  const credits = statement.credits
    .filter((c) => !c.targetOutlaySplitId && c.remainingCents > 0)
    .map((c) => {
      const movement = statement.movements.find((m) => m.splitId === c.receiptSplitId);
      const receipt = statement.receipts.find((r) => r.receiptSplitId === c.receiptSplitId);
      const name = c.categoryId
        ? db.select().from(category).where(eq(category.id, c.categoryId)).get()?.name
        : undefined;
      return {
        receiptSplitId: c.receiptSplitId,
        date: movement?.date ?? date,
        remainingCents: c.remainingCents,
        categoryId: c.categoryId,
        categoryName: name ?? null,
        usable:
          c.categoryId === null &&
          !!movement &&
          !movement.creditOnly &&
          movement.date <= date &&
          receipt?.allocatable === true,
      };
    });
  const outlays = statement.outlays
    .filter((o) => o.remainingCents > 0 && !o.creditSourceSplitId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((o) => ({
      splitId: o.splitId,
      bookingId: o.bookingId,
      date: o.date,
      remainingCents: o.remainingCents,
      memo: o.memo ?? null,
      categoryId: o.categoryId ?? null,
      categoryName: o.categoryName ?? null,
    }));
  const contributions = db
    .select({
      occ: expectedOccurrence,
      payment: expectedPayment,
      categoryName: category.name,
      categoryKind: category.kind,
    })
    .from(expectedOccurrence)
    .innerJoin(expectedPayment, eq(expectedPayment.id, expectedOccurrence.expectedPaymentId))
    .leftJoin(category, eq(category.id, expectedPayment.categoryId))
    .where(
      and(
        isNull(expectedOccurrence.deletedAt),
        isNull(expectedPayment.deletedAt),
        eq(expectedPayment.kind, 'inflow'),
        inArray(expectedPayment.contactId, contactIdentityIds(db, contactId)),
        inArray(expectedOccurrence.status, ['expected', 'missed']),
        isNull(expectedOccurrence.bookingId),
        lte(expectedOccurrence.dueDate, lastDayOfMonth(date.slice(0, 7))),
      ),
    )
    .orderBy(asc(expectedOccurrence.dueDate), asc(expectedPayment.name), asc(expectedOccurrence.id))
    .all()
    // Outlay pass-through and card payments are never a contribution target.
    .filter(
      (r) =>
        r.occ.expectedAmountCents > 0 &&
        r.categoryKind !== 'advance' &&
        r.categoryKind !== 'card_payment',
    )
    .map((r) => ({
      occurrenceId: r.occ.id,
      paymentId: r.payment.id,
      name: r.payment.name,
      dueDate: r.occ.dueDate,
      amountCents: r.occ.expectedAmountCents,
      categoryId: r.payment.categoryId,
      categoryName: r.categoryName,
      incomeTypeId: r.payment.incomeTypeId,
      selectable: Boolean(r.payment.categoryId || r.payment.incomeTypeId),
    }));
  return { outlays, contributions, credits };
}

export interface ChecklistReceiptInput {
  accountId: string;
  date: string;
  amountCents: number;
  memo?: string | null;
  /** Ticked open outlays (split ids) and ticked due contributions (occurrence ids). */
  outlaySplitIds: string[];
  occurrenceIds: string[];
  /** Ticked credit lots (receipt split ids), offset against the ticked outlays first. */
  creditReceiptSplitIds?: string[];
  payeeId?: string | null;
  /** Paid less: the rest stays an open claim (default) or is waived through the gift path. */
  shortfall?: 'open' | 'waive';
  /** Paid more: the surplus stays as contact credit (default) or is booked as a gift to me. */
  surplus?: 'credit' | 'gift';
}

/**
 * One booking for one cash receipt of a contact (#1322): ticked contributions become category
 * (or income-type) parts, ticked outlays are repaid through the ordinary settlement, the rest is
 * handled per the owner's choice. Every write shares one audit group, so one Undo reverts all.
 */
export function settleContactChecklist(
  db: Executor,
  askedId: string,
  input: ChecklistReceiptInput,
  ctx: AuditContext,
  today: string,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const contactId = resolveContactForWrite(tx, askedId);
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0)
      throw new BookingInvariantError('Der erhaltene Betrag muss größer als null sein.');
    if (input.date > today)
      throw new BookingInvariantError('Eine Zahlung des Kontakts muss bereits erfolgt sein.');
    if (
      new Set(input.outlaySplitIds).size !== input.outlaySplitIds.length ||
      new Set(input.occurrenceIds).size !== input.occurrenceIds.length
    )
      throw new BookingInvariantError('Jede Zeile kann nur einmal ausgewählt werden.');
    const cash = tx.select().from(account).where(eq(account.id, input.accountId)).get();
    if (
      !cash ||
      cash.deletedAt ||
      cash.closedAt !== null ||
      !cash.onBudget ||
      cash.currency !== 'EUR' ||
      input.date < cash.openingDate ||
      !['checking', 'savings', 'cash'].includes(cash.type)
    )
      throw new BookingInvariantError('Bitte ein offenes EUR-Budgetkonto wählen.');
    const open = listContactChecklist(tx, contactId, input.date);
    // Due contributions are paid first, oldest due date first (the order of the list).
    const contributions = input.occurrenceIds
      .map((id) => {
        const row = open.contributions.find((c) => c.occurrenceId === id);
        if (!row?.selectable)
          throw new BookingInvariantError('Dieser erwartete Beitrag ist nicht mehr offen.');
        return row;
      })
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) ||
          a.name.localeCompare(b.name) ||
          a.occurrenceId.localeCompare(b.occurrenceId),
      );
    const tickedOutlays = input.outlaySplitIds
      .map((id) => {
        const row = open.outlays.find((o) => o.splitId === id);
        if (!row) throw new BookingInvariantError('Diese Auslage ist nicht mehr offen.');
        return row;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.splitId.localeCompare(b.splitId));
    const creditIds = input.creditReceiptSplitIds ?? [];
    if (new Set(creditIds).size !== creditIds.length)
      throw new BookingInvariantError('Jede Zeile kann nur einmal ausgewählt werden.');
    const credits = creditIds.map((id) => {
      const row = open.credits.find((c) => c.receiptSplitId === id);
      if (!row?.usable)
        throw new BookingInvariantError('Dieses Guthaben kann hier nicht verrechnet werden.');
      return row;
    });
    // Credits first: offset them against the ticked outlays through the existing receipt
    // reallocation (one audit group); the cash receipt then settles what remains.
    const offset = applyChecklistCredits(
      tickedOutlays.map((o) => ({ id: o.splitId, amountCents: o.remainingCents })),
      credits.map((c) => ({ id: c.receiptSplitId, amountCents: c.remainingCents })),
    );
    for (const credit of credits) {
      const extra = offset.allocations.filter((a) => a.creditId === credit.receiptSplitId);
      if (!extra.length) continue;
      const merged = new Map<string, number>();
      for (const a of getContactRepaymentAllocation(
        tx,
        contactId,
        credit.receiptSplitId,
        input.date,
      ).allocations)
        merged.set(a.outlaySplitId, (merged.get(a.outlaySplitId) ?? 0) + a.amountCents);
      for (const a of extra) merged.set(a.outlayId, (merged.get(a.outlayId) ?? 0) + a.amountCents);
      reallocateContactRepayment(
        tx,
        contactId,
        credit.receiptSplitId,
        {
          allocations: [...merged].map(([outlaySplitId, amountCents]) => ({
            outlaySplitId,
            amountCents,
          })),
        },
        grouped,
        // Effective on the payment date, like the cash receipt that follows.
        input.date,
      );
    }
    const refreshed = credits.length ? listContactChecklist(tx, contactId, input.date) : open;
    const outlays = tickedOutlays.flatMap((o) => {
      const row = refreshed.outlays.find((r) => r.splitId === o.splitId);
      return row ? [row] : [];
    });
    const items: ChecklistItem[] = [
      ...contributions.map((c) => ({
        id: c.occurrenceId,
        kind: 'contribution' as const,
        amountCents: c.amountCents,
      })),
      ...outlays.map((o) => ({
        id: o.splitId,
        kind: 'outlay' as const,
        amountCents: o.remainingCents,
      })),
    ];
    const plan = planContactChecklist(items, input.amountCents);
    const paid = (id: string) => plan.paid.find((p) => p.id === id)?.amountCents ?? 0;

    const directSplits: SplitInput[] = contributions.flatMap((c) =>
      paid(c.occurrenceId)
        ? [
            c.categoryId
              ? { categoryId: c.categoryId, amountCents: paid(c.occurrenceId), memo: c.name }
              : { incomeTypeId: c.incomeTypeId!, amountCents: paid(c.occurrenceId), memo: c.name },
          ]
        : [],
    );
    const allocations = outlays.flatMap((o) =>
      paid(o.splitId) ? [{ outlaySplitId: o.splitId, amountCents: paid(o.splitId) }] : [],
    );
    if (
      input.shortfall === 'waive' &&
      outlays.some((o) => o.remainingCents > paid(o.splitId) && !o.categoryId)
    )
      throw new BookingInvariantError(
        'Eine alte Auslage ohne Kategorie kann hier nicht geschenkt werden.',
      );
    const contactCents = allocations.reduce((s, a) => s + a.amountCents, 0) + plan.surplusCents;

    let bookingId: string;
    let settlementId: string | null = null;
    if (contactCents > 0) {
      const settled = settleContact(
        tx,
        contactId,
        {
          accountId: input.accountId,
          date: input.date,
          amountCents: contactCents,
          memo: input.memo ?? null,
          payeeId: input.payeeId ?? null,
          allocations,
          retainCredit: true,
          directSplits,
        },
        grouped,
      );
      bookingId = settled.bookingId;
      settlementId = settled.id;
    } else {
      bookingId = createBooking(
        tx,
        {
          accountId: input.accountId,
          date: input.date,
          amountCents: input.amountCents,
          status: 'confirmed',
          memo: input.memo ?? null,
          payeeId: input.payeeId ?? null,
          splits: directSplits,
        },
        grouped,
      );
    }

    // Every paid contribution is linked to the booking (#1336); its own split carries its amount
    // (see linkedOccurrenceShares). Status follows what it actually received. One audit group.
    const linkedContributions = contributions.filter((c) => paid(c.occurrenceId) > 0);
    for (const c of linkedContributions)
      updateTracked(
        tx,
        expectedOccurrence,
        [c.occurrenceId],
        {
          status: paid(c.occurrenceId) === c.amountCents ? 'received' : 'deviating',
          bookingId,
        },
        grouped,
      );
    const linked = linkedContributions[0];

    if (plan.surplusCents > 0 && input.surplus === 'gift' && settlementId) {
      const receiptSplitId = tx
        .select({ id: contactSettlement.receiptSplitId })
        .from(contactSettlement)
        .where(eq(contactSettlement.id, settlementId))
        .get()!.id;
      chooseContactCredit(
        tx,
        contactId,
        {
          receiptSplitId,
          amountCents: plan.surplusCents,
          date: input.date,
          choice: 'gift',
          accountId: input.accountId,
          giftIncomeTypeId: INCOME_TYPES.gift.id,
        },
        grouped,
        today,
      );
    }
    if (plan.shortfallCents > 0 && input.shortfall === 'waive') {
      for (const o of outlays) {
        const short = o.remainingCents - paid(o.splitId);
        if (short > 0)
          waiveContactOutlay(
            tx,
            contactId,
            o.splitId,
            { amountCents: short, date: input.date },
            grouped,
            today,
          );
      }
    }
    assertLedgerInvariants(tx, [bookingId]);
    return {
      bookingId,
      groupId: grouped.groupId,
      restCents: plan.restCents,
      linkedOccurrenceId: linked?.occurrenceId ?? null,
      linkedOccurrenceIds: linkedContributions.map((c) => c.occurrenceId),
    };
  });
}
