import { createHash } from 'node:crypto';
import { toEurCents } from '@budget/domain';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { account, booking, category, transferFx } from '../schema';
import { BookingInvariantError, EntityNotFoundError } from './errors';
import { runInTransaction, type Executor } from './types';
import { fxRateOnOrBefore } from './prices';

export interface FxTransferInput {
  fromAccountId: string;
  toAccountId: string;
  fromCurrency: 'EUR' | 'USD';
  toCurrency: 'EUR' | 'USD';
  date: string;
  /** Positive actual principal facts; posting supplies the direction's sign. */
  fromAmountCents: number;
  toAmountCents: number;
  quotedRate: string;
  orientation: 'destination/source';
  provenance: string;
  /** Explicit confirmation: principal amounts exclude any separately paid charge. */
  principalAmountsConfirmed: true;
  feeTreatment: 'none' | 'separate';
  categoryId?: string | null;
  fee?: { accountId: string; amountCents: number; date: string; categoryId: string; provenance: string };
}
export interface FxReference {
  currency: string;
  asOf: string;
  date: string;
  rateMicro: number;
  source: string;
}
export interface FxTransferValuation {
  policy: 'dated-on-or-before-eur-v1';
  from: FxReference;
  to: FxReference;
  fee: FxReference | null;
  fromEurCents: number;
  toEurCents: number;
  /** Signed destination minus source value; never a synthetic cash fee/income. */
  executionEffectEurCents: number;
  feeEurCents: number;
}
export interface FxTransferPreview {
  revision: string;
  valuation: FxTransferValuation;
  /** Exact decimal in destination major units, without rounding it into a posting amount. */
  theoreticalDestination: string;
  quoteDifferenceDestination: string;
  quoteMatchesNative: boolean;
}

