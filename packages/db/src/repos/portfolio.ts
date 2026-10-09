import {
  addDays,
  costBasisOnDay,
  costInEur,
  dailyMarketMoveCents,
  dailyValuation,
  depotFlows,
  eachDay,
  fxOn,
  valueAtPrice,
  netWorthAttribution,
  pickPrice,
  pickTradePrice,
  securityFlows,
  toEurCents,
  unitsHeld,
  type CashFlow,
  type DatedPrice,
  type IncompleteValuation,
  type PositionCostInput,
  type PositionInput,
  type RateTable,
  type SeriesTrade,
  type ValuationOptions,
  type ValuationQuality,
  type ValuationSeries,
} from '@budget/domain';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, max, min, sql } from 'drizzle-orm';
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
  valuation,
} from '../schema';
import { lastSuccessfulMarketRun } from './market';
import { memoized, memoizedShared } from './request-memo';
import { noteIncomplete } from './valuation-notes';
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
  /**
   * `exact`/`stale` from a quote, `exact` also for gross execution prices, or `estimated` from
   * the cost basis (then `priceDate` is null).
   */
  quality: ValuationQuality;
  /** Day of the quote or execution used; `null` for a cost-basis estimate. */
  priceDate: string | null;
}

type Rates = { currency: string; date: string; rateMicro: number }[];

function rateOrMissing(rates: Rates, currency: string, asOf: string): number | undefined {
  if (currency === 'EUR') return 1_000_000;
  // Latest rate on or before the day (the first of equal days), without sorting every call.
  let best: Rates[number] | undefined;
  for (const r of rates)
    if (r.currency === currency && r.date <= asOf && (!best || r.date > best.date)) best = r;
  return best?.rateMicro;
}

/**
 * Market value of every position (account × security) on a day: units held in that account
 * (latest snapshot of that account plus its later trades) times the latest price, converted to EUR
 * with the stored ECB rate of the price currency. Soft-deleted rows are ignored; positions without
 * units are left out; held securities without a quote remain explicitly unavailable.
 */
interface HoldingValuation {
  values: HoldingValue[];
  /** Estimated positions and (when estimating) positions with neither price nor cost basis. */
  incomplete: IncompleteValuation[];
  missingFxByAccount: Map<string, Set<string>>;
  missingPricePositions: Array<{ accountId: string; securityId: string; unitsE8: number }>;
  missingFxPositions: Array<{
    accountId: string;
    securityId: string;
    unitsE8: number;
    priceMicro: number;
    priceDate: string | null;
    priceCurrency: string;
  }>;
}

const positionKey = (p: { accountId: string; securityId: string }) => ({
  accountId: p.accountId,
  securityId: p.securityId,
});

export function holdingValuationAsOf(
  db: Executor,
  asOf: string,
  options: ValuationOptions = {},
): HoldingValuation {
  const estimate = options.estimate ?? true;
  return memoized(db, `holdings|${asOf}|${estimate}`, () =>
    computeHoldingValuation(db, asOf, estimate),
  );
}

