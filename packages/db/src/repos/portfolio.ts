import {
  addDays,
  dailyMarketMoveCents,
  dailyValuation,
  depotFlows,
  eachDay,
  fxOn,
  marketValueEurCents,
  PriceUnavailableError,
  netWorthAttribution,
  securityFlows,
  toEurCents,
  unitsHeld,
  type CashFlow,
  type PositionInput,
  type RateTable,
  type SeriesTrade,
  type ValuationSeries,
} from '@budget/domain';
import { and, eq, gt, inArray, isNotNull, isNull, lte, max, min, sql } from 'drizzle-orm';
import {
  account,
  booking,
  bookingSplit,
  fxRate,
  holding,
  price,
  priceAudit,
  INCOME_TYPES,
  security,
  trade,
} from '../schema';
import { lastSuccessfulMarketRun } from './market';
import { accountBalances } from './queries';
import { MissingFxRateError } from './errors';
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

function rateOrMissing(rates: Rates, currency: string, asOf: string): number | undefined {
  if (currency === 'EUR') return 1_000_000;
  return rates
    .filter((r) => r.currency === currency && r.date <= asOf)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.rateMicro;
}

/**
 * Market value of every position (account × security) on a day: units held in that account
 * (latest snapshot of that account plus its later trades) times the latest price, converted to EUR
 * with the stored ECB rate of the price currency. Soft-deleted rows are ignored; positions without
 * units are left out; held securities without a quote remain explicitly unavailable.
 */
interface HoldingValuation {
  values: HoldingValue[];
  missingFxByAccount: Map<string, Set<string>>;
  missingPricePositions: Array<{ accountId: string; securityId: string; unitsE8: number }>;
  missingFxPositions: Array<{
    accountId: string;
    securityId: string;
    unitsE8: number;
    priceMicro: number;
    priceDate: string;
    priceCurrency: string;
  }>;
}

function holdingValuationAsOf(db: Executor, asOf: string): HoldingValuation {
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
  const missingFxPositions: HoldingValuation['missingFxPositions'] = [];
  const missingPricePositions: HoldingValuation['missingPricePositions'] = [];
  const missingFxByAccount = new Map<string, Set<string>>();
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
    if (!latest) {
      missingPricePositions.push({ accountId, securityId, unitsE8: units });
      continue;
    }
    const { priceMicro, currency: priceCurrency } = latest;
    const fxRateMicro = rateOrMissing(rates, priceCurrency, asOf);
    if (fxRateMicro === undefined) {
      const missing = missingFxByAccount.get(accountId) ?? new Set<string>();
      missing.add(priceCurrency);
      missingFxByAccount.set(accountId, missing);
      missingFxPositions.push({
        accountId,
        securityId,
        unitsE8: units,
        priceMicro,
        priceDate: latest.date,
        priceCurrency,
      });
      continue;
    }
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
  return {
    values: out.sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
    missingFxByAccount,
    missingPricePositions: missingPricePositions.sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
    missingFxPositions: missingFxPositions.sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
  };
}

/** Export details retain every held position, including missing quotes or exchange rates. */
export function holdingValuationExportAsOf(
  db: Executor,
  asOf: string,
): {
  values: HoldingValue[];
  missingFxByAccount: Map<string, Set<string>>;
  missingFxPositions: HoldingValuation['missingFxPositions'];
  missingPricePositions: HoldingValuation['missingPricePositions'];
} {
  return holdingValuationAsOf(db, asOf);
}

export function holdingValuesAsOf(db: Executor, asOf: string): HoldingValue[] {
  const valuation = holdingValuationAsOf(db, asOf);
  const missing = [...valuation.missingFxByAccount.values()].flatMap((set) => [...set]).sort();
  const currency = missing[0];
  if (currency) throw new MissingFxRateError(currency, asOf);
  const unpriced = valuation.missingPricePositions[0];
  if (unpriced) throw new PriceUnavailableError(unpriced.accountId, unpriced.securityId, asOf);
  return valuation.values;
}

export interface NetWorth {
  totalCents: number;
  /** Per account: balance in EUR (converted for foreign-currency accounts) plus its positions. */
  byAccount: Record<string, number>;
}

