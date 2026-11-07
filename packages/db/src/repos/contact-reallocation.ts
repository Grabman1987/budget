import { randomUUID } from 'node:crypto';
import { allocateContactReceipt, type ContactAllocation } from '@budget/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { account, bookingSplit, category, contactAllocation, contactSettlement } from '../schema';
import {
  insertTracked,
  updateTracked,
  withGroup,
  type AuditContext,
  type GroupedContext,
} from './audit';
import { getBooking, createContactSettlementBooking } from './bookings';
import { ensureAdvanceCategory } from './categories';
import {
  contactCreditRecords,
  contactRefundTotals,
  saveContactCreditRecord,
  type ContactCreditRecord,
} from './contact-credit';
import { getContactStatement } from './contacts';
import { BookingInvariantError, EntityNotFoundError, ReconciledLockedError } from './errors';
import { assertLedgerInvariants } from './invariants';
import { runInTransaction, type Executor } from './types';
import {
  recordContactAllocationUnlock,
  type ContactAllocationOptions,
} from './contact-allocation-lock';

export function assertContactAllocationUnlocked(
  db: Executor,
  bookingId: string,
  options: ContactAllocationOptions = {},
  ctx?: GroupedContext,
) {
  const row = getBooking(db, bookingId);
  if (!row) throw new EntityNotFoundError('booking', bookingId);
  if (row.status === 'reconciled' && !options.unlock) throw new ReconciledLockedError([bookingId]);
  if (options.unlock && ctx) recordContactAllocationUnlock(db, ctx, bookingId);
  if (row.transferId || row.splits.some((s) => s.transferId) || row.originalAmountCents !== null)
    throw new BookingInvariantError(
      'Diese Kontaktzuordnung ist mit einer anderen Buchung verknüpft.',
    );
  return row;
}