const fail = (message: string): never => { throw new BookingInvariantError(message); };
/** Old migration-copy readers retain their legacy contract; they cannot create the FX variant. */
export function hasFxTransfers(db: Executor) {
  return db.get<{ n: number }>(sql`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='transfer_fx'`)!.n === 1;
}
const positiveCents = (value: number) => Number.isSafeInteger(value) && value > 0;
function actualDay(day: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ||
    !new Date(`${day}T00:00:00Z`).toISOString().startsWith(day) || day > today)
    fail('Der tatsächliche FX-Tag muss gültig sein und spätestens heute liegen.');
}
/** Positive finite decimal, retained exactly rather than converted to a floating-point rate. */
export function fxQuotedRate(text: string) {
  if (text.length > 40 || !/^\d+(?:[.,]\d+)?$/.test(text)) return null;
  const [whole = '', fraction = ''] = text.replace(',', '.').split('.');
  const numerator = BigInt(whole + fraction);
  return numerator > 0n ? { numerator, denominator: 10n ** BigInt(fraction.length), decimals: fraction.length } : null;
}
function exactDestination(fromCents: number, rate: NonNullable<ReturnType<typeof fxQuotedRate>>) {
  const digits = (BigInt(fromCents) * rate.numerator).toString().padStart(rate.decimals + 3, '0');
  const places = rate.decimals + 2;
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, '').replace(/\.$/, '');
}
function quoteDifference(input: FxTransferInput) {
  const rate = fxQuotedRate(input.quotedRate)!;
  const difference = BigInt(input.toAmountCents) * rate.denominator - BigInt(input.fromAmountCents) * rate.numerator;
  const digits = (difference < 0n ? -difference : difference).toString().padStart(rate.decimals + 3, '0');
  const places = rate.decimals + 2;
  const decimal = `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, '').replace(/\.$/, '');
  return `${difference < 0n ? '-' : ''}${decimal}`;
}
function reference(db: Executor, currency: string, day: string): FxReference {
  if (currency === 'EUR') return { currency, asOf: day, date: day, rateMicro: 1_000_000, source: 'EUR identity' };
  const rate = fxRateOnOrBefore(db, currency, day);
  if (!rate || !positiveCents(rate.rateMicro))
    return fail(`Kein datierter EUR-Referenzkurs für ${currency} am oder vor dem ${day}. Manuell klären.`);
  return { ...rate, asOf: day };
}
function expenseCategory(db: Executor, id: string) {
  const row = db.select().from(category).where(and(eq(category.id, id), isNull(category.deletedAt))).get();
  if (!row || row.hiddenAt || ['advance', 'card_payment', 'income'].includes(row.kind))
    return fail('Eine aktive Ausgabenkategorie ist erforderlich.');
  return row;
}
function eurValue(amountCents: number, rateMicro: number) {
  try { return toEurCents(amountCents, rateMicro); }
  catch (error) {
    if (error instanceof RangeError) return fail('Die EUR-Bewertung überschreitet den unterstützten Ganzzahlbereich.');
    throw error;
  }
}

/** No write, guessed principal, parity fallback or future FX. Call in a snapshot transaction. */
export function prepareFxTransfer(db: Executor, input: FxTransferInput, today: string): FxTransferPreview {
  if (!hasFxTransfers(db)) return fail('Die explizite FX-Verwaltung ist in diesem Datenstand noch nicht verfügbar.');
  actualDay(input.date, today);
  const rate = fxQuotedRate(input.quotedRate);
  if (!rate || input.orientation !== 'destination/source' || input.principalAmountsConfirmed !== true ||
    !positiveCents(input.fromAmountCents) || !positiveCents(input.toAmountCents) ||
    !input.provenance.trim() || input.provenance.length > 500)
    return fail('Beide tatsächlichen Hauptbeträge, Kursrichtung, positiver Kurs und Nachweis sind erforderlich.');
  const load = (id: string) => db.select().from(account).where(and(eq(account.id, id), isNull(account.deletedAt))).get();
  const from = load(input.fromAccountId), to = load(input.toAccountId);
  if (!from || !to || from.id === to.id || from.currency === to.currency ||
    from.currency !== input.fromCurrency || to.currency !== input.toCurrency ||
    [from, to].some((row) => row.closedAt || !['checking', 'savings', 'cash'].includes(row.type) ||
      !['EUR', 'USD'].includes(row.currency) || row.openingDate > input.date || (row.onBudget && row.currency !== 'EUR')))
    return fail('FX unterstützt zwei offene EUR-/USD-Geldkonten mit unterschiedlichen Währungen und gültigem Starttag.');
  const principalCategory = from.onBudget !== to.onBudget
    ? input.categoryId ? expenseCategory(db, input.categoryId) : fail('Die Budgetseite benötigt eine ausdrückliche Hauptbetragskategorie.')
    : input.categoryId ? fail('Tracking-interne Überträge haben keine Budgetkategorie.') : null;
  if (input.feeTreatment !== 'none' && input.feeTreatment !== 'separate') return fail('Gebührenbehandlung ausdrücklich wählen.');
  if ((input.feeTreatment === 'separate') !== Boolean(input.fee)) return fail('Getrennte Gebühr vollständig angeben; eingebettete Gebühren bleiben manuell.');
  let feeReference: FxReference | null = null;
  let feeCategory: ReturnType<typeof expenseCategory> | null = null;
  if (input.fee) {
    const fee = input.fee;
    actualDay(fee.date, today);
    const feeAccount = fee.accountId === from.id ? from : fee.accountId === to.id ? to : null;
    if (!feeAccount || fee.date < feeAccount.openingDate || !positiveCents(fee.amountCents) ||
      !fee.provenance.trim() || fee.provenance.length > 500 || fee.categoryId === input.categoryId)
      return fail('Die getrennte tatsächliche Gebühr benötigt ein beteiligtes Konto, eigenen Nachweis und eine separate Ausgabenkategorie.');
    feeCategory = expenseCategory(db, fee.categoryId);
    feeReference = reference(db, feeAccount.currency, fee.date);
  }
  const fromReference = reference(db, from.currency, input.date);
  const toReference = reference(db, to.currency, input.date);
  const fromEurCents = eurValue(input.fromAmountCents, fromReference.rateMicro);
  const toEurCentsValue = eurValue(input.toAmountCents, toReference.rateMicro);
  const effect = toEurCentsValue - fromEurCents;
  if (!Number.isSafeInteger(effect)) return fail('Die EUR-Wertdifferenz überschreitet den unterstützten Bereich.');
  const valuation: FxTransferValuation = {
    policy: 'dated-on-or-before-eur-v1', from: fromReference, to: toReference, fee: feeReference,
    fromEurCents, toEurCents: toEurCentsValue, executionEffectEurCents: effect,
    feeEurCents: input.fee && feeReference ? eurValue(input.fee.amountCents, feeReference.rateMicro) : 0,
  };
  return {
    revision: createHash('sha256').update(JSON.stringify([input, from, to, principalCategory, feeCategory, valuation])).digest('hex'),
    valuation,
    theoreticalDestination: exactDestination(input.fromAmountCents, rate),
    quoteDifferenceDestination: quoteDifference(input),
    quoteMatchesNative: BigInt(input.toAmountCents) * rate.denominator === BigInt(input.fromAmountCents) * rate.numerator,
  };
}

/** Immutable retained facts are shared by readouts and invariants, never reparsed from rendered money. */
export function fxFacts(row: typeof transferFx.$inferSelect): FxTransferInput {
  const facts = JSON.parse(row.factsJson) as { version?: number; input?: FxTransferInput };
  if (facts.version !== 1 || !facts.input || !positiveCents(facts.input.fromAmountCents) ||
    !positiveCents(facts.input.toAmountCents) || !fxQuotedRate(facts.input.quotedRate))
    return fail('FX-Nachweis ist ungültig.');
  return facts.input;
}
export function fxLinksOfBooking(db: Executor, id: string) {
  if (!hasFxTransfers(db)) return undefined;
  return db.select().from(transferFx).where(or(eq(transferFx.fromBookingId, id),
    eq(transferFx.toBookingId, id), eq(transferFx.feeBookingId, id))).get();
}
export function fxLinksOfBookings(db: Executor, ids: readonly string[]) {
  const rows = new Map<string, typeof transferFx.$inferSelect>();
  if (!hasFxTransfers(db)) return [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const part = ids.slice(offset, offset + 200);
    for (const row of db.select().from(transferFx).where(or(inArray(transferFx.fromBookingId, part),
      inArray(transferFx.toBookingId, part), inArray(transferFx.feeBookingId, part))).all()) rows.set(row.id, row);
  }
  return [...rows.values()];
}
export function readFxTransfer(db: Executor, bookingId: string, asOf: string) {
  return runInTransaction(db, (tx) => {
    const row = fxLinksOfBooking(tx, bookingId);
    if (!row) throw new EntityNotFoundError('transfer_fx', bookingId);
    const input = fxFacts(row);
    const observed = (currency: string) => {
      try { return reference(tx, currency, asOf); }
      catch (error) { if (error instanceof BookingInvariantError) return null; throw error; }
    };
    const currentFrom = observed(input.fromCurrency), currentTo = observed(input.toCurrency);
    const currentEffect = asOf >= input.date && currentFrom && currentTo
      ? eurValue(input.toAmountCents, currentTo.rateMicro) - eurValue(input.fromAmountCents, currentFrom.rateMicro) : null;
    if (currentEffect !== null && !Number.isSafeInteger(currentEffect)) return fail('EUR-Wertdifferenz außerhalb des unterstützten Bereichs.');
    const legs = tx.select({ id: booking.id, deletedAt: booking.deletedAt }).from(booking)
      .where(or(eq(booking.id, row.fromBookingId), eq(booking.id, row.toBookingId))).all();
    return { transferId: row.id, fromBookingId: row.fromBookingId, toBookingId: row.toBookingId,
      feeBookingId: row.feeBookingId, deleted: Boolean(row.deletedAt) || legs.some((leg) => leg.deletedAt !== null), input,
      recorded: JSON.parse(row.valuationJson) as FxTransferValuation,
      theoreticalDestination: exactDestination(input.fromAmountCents, fxQuotedRate(input.quotedRate)!),
      quoteDifferenceDestination: quoteDifference(input),
      quoteMatchesNative: BigInt(input.toAmountCents) * fxQuotedRate(input.quotedRate)!.denominator ===
        BigInt(input.fromAmountCents) * fxQuotedRate(input.quotedRate)!.numerator,
      reporting: { asOf, from: currentFrom, to: currentTo, executionEffectEurCents: currentEffect } };
  });
}
export type FxTransferDetail = ReturnType<typeof readFxTransfer>;