/** Non-throwing shared EUR valuation for account reads that must remain usable without all quotes or FX. */
export interface NetWorthValuation {
  totalCents: number | null;
  /** Per account, in EUR; `null` means at least one component could not be valued. */
  byAccount: Record<string, number | null>;
  /** Market value of each account's positions, in EUR; `null` means a position quote or rate is missing. */
  holdingsByAccount: Record<string, number | null>;
  /** Sorted currencies with no rate on or before the requested day. */
  missingFxCurrencies: string[];
  /** Missing currencies for each affected account. */
  missingFxByAccount: Record<string, string[]>;
  /** Sorted held securities without a quote on or before the requested day. */
  missingPriceSecurityIds: string[];
  missingPriceByAccount: Record<string, string[]>;
}

/** Shared valuation source for account DTOs and the strict wealth calculation. */
export function netWorthValuationAsOf(db: Executor, asOf: string): NetWorthValuation {
  const accountRows = db
    .select({ id: account.id, currency: account.currency })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
  const currencies = new Map(accountRows.map((row) => [row.id, row.currency]));
  const rates: Rates = db.select().from(fxRate).where(lte(fxRate.date, asOf)).all();
  const byAccount: Record<string, number | null> = {};
  const missingFxByAccount = new Map<string, Set<string>>();
  const addMissing = (accountId: string, currency: string) => {
    const missing = missingFxByAccount.get(accountId) ?? new Set<string>();
    missing.add(currency);
    missingFxByAccount.set(accountId, missing);
    byAccount[accountId] = null;
  };
  for (const balance of accountBalances(db, asOf)) {
    const currency = currencies.get(balance.accountId) ?? 'EUR';
    const rate = balance.balanceCents === 0 ? 1_000_000 : rateOrMissing(rates, currency, asOf);
    if (rate === undefined) addMissing(balance.accountId, currency);
    else byAccount[balance.accountId] = toEurCents(balance.balanceCents, rate);
  }

  const holdings = holdingValuationAsOf(db, asOf);
  const holdingsByAccount: Record<string, number | null> = {};
  for (const holding of holdings.values) {
    if (holdingsByAccount[holding.accountId] === null) continue;
    holdingsByAccount[holding.accountId] =
      (holdingsByAccount[holding.accountId] ?? 0) + holding.valueCents;
    if (byAccount[holding.accountId] !== null) {
      byAccount[holding.accountId] = (byAccount[holding.accountId] ?? 0) + holding.valueCents;
    }
  }
  for (const [accountId, currencies] of holdings.missingFxByAccount) {
    holdingsByAccount[accountId] = null;
    for (const currency of currencies) addMissing(accountId, currency);
  }
  const missingPriceByAccount = new Map<string, Set<string>>();
  for (const holding of holdings.missingPricePositions) {
    const ids = missingPriceByAccount.get(holding.accountId) ?? new Set<string>();
    ids.add(holding.securityId);
    missingPriceByAccount.set(holding.accountId, ids);
    holdingsByAccount[holding.accountId] = null;
    byAccount[holding.accountId] = null;
  }
  const missingPriceSecurityIds = [
    ...new Set([...missingPriceByAccount.values()].flatMap((s) => [...s])),
  ].sort();
  const missingFxCurrencies = [
    ...new Set([...missingFxByAccount.values()].flatMap((s) => [...s])),
  ].sort();
  const values = Object.values(byAccount);
  const knownValues = values.filter((value): value is number => value !== null);
  const totalCents =
    missingFxCurrencies.length || knownValues.length !== values.length
      ? null
      : knownValues.reduce((sum, value) => sum + value, 0);
  return {
    totalCents,
    byAccount,
    holdingsByAccount,
    missingFxCurrencies,
    missingPriceSecurityIds,
    missingPriceByAccount: Object.fromEntries(
      [...missingPriceByAccount].map(([id, values]) => [id, [...values].sort()]),
    ),
    missingFxByAccount: Object.fromEntries(
      [...missingFxByAccount].map(([id, values]) => [id, [...values].sort()]),
    ),
  };
}

/** Net worth on a day: every live account's balance in EUR plus the market value of its positions. */
export function netWorthAsOf(db: Executor, asOf: string): NetWorth {
  const valuation = netWorthValuationAsOf(db, asOf);
  const missing = valuation.missingFxCurrencies[0];
  if (missing) throw new MissingFxRateError(missing, asOf);
  const unpriced = Object.entries(valuation.missingPriceByAccount)[0];
  if (unpriced) throw new PriceUnavailableError(unpriced[0], unpriced[1][0]!, asOf);
  if (valuation.totalCents === null) throw new Error('Complete valuation has no total');
  const byAccount = Object.fromEntries(
    Object.entries(valuation.byAccount).map(([id, value]) => {
      if (value === null) throw new Error(`Complete valuation is missing account ${id}`);
      return [id, value];
    }),
  );
  return { totalCents: valuation.totalCents, byAccount };
}