/** Correct category returns on the decision date, preserving historical month carry. */
function replaceRefunds(
  db: Executor,
  record: ContactCreditRecord,
  kind: 'refunds' | 'repaymentRefunds',
  refunds: { categoryId: string; amountCents: number }[],
  ctx: GroupedContext,
  date: string,
  options: ContactAllocationOptions = {},
) {
  const row = assertContactAllocationUnlocked(db, record.bookingId, options, ctx);
  const current = contactRefundTotals(record, kind, false);
  const desired = new Map(refunds.map((r) => [r.categoryId, r.amountCents]));
  const entries = [...new Set([...current.keys(), ...desired.keys()])]
    .map((categoryId) => ({
      categoryId,
      amountCents: (desired.get(categoryId) ?? 0) - (current.get(categoryId) ?? 0),
    }))
    .filter((r) => r.amountCents !== 0);
  if (!entries.length) return [];
  const sum = entries.reduce((s, r) => s + r.amountCents, 0);
  const advanceId = ensureAdvanceCategory(db, ctx);
  const bookingId = createContactSettlementBooking(
    db,
    {
      accountId: row.accountId,
      date,
      amountCents: 0,
      status: 'confirmed',
      memo: 'Kontaktzuordnung geändert',
      splits: [...entries, ...(sum ? [{ categoryId: advanceId, amountCents: -sum }] : [])],
    },
    ctx,
  );
  const key = kind === 'refunds' ? 'refundCorrections' : 'repaymentRefundCorrections';
  saveContactCreditRecord(
    db,
    { bookingId: row.id, [key]: [...(record[key] ?? []), { bookingId, entries }] },
    ctx,
  );
  saveContactCreditRecord(db, { bookingId, adjustmentFor: { bookingId: row.id, kind } }, ctx);
  return [bookingId];
}
/** Release newest automatic uses first, taking exactly the shortage and no explicit settlement. */
export function releaseContactCredit(
  db: Executor,
  contactId: string,
  receiptSplitId: string,
  amountCents: number,
  ctx: GroupedContext,
  today: string,
  date = today,
  options: ContactAllocationOptions = {},
) {
  if (amountCents === 0) return [];
  const statement = getContactStatement(db, contactId, today);
  const source = statement.movements.find((m) => m.splitId === receiptSplitId && m.amountCents > 0);
  if (!source) throw new EntityNotFoundError('contact receipt', receiptSplitId);
  assertContactAllocationUnlocked(db, source.bookingId, options, ctx);
  for (const receipt of statement.receipts.slice(
    statement.receipts.findIndex((r) => r.receiptSplitId === receiptSplitId) + 1,
  )) {
    if (
      !receipt.recorded &&
      receipt.allocatable &&
      !statement.movements.find((m) => m.splitId === receipt.receiptSplitId)?.creditOnly
    )
      adoptContactRepayment(db, contactId, receipt.receiptSplitId, ctx, today, options, date);
  }
  const records = contactCreditRecords(db);
  const usesByBooking = new Map<string, typeof statement.creditUses>();
  const bookingUses = (bookingId: string) => {
    const cached = usesByBooking.get(bookingId);
    if (cached) return cached;
    const parts = db.select().from(bookingSplit).where(eq(bookingSplit.bookingId, bookingId)).all();
    const ids = new Set(parts.map((p) => p.contactId).filter((id): id is string => !!id));
    const uses = [...ids].flatMap((id) =>
      (id === contactId
        ? statement
        : getContactStatement(db, id, today, records)
      ).creditUses.filter((u) => parts.some((p) => p.id === u.outlaySplitId)),
    );
    usesByBooking.set(bookingId, uses);
    return uses;
  };
  if (
    records.some(
      (r) =>
        statement.movements.some((m) => m.bookingId === r.bookingId) &&
        (r.useHistory?.some((h) => h.date > date) ||
          r.allocationHistory?.some((h) => h.date > date)),
    )
  )
    throw new BookingInvariantError(
      'Die Entscheidung darf nicht vor einer späteren Kontaktzuordnung liegen.',
    );
  const uses = statement.creditUses
    .filter(
      (u) =>
        u.receiptSplitId === receiptSplitId &&
        statement.outlays.some((o) => o.splitId === u.outlaySplitId && !o.creditSourceSplitId),
    )
    .reverse();
  let needed = amountCents;
  const changed = new Map<string, ContactCreditRecord>();
  const adjustments: string[] = [];
  for (const use of uses) {
    if (!needed) break;
    const outlay = statement.outlays.find((o) => o.splitId === use.outlaySplitId)!;
    let record =
      changed.get(outlay.bookingId) ?? records.find((r) => r.bookingId === outlay.bookingId);
    // Legacy implicit uses have no proven category-return rows and cannot be rewritten.
    if (
      !record?.uses?.some(
        (u) => u.receiptSplitId === receiptSplitId && u.outlaySplitId === outlay.splitId,
      )
    ) {
      if (outlay.categoryId)
        throw new BookingInvariantError('Automatische Zuordnung ist historisch nicht belegt.');
      record = {
        ...record,
        bookingId: outlay.bookingId,
        refunds: record?.refunds ?? [],
        uses: bookingUses(outlay.bookingId),
      };
    }
    assertContactAllocationUnlocked(db, outlay.bookingId, options, ctx);
    const released = Math.min(use.amountCents, needed);
    needed -= released;
    const next = {
      ...record,
      explicitUses: true,
      uses: record.uses!.flatMap((u) => {
        if (u.receiptSplitId !== receiptSplitId || u.outlaySplitId !== outlay.splitId) return [u];
        return u.amountCents > released ? [{ ...u, amountCents: u.amountCents - released }] : [];
      }),
    };
    changed.set(outlay.bookingId, next);
  }
  if (needed)
    throw new BookingInvariantError('Das gewählte Kontaktguthaben ist nicht mehr verfügbar.');
  // Keep every later modeled use fixed while the released cents await the owner's decision.
  // Otherwise FIFO would immediately move those cents into another, unchanged purchase.
  const firstChanged = statement.movements.findIndex((m) => changed.has(m.bookingId));
  const laterBookings = new Set(
    statement.movements
      .slice(firstChanged)
      .filter((m) => m.amountCents < 0 && !m.creditSourceSplitId)
      .map((m) => m.bookingId),
  );
  for (const bookingId of laterBookings) {
    const stored = records.find((r) => r.bookingId === bookingId);
    const record = { ...stored, bookingId, uses: stored?.uses ?? bookingUses(bookingId) };
    if (record.uses && !record.explicitUses && !changed.has(record.bookingId)) {
      assertContactAllocationUnlocked(db, record.bookingId, options, ctx);
      saveContactCreditRecord(
        db,
        {
          bookingId: record.bookingId,
          explicitUses: true,
          uses: record.uses,
          useHistory: [
            ...(record.useHistory ?? []),
            { date, uses: record.uses, explicitUses: false },
          ],
        },
        ctx,
      );
    }
  }
  for (const record of changed.values()) {
    const totals = new Map<string, number>();
    for (const use of record.uses ?? []) {
      const part = db
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.id, use.outlaySplitId))
        .get();
      if (!part?.categoryId) throw new BookingInvariantError('Ursprungskategorie fehlt.');
      const original = db.select().from(category).where(eq(category.id, part.categoryId)).get();
      if (original?.kind !== 'advance')
        totals.set(part.categoryId, (totals.get(part.categoryId) ?? 0) + use.amountCents);
    }
    adjustments.push(
      ...replaceRefunds(
        db,
        record,
        'refunds',
        [...totals].map(([categoryId, amountCents]) => ({ categoryId, amountCents })),
        ctx,
        date,
        options,
      ),
    );
    const original = records.find((r) => r.bookingId === record.bookingId);
    saveContactCreditRecord(
      db,
      {
        bookingId: record.bookingId,
        explicitUses: true,
        uses: record.uses!,
        useHistory: [
          ...(original?.useHistory ?? []),
          { date, explicitUses: !!original?.explicitUses, uses: bookingUses(record.bookingId) },
        ],
      },
      ctx,
    );
  }
  return [...changed.keys(), ...adjustments];
}