/** Every live trade with its account currency, in booking order; read once per request. */
function valuationTrades(db: Executor) {
  return memoizedShared(db, 'valuationTrades', () =>
    db
      .select({
        securityId: trade.securityId,
        accountId: trade.accountId,
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
      .where(isNull(trade.deletedAt))
      .orderBy(trade.date, trade.id)
      .all(),
  );
}

/** The stored rates on or before a day (all rates are read once per request). */
function fxRatesUpTo(db: Executor, asOf: string): Rates {
  return memoizedShared(db, 'fxRates', () => db.select().from(fxRate).all()).filter(
    (r) => r.date <= asOf,
  );
}

function computeHoldingValuation(db: Executor, asOf: string, estimate: boolean): HoldingValuation {
  const live = new Set(
    db
      .select({ id: security.id })
      .from(security)
      .where(isNull(security.deletedAt))
      .all()
      .map((s) => s.id),
  );
  const currencies = new Map(
    db
      .select({ id: account.id, currency: account.currency })
      .from(account)
      .all()
      .map((a) => [a.id, a.currency]),
  );
  const snapshots = db
    .select()
    .from(holding)
    .where(and(lte(holding.asOf, asOf), isNull(holding.deletedAt)))
    .all();
  const allTrades = valuationTrades(db);
  const trades = allTrades.filter((t) => t.date <= asOf);
  const priceTrades = new Map<string, typeof allTrades>();
  for (const t of allTrades) {
    const list = priceTrades.get(t.securityId) ?? [];
    list.push(t);
    priceTrades.set(t.securityId, list);
  }
  const heldSecurities = new Set<string>();
  for (const r of [...snapshots, ...trades])
    if (live.has(r.securityId)) heldSecurities.add(r.securityId);
  // Read the latest stored quote on/before the day by index per held security.
  const latestPrice = (securityId: string) =>
    db
      .select({ date: price.date, priceMicro: price.priceMicro, currency: price.currency })
      .from(price)
      .where(and(eq(price.securityId, securityId), lte(price.date, asOf)))
      .orderBy(desc(price.date))
      .limit(1)
      .get();
  const pricesBySecurity = new Map<string, DatedPrice[]>();
  for (const securityId of heldSecurities) {
    const found = latestPrice(securityId);
    if (found) pricesBySecurity.set(securityId, [found]);
  }
  const rates: Rates = fxRatesUpTo(db, asOf);

  // Rows of each position (account x security), in the order they were read.
  const keys = new Map<string, { accountId: string; securityId: string }>();
  const snapshotsOf = new Map<string, typeof snapshots>();
  const tradesOf = new Map<string, typeof trades>();
  const group = <T extends { accountId: string; securityId: string }>(
    rows: T[],
    into: Map<string, T[]>,
  ) => {
    for (const r of rows) {
      if (!live.has(r.securityId)) continue;
      const key = `${r.accountId} ${r.securityId}`;
      keys.set(key, r);
      const list = into.get(key);
      if (list) list.push(r);
      else into.set(key, [r]);
    }
  };
  group(snapshots, snapshotsOf);
  group(trades, tradesOf);
  const out: HoldingValue[] = [];
  const missingFxPositions: HoldingValuation['missingFxPositions'] = [];
  const missingPricePositions: HoldingValuation['missingPricePositions'] = [];
  const missingFxByAccount = new Map<string, Set<string>>();
  const missingFx = (accountId: string, currency: string) => {
    const missing = missingFxByAccount.get(accountId) ?? new Set<string>();
    missing.add(currency);
    missingFxByAccount.set(accountId, missing);
  };
  for (const [key, { accountId, securityId }] of keys) {
    const mySnapshots = snapshotsOf.get(key) ?? [];
    const myTrades = tradesOf.get(key) ?? [];
    const snapshot = [...mySnapshots].sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    const units = unitsHeld(
      snapshot ? { asOf: snapshot.asOf, unitsE8: snapshot.unitsE8 } : undefined,
      myTrades,
      asOf,
    );
    if (units === 0) continue;
    const prices = pricesBySecurity.get(securityId) ?? [];
    const choice =
      pickPrice(prices, asOf, false) ??
      (estimate ? pickTradePrice(priceTrades.get(securityId) ?? [], asOf) : undefined);
    if (!choice) {
      // No usable price: the moving-average cost basis, flagged as an estimate (step 3 of the
      // fallback order), or nothing at all when even the cost is unknown.
      const accountCurrency = currencies.get(accountId) ?? 'EUR';
      const cost: PositionCostInput = {
        currency: accountCurrency,
        snapshots: mySnapshots.map((r) => ({ date: r.asOf, costBasisCents: r.costBasisCents })),
        trades: myTrades,
      };
      const basis = estimate
        ? costBasisOnDay(
            mySnapshots.map((r) => ({ date: r.asOf, unitsE8: r.unitsE8 })),
            cost,
            asOf,
          )
        : null;
      if (basis !== null && rateOrMissing(rates, accountCurrency, asOf) === undefined) {
        missingFx(accountId, accountCurrency);
        missingFxPositions.push({
          accountId,
          securityId,
          unitsE8: units,
          priceMicro: 0,
          priceDate: null,
          priceCurrency: accountCurrency,
        });
        continue;
      }
      const eur =
        basis === null ? null : costInEur(basis, accountCurrency, toRateTable(rates), asOf);
      if (eur === null) {
        missingPricePositions.push({ accountId, securityId, unitsE8: units });
        continue;
      }
      out.push({
        accountId,
        securityId,
        unitsE8: units,
        // The implied unit price in EUR (micro) behind the estimate.
        priceMicro:
          Math.sign(eur) *
          Math.sign(units) *
          Number(
            (BigInt(Math.abs(eur)) * 10n ** 12n + BigInt(Math.abs(units)) / 2n) /
              BigInt(Math.abs(units)),
          ),
        priceCurrency: 'EUR',
        fxRateMicro: 1_000_000,
        valueCents: eur,
        quality: 'estimated',
        priceDate: null,
      });
      continue;
    }
    const { priceMicro, currency: priceCurrency } = choice.price;
    const fxRateMicro = rateOrMissing(rates, priceCurrency, asOf);
    if (fxRateMicro === undefined) {
      missingFx(accountId, priceCurrency);
      missingFxPositions.push({
        accountId,
        securityId,
        unitsE8: units,
        priceMicro,
        priceDate: choice.price.date,
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
      valueCents: valueAtPrice(units, choice, fxRateMicro),
      quality: choice.quality,
      priceDate: choice.price.date,
    });
  }
  const incomplete: IncompleteValuation[] = [
    ...out
      .filter((h) => h.quality === 'estimated')
      .map((h) => ({
        ...positionKey(h),
        quality: 'estimated' as const,
        days: 1,
        from: asOf,
        to: asOf,
      })),
    ...(estimate
      ? missingPricePositions.map((h) => ({
          ...positionKey(h),
          quality: 'missing' as const,
          days: 1,
          from: asOf,
          to: asOf,
        }))
      : []),
  ];
  noteIncomplete(incomplete);
  return {
    values: out.sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
    incomplete,
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
  options: ValuationOptions = {},
): {
  values: HoldingValue[];
  missingFxByAccount: Map<string, Set<string>>;
  missingFxPositions: HoldingValuation['missingFxPositions'];
  missingPricePositions: HoldingValuation['missingPricePositions'];
} {
  return holdingValuationAsOf(db, asOf, options);
}

/**
 * Value of every held position on a day (fallback order of the domain's `pickPrice`): a position
 * without any price is valued at its cost basis (`quality: 'estimated'`); only a position without a
 * price AND without a cost basis is left out. A missing exchange rate is still an error.
 */
export function holdingValuesAsOf(db: Executor, asOf: string): HoldingValue[] {
  const valuation = holdingValuationAsOf(db, asOf);
  const missing = [...valuation.missingFxByAccount.values()].flatMap((set) => [...set]).sort();
  const currency = missing[0];
  if (currency) throw new MissingFxRateError(currency, asOf);
  return valuation.values;
}

export interface NetWorth {
  totalCents: number;
  /** Per account: balance in EUR (converted for foreign-currency accounts) plus its positions. */
  byAccount: Record<string, number>;
  /** Positions valued by an estimate (cost basis) or not at all on that day. */
  incomplete: IncompleteValuation[];
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
  /** Positions valued by an estimate (cost basis, a later price) or not at all, on this day. */
  incomplete: IncompleteValuation[];
}

/** Shared valuation source for account DTOs and the strict wealth calculation. */
export function netWorthValuationAsOf(
  db: Executor,
  asOf: string,
  options: ValuationOptions = {},
): NetWorthValuation {
  const estimate = options.estimate ?? true;
  return memoized(db, `networth|${asOf}|${estimate}`, () =>
    computeNetWorthValuation(db, asOf, options),
  );
}

function computeNetWorthValuation(
  db: Executor,
  asOf: string,
  options: ValuationOptions,
): NetWorthValuation {
  const estimate = options.estimate ?? true;
  const accountRows = db
    .select({
      id: account.id,
      currency: account.currency,
      type: account.type,
      openingDate: account.openingDate,
    })
    .from(account)
    .where(isNull(account.deletedAt))
    .all();
  const currencies = new Map(accountRows.map((row) => [row.id, row.currency]));
  const holdings = holdingValuationAsOf(db, asOf, options);
  const holdingAccounts = new Set(
    [...holdings.values, ...holdings.missingPricePositions, ...holdings.missingFxPositions].map(
      (h) => h.accountId,
    ),
  );
  const manualAccounts = new Set(
    accountRows
      .filter(
        (a) =>
          a.openingDate <= asOf &&
          (a.type === 'p2p' || a.type === 'other_asset') &&
          !holdingAccounts.has(a.id),
      )
      .map((a) => a.id),
  );
  const manualValues = new Map<string, number>();
  if (manualAccounts.size > 0)
    for (const row of db
      .select()
      .from(valuation)
      .where(and(isNull(valuation.deletedAt), lte(valuation.date, asOf)))
      .orderBy(desc(valuation.date))
      .all()) {
      if (manualAccounts.has(row.accountId) && !manualValues.has(row.accountId))
        manualValues.set(row.accountId, row.valueCents);
    }
  const rates: Rates = fxRatesUpTo(db, asOf);
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
    const nativeCents = manualValues.get(balance.accountId) ?? balance.balanceCents;
    const rate = nativeCents === 0 ? 1_000_000 : rateOrMissing(rates, currency, asOf);
    if (rate === undefined) addMissing(balance.accountId, currency);
    else byAccount[balance.accountId] = toEurCents(nativeCents, rate);
  }

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
    // Strict: an unpriced position makes the account unknown. Otherwise (no price and no cost
    // basis) it adds nothing and is reported as `missing`.
    if (!estimate) {
      holdingsByAccount[holding.accountId] = null;
      byAccount[holding.accountId] = null;
    }
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
    incomplete: holdings.incomplete,
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
  if (valuation.totalCents === null) throw new Error('Complete valuation has no total');
  const byAccount = Object.fromEntries(
    Object.entries(valuation.byAccount).map(([id, value]) => {
      if (value === null) throw new Error(`Complete valuation is missing account ${id}`);
      return [id, value];
    }),
  );
  return { totalCents: valuation.totalCents, byAccount, incomplete: valuation.incomplete };
}

// ---------------------------------------------------------------------------------------------
// P5.2 read models: daily series in one pass (no `netWorthAsOf` per day).
// ---------------------------------------------------------------------------------------------

function toRateTable(rows: Rates): RateTable {
  const table = new Map<string, { date: string; rateMicro: number }[]>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = table.get(r.currency) ?? [];
    list.push({ date: r.date, rateMicro: r.rateMicro });
    table.set(r.currency, list);
  }
  return table;
}

export function rateTable(db: Executor, to: string): RateTable {
  return toRateTable(db.select().from(fxRate).where(lte(fxRate.date, to)).all());
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
  cost: {
    currency: string;
    snapshots: { date: string; costBasisCents: number | null }[];
    trades: SeriesTrade[];
  };
};

/**
 * Daily market value of positions (account x security, C10) from `from` to `to`: units (latest
 * snapshot plus later trades) x price carried forward x ECB rate of that day, one rounding per
 * position and day. Equals `holdingValuesAsOf` on every day (property-tested); the rows are read
 * once for the whole window. Soft-deleted rows are ignored; positions without units in the whole
 * window are left out.
 */
export function valuationSeries(
  db: Executor,
  filter: SeriesFilter,
  options: ValuationOptions = {},
): ValuationSeries {
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
      kind: trade.kind,
      unitsE8: trade.unitsE8,
      amountCents: trade.amountCents,
      feeCents: trade.feeCents,
      taxCents: trade.taxCents,
      currency: account.currency,
    })
    .from(trade)
    .innerJoin(account, eq(account.id, trade.accountId))
    .where(isNull(trade.deletedAt))
    .orderBy(trade.date, trade.id)
    .all()
    .filter((r) => wantSecurity(r.securityId));
  const priceTrades = new Map<string, typeof trades>();
  for (const t of trades) {
    const list = priceTrades.get(t.securityId) ?? [];
    list.push(t);
    priceTrades.set(t.securityId, list);
  }
  const currencies = new Map(
    db
      .select({ id: account.id, currency: account.currency })
      .from(account)
      .all()
      .map((a) => [a.id, a.currency]),
  );
  const pricesBySecurity = new Map<string, DatedPrice[]>();
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
        priceTrades: priceTrades.get(securityId) ?? [],
        cost: { currency: currencies.get(accountId) ?? 'EUR', snapshots: [], trades: [] },
      };
      positions.set(key, p);
    }
    return p;
  };
  for (const r of snapshots) {
    const p = at(r.accountId, r.securityId);
    p.snapshots.push({ date: r.asOf, unitsE8: r.unitsE8 });
    p.cost.snapshots.push({ date: r.asOf, costBasisCents: r.costBasisCents });
  }
  for (const r of trades) {
    if (r.date > filter.to || !wantAccount(r.accountId)) continue;
    const p = at(r.accountId, r.securityId);
    p.trades.push({ date: r.date, unitsE8: r.unitsE8 });
    p.cost.trades.push(r);
  }

  const series = dailyValuation(
    [...positions.values()].sort(
      (a, b) => a.accountId.localeCompare(b.accountId) || a.securityId.localeCompare(b.securityId),
    ),
    days,
    rateTable(db, filter.to),
    options,
  );
  noteIncomplete(series.incomplete);
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
    .where(
      and(
        isNull(trade.deletedAt),
        lte(trade.date, filter.to),
        gt(trade.date, after),
        // A few securities (one per call in the class histories) use trade_security_date_idx.
        filter.securities !== undefined && filter.securities.length <= 100
          ? inArray(trade.securityId, [...filter.securities])
          : undefined,
      ),
    )
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
 *   withdrawal (outflow) from outside, too. A delivery in or out is capital in or out at its
 *   stored amount (PP counts it as a transfer of value). Its value series is `valuationSeries`
 *   plus `cashSeries` of the reference accounts.
 */