// ---------------------------------------------------------------------------------------------
// P5.2 read models: daily series in one pass (no `netWorthAsOf` per day).
// ---------------------------------------------------------------------------------------------

function rateTable(db: Executor, to: string): RateTable {
  const table = new Map<string, { date: string; rateMicro: number }[]>();
  const rows = db.select().from(fxRate).where(lte(fxRate.date, to)).all();
  for (const r of rows.sort((a, b) => a.date.localeCompare(b.date))) {
    const list = table.get(r.currency) ?? [];
    list.push({ date: r.date, rateMicro: r.rateMicro });
    table.set(r.currency, list);
  }
  return table;
}

export interface SeriesFilter {
  /** Only positions in these accounts (default: all). */
  accounts?: ReadonlyArray<string>;
  /** Only these securities (default: all live securities). */
  securities?: ReadonlyArray<string>;
  /** First and last day, both included (`YYYY-MM-DD`). */
  from: string;
  to: string;
}

type MutablePosition = PositionInput & {
  snapshots: { date: string; unitsE8: number }[];
  trades: { date: string; unitsE8: number }[];
};

/**
 * Daily market value of positions (account x security, C10) from `from` to `to`: units (latest
 * snapshot plus later trades) x price carried forward x ECB rate of that day, one rounding per
 * position and day. Equals `holdingValuesAsOf` on every day (property-tested); the rows are read
 * once for the whole window. Soft-deleted rows are ignored; positions without units in the whole
 * window are left out.
 */
export function valuationSeries(db: Executor, filter: SeriesFilter): ValuationSeries {
  const days = eachDay(filter.from, filter.to);
  const live = new Set(
    db
      .select({ id: security.id })
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => s.id),
  );
  const wantSecurity = (id: string) =>
    live.has(id) && (filter.securities === undefined || filter.securities.includes(id));
  const wantAccount = (id: string) => filter.accounts === undefined || filter.accounts.includes(id);
  const snapshots = db
    .select()
    .from(holding)
    .where(and(lte(holding.asOf, filter.to), isNull(holding.deletedAt)))
    .all()
    .filter((r) => wantSecurity(r.securityId) && wantAccount(r.accountId));
  const trades = db
    .select({
      securityId: trade.securityId,
      accountId: trade.accountId,
      date: trade.date,
      unitsE8: trade.unitsE8,
    })
    .from(trade)
    .where(and(lte(trade.date, filter.to), isNull(trade.deletedAt)))
    .all()
    .filter((r) => wantSecurity(r.securityId) && wantAccount(r.accountId));
  const pricesBySecurity = new Map<
    string,
    { date: string; priceMicro: number; currency: string }[]
  >();
  for (const p of db.select().from(price).where(lte(price.date, filter.to)).all()) {
    if (!wantSecurity(p.securityId)) continue;
    const list = pricesBySecurity.get(p.securityId) ?? [];
    list.push({ date: p.date, priceMicro: p.priceMicro, currency: p.currency });
    pricesBySecurity.set(p.securityId, list);
  }

  const positions = new Map<string, MutablePosition>();
  const at = (accountId: string, securityId: string): MutablePosition => {
    const key = `${accountId} ${securityId}`;
    let p = positions.get(key);
    if (!p) {
      p = {
        accountId,
        securityId,
        snapshots: [],
        trades: [],
        prices: pricesBySecurity.get(securityId) ?? [],
      };
      positions.set(key, p);
    }
    return p;
  };
  for (const r of snapshots)
    at(r.accountId, r.securityId).snapshots.push({ date: r.asOf, unitsE8: r.unitsE8 });
  for (const r of trades)
    at(r.accountId, r.securityId).trades.push({ date: r.date, unitsE8: r.unitsE8 });

  const series = dailyValuation(
    [...positions.values()].sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
    days,
    rateTable(db, filter.to),
  );
  return { ...series, positions: series.positions.filter((p) => p.unitsE8.some((u) => u !== 0)) };
}