function repayment(db: Executor, contactId: string, receiptSplitId: string, today: string) {
  const statement = getContactStatement(db, contactId, today);
  const saved = db
    .select()
    .from(contactSettlement)
    .where(
      and(
        eq(contactSettlement.contactId, contactId),
        eq(contactSettlement.receiptSplitId, receiptSplitId),
        isNull(contactSettlement.deletedAt),
      ),
    )
    .get();
  const source = statement.movements.find((m) => m.splitId === receiptSplitId && m.amountCents > 0);
  if (!source || source.creditOnly)
    throw new EntityNotFoundError('contact settlement', receiptSplitId);
  const record = contactCreditRecords(db).find((r) => r.bookingId === source.bookingId);
  if (record?.waiver) throw new BookingInvariantError('Ein Geschenk ist keine Bankrückzahlung.');
  return { statement, saved, source, record };
}

/** Explicitly adopt only the current settlement facts; no cash or historical categories change. */
export function adoptContactRepayment(
  db: Executor,
  contactId: string,
  receiptSplitId: string,
  ctx: AuditContext,
  today: string,
  options: ContactAllocationOptions = {},
  effectiveDate = today,
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    const { statement, saved, source, record } = repayment(tx, contactId, receiptSplitId, today);
    if (record?.repayments?.includes(receiptSplitId))
      return { bookingId: source.bookingId, groupId: grouped.groupId, adopted: false };
    assertContactAllocationUnlocked(tx, source.bookingId, options, grouped);
    const current = statement.receipts.find((r) => r.receiptSplitId === receiptSplitId)!;
    const refunds = new Map<string, number>();
    for (const a of current.allocations) {
      const outlay = statement.outlays.find((o) => o.splitId === a.outlaySplitId)!;
      assertContactAllocationUnlocked(tx, outlay.bookingId, options, grouped);
      if (outlay.categoryId)
        refunds.set(outlay.categoryId, (refunds.get(outlay.categoryId) ?? 0) + a.amountCents);
    }
    if (!saved) {
      const previous = tx
        .select()
        .from(contactSettlement)
        .where(eq(contactSettlement.receiptSplitId, receiptSplitId))
        .get();
      const id = previous?.id ?? randomUUID();
      if (previous)
        updateTracked(
          tx,
          contactSettlement,
          [id],
          { deletedAt: null, creditCents: current.creditCents },
          grouped,
        );
      else
        insertTracked(
          tx,
          contactSettlement,
          {
            id,
            contactId,
            bookingId: source.bookingId,
            receiptSplitId,
            creditCents: current.creditCents,
          },
          grouped,
        );
      for (const a of current.allocations)
        insertTracked(tx, contactAllocation, { id: randomUUID(), settlementId: id, ...a }, grouped);
    }
    saveContactCreditRecord(
      tx,
      {
        bookingId: source.bookingId,
        repayments: [...(record?.repayments ?? []), receiptSplitId],
        adoptedRepayments: [
          ...(record?.adoptedRepayments ?? []),
          {
            receiptSplitId,
            date: effectiveDate,
            previouslyRecorded: !!saved,
            allocations: current.allocations,
            creditCents: current.creditCents,
            unreturnedRefunds: [...refunds].map(([categoryId, amountCents]) => ({
              categoryId,
              amountCents,
            })),
          },
        ],
      },
      grouped,
    );
    assertLedgerInvariants(tx, [source.bookingId]);
    return { bookingId: source.bookingId, groupId: grouped.groupId, adopted: true };
  });
}

