import { marketValueEurCents, toEurCents, unitsHeld } from '@budget/domain';
import { and, isNull, lte } from 'drizzle-orm';
import { account, fxRate, holding, price, security, trade } from '../schema';
import { accountBalances } from './queries';
import type { Executor } from './types';

/** One position: a security in one account (C10), valued in EUR. */
export interface HoldingValue {
  accountId: string;
  securityId: string;
  unitsE8: number;
  /** Latest price on or before the day, in the price currency (micro-units). */
  priceMicro: number;
  priceCurrency: string;
  /** EUR per unit of the price currency (1 000 000 for EUR). */
  fxRateMicro: number;
  valueCents: number;
}

type Rates = { currency: string; date: string; rateMicro: number }[];

/** Latest stored rate of `currency` on or before `asOf` (EUR = 1). Missing rates are an error. */
function rateOn(rates: Rates, currency: string, asOf: string): number {
  if (currency === 'EUR') return 1_000_000;
  const found = rates
    .filter((r) => r.currency === currency && r.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!found) throw new Error(`No exchange rate for ${currency} on or before ${asOf}`);
  return found.rateMicro;
}

/**
 * Market value of every position (account × security) on a day: units held in that account
 * (latest snapshot of that account plus its later trades) times the latest price, converted to EUR
 * with the stored ECB rate of the price currency. Soft-deleted rows are ignored; positions without
 * units are left out; a security without a price is valued 0.
 */
export function holdingValuesAsOf(db: Executor, asOf: string): HoldingValue[] {
  const live = new Set(
    db
      .select({ id: security.id })
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => s.id),
  );
  const snapshots = db
    .select()
    .from(holding)
    .where(and(lte(holding.asOf, asOf), isNull(holding.deletedAt)))
    .all();
  const trades = db
    .select({
      securityId: trade.securityId,
      accountId: trade.accountId,
      date: trade.date,
      unitsE8: trade.unitsE8,
    })
    .from(trade)
    .where(and(lte(trade.date, asOf), isNull(trade.deletedAt)))
    .all();
  const prices = db.select().from(price).where(lte(price.date, asOf)).all();
  const rates: Rates = db.select().from(fxRate).where(lte(fxRate.date, asOf)).all();

  const keys = new Map<string, { accountId: string; securityId: string }>();
  for (const r of [...snapshots, ...trades])
    if (live.has(r.securityId)) keys.set(`${r.accountId} ${r.securityId}`, r);
  const out: HoldingValue[] = [];
  for (const { accountId, securityId } of keys.values()) {
    const mine = <T extends { accountId: string; securityId: string }>(rows: T[]) =>
      rows.filter((r) => r.accountId === accountId && r.securityId === securityId);
    const snapshot = mine(snapshots).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    const units = unitsHeld(
      snapshot ? { asOf: snapshot.asOf, unitsE8: snapshot.unitsE8 } : undefined,
      mine(trades),
      asOf,
    );
    if (units === 0) continue;
    const latest = prices
      .filter((p) => p.securityId === securityId)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const priceMicro = latest?.priceMicro ?? 0;
    const priceCurrency = latest?.currency ?? 'EUR';
    const fxRateMicro = rateOn(rates, priceCurrency, asOf);
    out.push({
      accountId,
      securityId,
      unitsE8: units,
      priceMicro,
      priceCurrency,
      fxRateMicro,
      valueCents: marketValueEurCents(units, priceMicro, fxRateMicro),
    });
  }
  return out.sort(
    (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
  );
}

export interface NetWorth {
  totalCents: number;
  /** Per account: balance in EUR (converted for foreign-currency accounts) plus its positions. */
  byAccount: Record<string, number>;
}

/** Net worth on a day: every live account's balance in EUR plus the market value of its positions. */
export function netWorthAsOf(db: Executor, asOf: string): NetWorth {
  const currencies = new Map(
    db
      .select({ id: account.id, currency: account.currency })
      .from(account)
      .all()
      .map((a) => [a.id, a.currency]),
  );
  const rates: Rates = db.select().from(fxRate).where(lte(fxRate.date, asOf)).all();
  const byAccount: Record<string, number> = {};
  for (const b of accountBalances(db, asOf)) {
    const currency = currencies.get(b.accountId) ?? 'EUR';
    byAccount[b.accountId] =
      currency === 'EUR' || b.balanceCents === 0
        ? b.balanceCents
        : toEurCents(b.balanceCents, rateOn(rates, currency, asOf));
  }
  for (const h of holdingValuesAsOf(db, asOf))
    byAccount[h.accountId] = (byAccount[h.accountId] ?? 0) + h.valueCents;
  const totalCents = Object.values(byAccount).reduce((a, v) => a + v, 0);
  return { totalCents, byAccount };
}
