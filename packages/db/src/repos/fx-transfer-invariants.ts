import { and, eq, inArray, isNull } from 'drizzle-orm';
import { account, booking, bookingSplit, category, transferFx } from '../schema';
import { BookingInvariantError } from './errors';
import { fxFacts, fxLinksOfBooking, fxLinksOfBookings } from './fx-transfers';
import type { Executor } from './types';

const invalid = (): never => { throw new BookingInvariantError('FX-Hauptbeträge, Gebühr und Nachweis müssen als gesamte Aktion erhalten bleiben.'); };

/** Read shape only; no current market lookup may rewrite a retained historical fact. */
export function assertFxTransfer(tx: Executor, row: typeof transferFx.$inferSelect) {
  const facts = fxFacts(row);
  const ids = [row.fromBookingId, row.toBookingId, ...(row.feeBookingId ? [row.feeBookingId] : [])];
  const bookings = tx.select().from(booking).where(inArray(booking.id, ids)).all();
  const live = bookings.filter((leg) => leg.deletedAt === null);
  if (live.length === 0) {
    if (tx.select({ id: booking.id }).from(booking).where(and(eq(booking.transferId, row.id),
      isNull(booking.deletedAt))).get()) invalid();
    return;
  }
  if (row.deletedAt || live.length !== ids.length || facts.fromCurrency === facts.toCurrency ||
    !['EUR', 'USD'].includes(facts.fromCurrency) || !['EUR', 'USD'].includes(facts.toCurrency) ||
    facts.orientation !== 'destination/source' || facts.principalAmountsConfirmed !== true ||
    !facts.provenance.trim() || facts.fromAccountId === facts.toAccountId) invalid();
  const from = live.find((leg) => leg.id === row.fromBookingId);
  const to = live.find((leg) => leg.id === row.toBookingId);
  if (!from || !to || from.transferId !== row.id || to.transferId !== row.id ||
    from.accountId !== facts.fromAccountId || to.accountId !== facts.toAccountId ||
    from.currency !== facts.fromCurrency || to.currency !== facts.toCurrency ||
    from.amountCents !== -facts.fromAmountCents || to.amountCents !== facts.toAmountCents ||
    from.date !== facts.date || to.date !== facts.date) invalid();
  const accounts = tx.select().from(account).where(inArray(account.id, [facts.fromAccountId, facts.toAccountId])).all();
  const source = accounts.find((acct) => acct.id === facts.fromAccountId);
  const destination = accounts.find((acct) => acct.id === facts.toAccountId);
  const attribution = JSON.parse(row.valuationJson) as { principalCategories?: Record<string, string | null> };
  if (!source || !destination || source.currency !== facts.fromCurrency || destination.currency !== facts.toCurrency ||
    (source.onBudget && source.currency !== 'EUR') || (destination.onBudget && destination.currency !== 'EUR') ||
    source.openingDate > facts.date || destination.openingDate > facts.date || !attribution.principalCategories)
    invalid();
  for (const [legId, own, other] of [[row.fromBookingId, source!, destination!], [row.toBookingId, destination!, source!]] as const) {
    const assigned = attribution.principalCategories![legId];
    if (own.onBudget && !other.onBudget ? !assigned : assigned !== null) invalid();
  }
  const fee = row.feeBookingId ? live.find((leg) => leg.id === row.feeBookingId) : undefined;
  if ((facts.feeTreatment === 'separate') !== Boolean(facts.fee) || Boolean(facts.fee) !== Boolean(fee)) invalid();
  if (fee && facts.fee && (fee.transferId || fee.accountId !== facts.fee.accountId ||
    ![facts.fromAccountId, facts.toAccountId].includes(fee.accountId) ||
    fee.date !== facts.fee.date || fee.amountCents !== -facts.fee.amountCents ||
    fee.date < accounts.find((acct) => acct.id === fee.accountId)!.openingDate ||
    !Number.isSafeInteger(facts.fee.amountCents) || facts.fee.amountCents <= 0)) invalid();
  const splits = tx.select().from(bookingSplit).where(inArray(bookingSplit.bookingId, ids)).all();
  for (const leg of live) {
    const own = splits.filter((split) => split.bookingId === leg.id);
    if (own.length !== 1 || own[0]!.amountCents !== leg.amountCents || own[0]!.transferId ||
      own[0]!.contactId || own[0]!.incomeTypeId || leg.originalCurrency !== null ||
      leg.originalAmountCents !== null || leg.fxRateMicro !== null || leg.fxFeeCents !== null ||
      leg.incomeNextMonth || leg.source !== 'manual' || leg.bankSourceId || leg.importKey) invalid();
    // Principal budget attribution is fixed at creation, including the explicit no-category side.
    const expectedCategory = leg.id === row.feeBookingId ? facts.fee!.categoryId :
      attribution;
    if (typeof expectedCategory === 'string') {
      if (own[0]!.categoryId !== expectedCategory) invalid();
    } else if (!expectedCategory.principalCategories ||
      own[0]!.categoryId !== expectedCategory.principalCategories[leg.id]) invalid();
    if (own[0]!.categoryId) {
      const assigned = tx.select().from(category).where(eq(category.id, own[0]!.categoryId!)).get();
      if (!assigned || assigned.deletedAt || ['income', 'advance', 'card_payment'].includes(assigned.kind)) invalid();
    }
  }
  const unexpected = tx.select({ id: booking.id }).from(booking)
    .where(and(eq(booking.transferId, row.id), isNull(booking.deletedAt))).all();
  if (unexpected.length !== 2 || unexpected.some((leg) => !ids.includes(leg.id))) invalid();
  if (tx.select({ id: bookingSplit.id }).from(bookingSplit).where(eq(bookingSplit.transferId, row.id)).get()) invalid();
}

export function assertFxBookingInvariants(tx: Executor, ids: readonly string[]) {
  for (const row of fxLinksOfBookings(tx, ids)) assertFxTransfer(tx, row);
}
/** Saved evidence cannot be financially edited by the ordinary same-currency editor. */
export function assertFxBookingPatch(tx: Executor, id: string, keys: readonly string[]) {
  if (fxLinksOfBooking(tx, id) && keys.some((key) => !['flag', 'memo', 'status'].includes(key)))
    throw new BookingInvariantError('FX-Angaben sind fest mit dem Nachweis verbunden. Gesamte Aktion rückgängig machen und neu erfassen.');
}

export function assertFxAccountInvariants(tx: Executor, accountIds: readonly string[]) {
  if (!accountIds.length) return;
  const ids = tx.select({ id: booking.id }).from(booking).where(inArray(booking.accountId, accountIds)).all().map((row) => row.id);
  assertFxBookingInvariants(tx, ids);
}