export function getContactRepaymentAllocation(
  db: Executor,
  contactId: string,
  receiptSplitId: string,
  today: string,
) {
  const { statement, source, saved, record } = repayment(db, contactId, receiptSplitId, today);
  const allocations = statement.receipts.find(
    (r) => r.receiptSplitId === receiptSplitId,
  )!.allocations;
  const retainedCreditCents = statement.creditUses
    .filter(
      (u) =>
        u.receiptSplitId === receiptSplitId &&
        statement.outlays.some((o) => o.splitId === u.outlaySplitId && o.creditSourceSplitId),
    )
    .reduce((sum, u) => sum + u.amountCents, 0);
  const outlays = statement.outlays
    .filter((o) => !o.creditSourceSplitId)
    .map((o) => ({
      ...o,
      remainingCents:
        o.remainingCents +
        (allocations.find((a) => a.outlaySplitId === o.splitId)?.amountCents ?? 0) +
        statement.creditUses
          .filter((u) => u.receiptSplitId === receiptSplitId && u.outlaySplitId === o.splitId)
          .reduce((s, u) => s + u.amountCents, 0),
    }))
    .filter((o) => o.remainingCents > 0);
  return {
    receiptSplitId,
    amountCents: source.amountCents - retainedCreditCents,
    retainedCreditCents,
    allocations,
    outlays,
    requiresAdoption: !!saved && !record?.repayments?.includes(receiptSplitId),
    locked: statement.movements
      .map((o) => o.bookingId)
      .some((id) => getBooking(db, id)?.status === 'reconciled'),
  };
}