/**
 * Daily balance in EUR of accounts (all live accounts when `accounts` is omitted) for `days`: the
 * rule of `accountBalances` (0 before the opening date, afterwards opening balance plus the
 * bookings dated from the opening date on, up to the day), converted with the ECB rate of the day
 * for foreign-currency accounts (a zero balance needs no rate).
 */
export function cashSeries(
  db: Executor,
  days: ReadonlyArray<string>,
  accounts?: ReadonlyArray<string>,
): Map<string, number[]> {
  const to = days[days.length - 1];
  const out = new Map<string, number[]>();
  if (to === undefined) return out;
  const rates = rateTable(db, to);
  const rows = db
    .select({
      id: account.id,
      currency: account.currency,
      openingDate: account.openingDate,
      openingBalanceCents: account.openingBalanceCents,
    })
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .filter((a) => accounts === undefined || accounts.includes(a.id));
  const sums = db
    .select({
      accountId: booking.accountId,
      date: booking.date,
      cents: sql<number>`SUM(${booking.amountCents})`.mapWith(Number),
    })
    .from(booking)
    .where(and(isNull(booking.deletedAt), lte(booking.date, to)))
    .groupBy(booking.accountId, booking.date)
    .orderBy(booking.date)
    .all();
  const byAccount = new Map<string, { date: string; cents: number }[]>();
  for (const s of sums) {
    const list = byAccount.get(s.accountId) ?? [];
    list.push({ date: s.date, cents: s.cents });
    byAccount.set(s.accountId, list);
  }
  for (const a of rows) {
    const list = byAccount.get(a.id) ?? [];
    let i = 0;
    let running = 0; // bookings dated from the opening date on
    out.set(
      a.id,
      days.map((day) => {
        while (i < list.length && (list[i] as { date: string }).date <= day) {
          const row = list[i] as { date: string; cents: number };
          if (row.date >= a.openingDate) running += row.cents;
          i++;
        }
        const balance = a.openingDate <= day ? a.openingBalanceCents + running : 0;
        return a.currency === 'EUR' || balance === 0
          ? balance
          : toEurCents(balance, fxOn(rates, a.currency, day));
      }),
    );
  }
  return out;
}

export interface FlowFilter {
  accounts?: ReadonlyArray<string>;
  securities?: ReadonlyArray<string>;
  /** Flows on days after `from` up to and including `to` (the start value is that of `from`). */
  from: string;
  to: string;
}

/** Live trades after `after` up to `filter.to`, with the currency of their account. */
function tradesOf(
  db: Executor,
  filter: FlowFilter,
  after: string,
): (SeriesTrade & { accountId: string; securityId: string })[] {
  return db
    .select({
      accountId: trade.accountId,
      securityId: trade.securityId,
      date: trade.date,
      kind: trade.kind,
      unitsE8: trade.unitsE8,
      amountCents: trade.amountCents,
      feeCents: trade.feeCents,
      taxCents: trade.taxCents,
      currency: account.currency,
    })
    .from(trade)
    .innerJoin(account, eq(account.id, trade.accountId))
    .where(and(isNull(trade.deletedAt), lte(trade.date, filter.to)))
    .all()
    .filter(
      (t) =>
        t.date > after &&
        (filter.accounts === undefined || filter.accounts.includes(t.accountId)) &&
        (filter.securities === undefined || filter.securities.includes(t.securityId)),
    );
}

/**
 * Cash flows of a portfolio (a set of accounts) in EUR cents, positive = money in, for the days
 * after `from` up to `to`:
 * - `securities` (default): the "securities only" view of Portfolio Performance. Buys are inflows;
 *   sales, dividends and interest are outflows; fees and taxes cost the investor (exact rules at
 *   `securityFlows` in the domain);
 * - `depot`: "depot incl. reference account". Only transfers between a reference account and an
 *   account outside the portfolio (`accounts` plus `referenceAccounts`) are flows; buys, sales,
 *   dividends and costs inside the portfolio are internal. A plain booking directly on a
 *   reference account (not Kapitalerträge, not a trade settlement) is a deposit (inflow) or a
 *   withdrawal (outflow) from outside, too. Its value series is `valuationSeries`
 *   plus `cashSeries` of the reference accounts.
 */