export function portfolioFlows(
  db: Executor,
  filter: FlowFilter & {
    view?: 'securities' | 'depot';
    referenceAccounts?: ReadonlyArray<string>;
    externalAccounts?: ReadonlyArray<string>;
  },
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
    if (
      others.length > 0 &&
      others.every((o) => !inside.has(o.accountId)) &&
      (filter.externalAccounts === undefined ||
        others.every((o) => filter.externalAccounts!.includes(o.accountId)))
    )
      boundary.push({ date: leg.date, cents: leg.cents, currency: leg.currency });
  }
  // A plain booking straight onto a reference account is money from
  // outside, like in Portfolio Performance: an inflow is a deposit (Einlage), an outflow a
  // withdrawal (Entnahme). Trade settlements (including standalone fees and taxes, which are
  // trades) and income of type Kapitalerträge stay inside: they are performance.
  if (filter.externalAccounts === undefined)
    boundary.push(...externalDeposits(db, reference, filter.from, filter.to));
  // Deliveries in and out move value across the boundary without cash, as in Portfolio
  // Performance: capital in or out at their stored amount (transfers between portfolios of the
  // same depot net out, as both legs are deliveries of accounts inside).
  for (const t of tradesOf(db, filter, filter.from))
    if (
      filter.externalAccounts === undefined &&
      (t.kind === 'delivery_in' || t.kind === 'delivery_out')
    )
      boundary.push({
        date: t.date,
        cents: (t.kind === 'delivery_in' ? 1 : -1) * t.amountCents,
        currency: t.currency ?? 'EUR',
      });
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
 * Manual valuations (`netWorthValuationAsOf` rule): on a day an account of type p2p/other_asset
 * without positions that day is worth its newest live valuation dated on or before the day (in the
 * account currency, converted with the ECB rate of the day; zero needs no rate); without any such
 * valuation, or before the opening date, its cash balance stays. Replaces those accounts' cash
 * series in place, read in two queries for the whole window.
 */