export function reallocateContactRepayment(
  db: Executor,
  contactId: string,
  receiptSplitId: string,
  input: { allocations: ContactAllocation[] },
  ctx: AuditContext,
  today: string,
  options: ContactAllocationOptions = {},
) {
  const grouped = withGroup(ctx);
  return runInTransaction(db, (tx) => {
    if (!repayment(tx, contactId, receiptSplitId, today).saved)
      adoptContactRepayment(tx, contactId, receiptSplitId, grouped, today, options);
    const before = getContactStatement(tx, contactId, today);
    const laterReceiptIds = before.receipts
      .slice(before.receipts.findIndex((r) => r.receiptSplitId === receiptSplitId) + 1)
      .filter(
        (r) =>
          !r.recorded &&
          r.allocatable &&
          !before.movements.find((m) => m.splitId === r.receiptSplitId)?.creditOnly,
      )
      .map((r) => r.receiptSplitId);
    // Freeze inferred later receipts too: reopening must never move somebody else's payment.
    for (const id of laterReceiptIds)
      adoptContactRepayment(tx, contactId, id, grouped, today, options);
    const state = repayment(tx, contactId, receiptSplitId, today);
    const { statement, source } = state;
    const saved = state.saved!;
    const record = state.record;
    if (!record?.repayments?.includes(receiptSplitId))
      throw new BookingInvariantError(
        'Die ältere Rückzahlung muss zuerst ausdrücklich übernommen werden (adoption_required).',
      );
    if (record.allocationHistory?.some((h) => h.date > today))
      throw new BookingInvariantError(
        'Die Entscheidung darf nicht vor einer späteren Kontaktzuordnung liegen.',
      );
    const cash = assertContactAllocationUnlocked(tx, source.bookingId, options, grouped);
    const preview = getContactRepaymentAllocation(tx, contactId, receiptSplitId, today);
    let plan;
    try {
      plan = allocateContactReceipt(preview.outlays, preview.amountCents, input.allocations, {
        retainCredit: true,
      });
      plan.creditCents += preview.retainedCreditCents;
    } catch {
      throw new BookingInvariantError(
        'Die Zuordnung muss zur Rückzahlung und zu den offenen Auslagen passen.',
      );
    }
    for (const a of [...preview.allocations, ...plan.allocations]) {
      const target = tx
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.id, a.outlaySplitId))
        .get();
      if (!target) throw new EntityNotFoundError('contact outlay', a.outlaySplitId);
      assertContactAllocationUnlocked(tx, target.bookingId, options, grouped);
    }
    const used = statement.creditUses
      .filter(
        (u) =>
          u.receiptSplitId === receiptSplitId &&
          statement.outlays.some((o) => o.splitId === u.outlaySplitId && !o.creditSourceSplitId),
      )
      .reduce((s, u) => s + u.amountCents, 0);
    const touched = releaseContactCredit(
      tx,
      contactId,
      receiptSplitId,
      used,
      grouped,
      today,
      today,
      options,
    );
    // Pin later purchases even when the receipt had no surplus before this edit.
    // Otherwise released settlement cents would silently close a later outlay again.
    const latestRecords = contactCreditRecords(tx);
    for (const bookingId of new Set(
      statement.outlays
        .filter((o) => o.date >= source.date && !o.creditSourceSplitId)
        .map((o) => o.bookingId),
    )) {
      const stored = latestRecords.find((r) => r.bookingId === bookingId);
      if (stored?.explicitUses) continue;
      assertContactAllocationUnlocked(tx, bookingId, options, grouped);
      const parts = tx
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.bookingId, bookingId))
        .all();
      const uses = [
        ...new Set(parts.map((p) => p.contactId).filter((id): id is string => !!id)),
      ].flatMap((id) =>
        getContactStatement(tx, id, today).creditUses.filter((u) =>
          parts.some((p) => p.id === u.outlaySplitId),
        ),
      );
      saveContactCreditRecord(
        tx,
        {
          bookingId,
          explicitUses: true,
          uses,
          useHistory: [...(stored?.useHistory ?? []), { date: today, uses, explicitUses: false }],
        },
        grouped,
      );
    }
    for (const old of tx
      .select()
      .from(contactAllocation)
      .where(and(eq(contactAllocation.settlementId, saved.id), isNull(contactAllocation.deletedAt)))
      .all())
      updateTracked(
        tx,
        contactAllocation,
        [old.id],
        { deletedAt: new Date().toISOString() },
        grouped,
      );
    for (const a of plan.allocations)
      insertTracked(
        tx,
        contactAllocation,
        { id: randomUUID(), settlementId: saved.id, ...a },
        grouped,
      );
    updateTracked(tx, contactSettlement, [saved.id], { creditCents: plan.creditCents }, grouped);
    const totals = new Map<string, number>();
    // A manual booking may contain several receipts; retain every other receipt's category return.
    for (const splitId of record.repayments ?? []) {
      const settlement = tx
        .select()
        .from(contactSettlement)
        .where(eq(contactSettlement.receiptSplitId, splitId))
        .get()!;
      for (const a of tx
        .select()
        .from(contactAllocation)
        .where(
          and(
            eq(contactAllocation.settlementId, settlement.id),
            isNull(contactAllocation.deletedAt),
          ),
        )
        .all()) {
        const target = tx
          .select({ categoryId: bookingSplit.categoryId, kind: category.kind })
          .from(bookingSplit)
          .innerJoin(category, eq(category.id, bookingSplit.categoryId))
          .where(eq(bookingSplit.id, a.outlaySplitId))
          .get();
        if (target?.categoryId && target.kind !== 'advance')
          totals.set(target.categoryId, (totals.get(target.categoryId) ?? 0) + a.amountCents);
      }
    }
    const adoptedRepayments = record.adoptedRepayments?.map((a) =>
      a.receiptSplitId === receiptSplitId ? { ...a, unreturnedRefunds: [] } : a,
    );
    // Other adopted receipts retain their unreturned legacy categories. Only the
    // chosen receipt opts into category restoration; never reverse a phantom inflow.
    for (const a of adoptedRepayments ?? [])
      for (const r of a.unreturnedRefunds)
        totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) - r.amountCents);
    for (const [id, amount] of totals) if (!amount) totals.delete(id);
    if (
      totals.size &&
      !tx.select().from(account).where(eq(account.id, cash.accountId)).get()?.onBudget
    )
      throw new BookingInvariantError('Shared category repayments require a budget account');
    touched.push(
      ...replaceRefunds(
        tx,
        record,
        'repaymentRefunds',
        [...totals].map(([categoryId, amountCents]) => ({ categoryId, amountCents })),
        grouped,
        today,
        options,
      ),
    );
    saveContactCreditRecord(
      tx,
      {
        bookingId: cash.id,
        ...(adoptedRepayments ? { adoptedRepayments } : {}),
        allocationHistory: [
          ...(record.allocationHistory ?? []),
          {
            date: today,
            receiptSplitId,
            allocations: preview.allocations,
            creditCents: saved.creditCents,
            allowFutureAllocations: !!record.targetedRepayments?.includes(receiptSplitId),
          },
        ],
        targetedRepayments: [...new Set([...(record.targetedRepayments ?? []), receiptSplitId])],
      },
      grouped,
    );
    assertLedgerInvariants(tx, [cash.id, ...touched]);
    return { ...plan, bookingId: cash.id, groupId: grouped.groupId };
  });
}