export function portfolioFlows(
  db: Executor,
  filter: FlowFilter & { view?: 'securities' | 'depot'; referenceAccounts?: ReadonlyArray<string> },
): CashFlow[] {
  const rates = rateTable(db, filter.to);
  if ((filter.view ?? 'securities') === 'securities')
    return securityFlows(tradesOf(db, filter, filter.from), rates);

  const reference = new Set(filter.referenceAccounts ?? []);
  const inside = new Set([...(filter.accounts ?? []), ...reference]);
  // Both kinds of transfer legs: whole bookings and single splits.
  const legs = [
    ...db
      .select({
        transferId: booking.transferId,
        accountId: booking.accountId,
        date: booking.date,
        cents: booking.amountCents,
        currency: booking.currency,
      })
      .from(booking)
      .where(
        and(isNull(booking.deletedAt), isNotNull(booking.transferId), lte(booking.date, filter.to)),
      )
      .all(),
    ...db
      .select({
        transferId: bookingSplit.transferId,
        accountId: booking.accountId,
        date: booking.date,
        cents: bookingSplit.amountCents,
        currency: booking.currency,
      })
      .from(bookingSplit)
      .innerJoin(booking, eq(booking.id, bookingSplit.bookingId))
      .where(
        and(
          isNull(booking.deletedAt),
          isNotNull(bookingSplit.transferId),
          lte(booking.date, filter.to),
        ),
      )
      .all(),
  ];
  const byTransfer = new Map<string, typeof legs>();
  for (const leg of legs) {
    const list = byTransfer.get(leg.transferId as string) ?? [];
    list.push(leg);
    byTransfer.set(leg.transferId as string, list);
  }
  const boundary: { date: string; cents: number; currency: string }[] = [];
  for (const leg of legs) {
    if (!reference.has(leg.accountId) || leg.date <= filter.from) continue;
    const others = (byTransfer.get(leg.transferId as string) ?? []).filter((l) => l !== leg);
    if (others.every((o) => !inside.has(o.accountId)))
      boundary.push({ date: leg.date, cents: leg.cents, currency: leg.currency });
  }
  // A plain booking straight onto a reference account is money from
  // outside, like in Portfolio Performance: an inflow is a deposit (Einlage), an outflow a
  // withdrawal (Entnahme). Trade settlements (including standalone fees and taxes, which are
  // trades) and income of type Kapitalerträge stay inside: they are performance.
  boundary.push(...externalDeposits(db, reference, filter.from, filter.to));
  return depotFlows(boundary, rates);
}

/** Deposits onto and withdrawals from `accounts` after `from` up to `to`: see `portfolioFlows` (depot view). */
function externalDeposits(
  db: Executor,
  accounts: ReadonlySet<string>,
  from: string,
  to: string,
): { date: string; cents: number; currency: string }[] {
  if (accounts.size === 0) return [];
  const settlements = new Set(
    db
      .select({ id: trade.bookingId })
      .from(trade)
      .where(and(isNull(trade.deletedAt), isNotNull(trade.bookingId)))
      .all()
      .map((r) => r.id as string),
  );
  const plain = db
    .select({
      id: booking.id,
      accountId: booking.accountId,
      date: booking.date,
      currency: booking.currency,
    })
    .from(booking)
    .where(
      and(
        isNull(booking.deletedAt),
        isNull(booking.transferId),
        inArray(booking.accountId, [...accounts]),
        gt(booking.date, from),
        lte(booking.date, to),
      ),
    )
    .all()
    .filter((b) => !settlements.has(b.id));
  if (plain.length === 0) return [];
  const splits = db
    .select({
      bookingId: bookingSplit.bookingId,
      cents: bookingSplit.amountCents,
      transferId: bookingSplit.transferId,
      incomeTypeId: bookingSplit.incomeTypeId,
    })
    .from(bookingSplit)
    .where(
      inArray(
        bookingSplit.bookingId,
        plain.map((b) => b.id),
      ),
    )
    .all();
  const out: { date: string; cents: number; currency: string }[] = [];
  for (const b of plain) {
    const cents = splits
      .filter(
        (s) =>
          s.bookingId === b.id &&
          s.transferId === null &&
          s.incomeTypeId !== INCOME_TYPES.capital.id,
      )
      .reduce((a, s) => a + s.cents, 0);
    if (cents !== 0) out.push({ date: b.date, cents, currency: b.currency });
  }
  return out;
}

export interface NetWorthDay {
  date: string;
  netWorthCents: number;
  /** Change against the previous day. */
  changeCents: number;
  /** Market move of the positions that day (value change minus the gross traded in). */
  marketCents: number;
  /** Everything else: income, spending, repayments, fees. */
  ownCents: number;
  /** Sums of `marketCents` / `ownCents` from `from` up to this day. */
  cumulativeMarketCents: number;
  cumulativeOwnCents: number;
}