function applyManualValuations(
  db: Executor,
  days: ReadonlyArray<string>,
  cash: Map<string, number[]>,
  positions: ReadonlyArray<{ accountId: string; unitsE8: ReadonlyArray<number> }>,
  rates: RateTable,
): void {
  const to = days[days.length - 1];
  if (to === undefined) return;
  const manual = db
    .select({ id: account.id, currency: account.currency, openingDate: account.openingDate })
    .from(account)
    .where(and(isNull(account.deletedAt), inArray(account.type, ['p2p', 'other_asset'])))
    .all();
  if (manual.length === 0) return;
  const byAccount = new Map<string, { date: string; valueCents: number }[]>();
  // Same order as `netWorthValuationAsOf` (newest first): the first row on or before a day wins.
  for (const row of db
    .select()
    .from(valuation)
    .where(and(isNull(valuation.deletedAt), lte(valuation.date, to)))
    .orderBy(desc(valuation.date))
    .all()) {
    const list = byAccount.get(row.accountId) ?? [];
    list.push({ date: row.date, valueCents: row.valueCents });
    byAccount.set(row.accountId, list);
  }
  for (const a of manual) {
    const series = cash.get(a.id);
    const values = byAccount.get(a.id);
    if (!series || !values) continue;
    const held = positions.filter((p) => p.accountId === a.id);
    days.forEach((day, i) => {
      if (a.openingDate > day || held.some((p) => p.unitsE8[i] !== 0)) return;
      const latest = values.find((v) => v.date <= day);
      if (!latest) return;
      series[i] =
        latest.valueCents === 0 || a.currency === 'EUR'
          ? latest.valueCents
          : toEurCents(latest.valueCents, fxOn(rates, a.currency, day));
    });
  }
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
  applyManualValuations(db, days, cash, positions.positions, rates);
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

/**
 * Daily EUR value of accounts that hold positions: the cash series plus the market value of their
 * positions, exactly the value of `netWorthValuationAsOf` (the Konten value column) on every day.
 * Accounts without any position in the window are left out (their value is their cash balance).
 * The rows are read once for all accounts and days.
 */
export function holdingAccountValueSeries(
  db: Executor,
  days: ReadonlyArray<string>,
  accounts?: ReadonlyArray<string>,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const from = days[0];
  const to = days[days.length - 1];
  if (from === undefined || to === undefined) return out;
  const positions = valuationSeries(db, { from, to, ...(accounts ? { accounts } : {}) }).positions;
  if (positions.length === 0) return out;
  const held = new Set(positions.map((p) => p.accountId));
  const cash = cashSeries(db, days, [...held]);
  for (const id of held) {
    const base = cash.get(id) ?? days.map(() => 0);
    out.set(
      id,
      base.map(
        (cents, i) =>
          cents +
          positions.reduce(
            (sum, p) => (p.accountId === id ? sum + (p.valueCents[i] ?? 0) : sum),
            0,
          ),
      ),
    );
  }
  return out;
}