/**
 * Net worth per day from `from` to `to` in one pass: balances of all live accounts plus the market
 * value of all positions, equal to `netWorthAsOf` on every day (property-tested), split into the
 * market move of the products and the rest (`netWorthAttribution`, SPEC section 6: own
 * contribution = change - market). Foreign-currency cash moves count as own.
 */
export function netWorthDaily(db: Executor, from: string, to: string): NetWorthDay[] {
  const baseline = addDays(from, -1);
  const days = eachDay(baseline, to);
  const cash = cashSeries(db, days);
  const positions = valuationSeries(db, { from: baseline, to });
  const rates = rateTable(db, to);
  const tradesByDay = new Map<string, SeriesTrade[]>();
  for (const t of tradesOf(db, { from, to }, baseline)) {
    const list = tradesByDay.get(t.date) ?? [];
    list.push(t);
    tradesByDay.set(t.date, list);
  }
  const total = days.map((_, i) => {
    let sum = positions.totalCents[i] as number;
    for (const series of cash.values()) sum += series[i] as number;
    return sum;
  });
  const out: NetWorthDay[] = [];
  let cumulativeMarketCents = 0;
  let cumulativeOwnCents = 0;
  for (let i = 1; i < days.length; i++) {
    const date = days[i] as string;
    const market = dailyMarketMoveCents(
      (positions.totalCents[i] as number) - (positions.totalCents[i - 1] as number),
      tradesByDay.get(date) ?? [],
      rates,
    );
    const split = netWorthAttribution({
      previousCents: total[i - 1] as number,
      currentCents: total[i] as number,
      marketMoveCents: market,
    });
    cumulativeMarketCents += split.marketCents;
    cumulativeOwnCents += split.ownCents;
    out.push({
      date,
      netWorthCents: total[i] as number,
      changeCents: split.changeCents,
      marketCents: split.marketCents,
      ownCents: split.ownCents,
      cumulativeMarketCents,
      cumulativeOwnCents,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// P5.4 read models for the Vermögen pages.
// ---------------------------------------------------------------------------------------------

/** First day of any live account (its opening date): where "Alles" starts. */
export function earliestAccountDate(db: Executor): string | null {
  return (
    db
      .select({ day: min(account.openingDate) })
      .from(account)
      .where(isNull(account.deletedAt))
      .get()?.day ?? null
  );
}

export interface PriceStand {
  /** Day of the newest price on or before `asOf`; `null` without any price. */
  priceDate: string | null;
  /** When that day's prices were written by a refresh or a manual entry (ISO UTC), if recorded. */
  priceAt: string | null;
}

/** "Stand" of the Vermögen pages: the newest price day and, when recorded, its timestamp. */
export function priceStand(db: Executor, asOf: string): PriceStand {
  const priceDate =
    db
      .select({ day: max(price.date) })
      .from(price)
      .where(lte(price.date, asOf))
      .get()?.day ?? null;
  if (priceDate === null) return { priceDate: null, priceAt: null };
  // The refresh run log is the source of "Kurse HH:MM"; without one (jobs called directly, prices
  // entered by hand) the time the newest day's prices were written stays the fallback.
  const run = lastSuccessfulMarketRun(db);
  const priceAt =
    run?.finishedAt ??
    db
      .select({ ts: max(priceAudit.ts) })
      .from(priceAudit)
      .where(eq(priceAudit.date, priceDate))
      .get()?.ts ??
    null;
  return { priceDate, priceAt };
}

export interface AccountValue {
  accountId: string;
  name: string;
  type: string;
  /** Cash balance in EUR plus the market value of the account's positions. */
  valueCents: number;
}

/** What each live account is worth on a day (`netWorthAsOf`), debts negative; zero values are left out. */
export function accountValuesAsOf(db: Executor, asOf: string): AccountValue[] {
  const { byAccount } = netWorthAsOf(db, asOf);
  return db
    .select({ id: account.id, name: account.name, type: account.type })
    .from(account)
    .where(isNull(account.deletedAt))
    .all()
    .map((a) => ({ accountId: a.id, name: a.name, type: a.type, valueCents: byAccount[a.id] ?? 0 }))
    .filter((a) => a.valueCents !== 0);
}
