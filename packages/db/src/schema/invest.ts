import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { account, institution } from './accounts';
import { booking } from './bookings';
import { cents, id, isoDay, nowSql, oneOf, timestamps } from './common';

export const SECURITY_KINDS = [
  'etf',
  'stock',
  'fund',
  'bond',
  'crypto',
  'p2p',
  'commodity',
  'other',
] as const;
/**
 * Trade kinds (Portfolio Performance vocabulary). Units per kind: `buy`, `delivery_in` add units
 * (> 0); `sell`, `delivery_out` remove units (< 0); `split` changes units without money (any sign);
 * `dividend`, `interest`, `fee`, `tax` move money only (units 0).
 */
export const TRADE_KINDS = [
  'buy',
  'sell',
  'delivery_in',
  'delivery_out',
  'split',
  'dividend',
  'interest',
  'fee',
  'tax',
] as const;
export const PRICE_SOURCES = [
  'yfinance',
  'ariva',
  'cryptocalc',
  'coingecko',
  'manual',
  'import',
] as const;
export const MARKET_RUN_STATUSES = ['ok', 'partial', 'failed'] as const;
export const MARKET_RUN_TRIGGERS = ['nightly', 'manual'] as const;
export const VALUATION_SOURCES = ['manual', 'import', 'statement'] as const;

export const assetClass = sqliteTable('asset_class', {
  id: id(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

/**
 * Soll-Allocation of an asset class from `valid_from` on (versioned, rule R13): target share and
 * the tolerance band around it, both in basis points (10 000 = 100 %).
 */
export const assetClassTarget = sqliteTable(
  'asset_class_target',
  {
    id: id(),
    assetClassId: text('asset_class_id')
      .notNull()
      .references(() => assetClass.id),
    validFrom: text('valid_from').notNull(),
    targetShareBp: integer('target_share_bp').notNull(),
    bandBp: integer('band_bp').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('asset_class_target_uq').on(t.assetClassId, t.validFrom),
    isoDay('asset_class_target_valid_from_chk', t.validFrom),
    check('asset_class_target_share_chk', sql`${t.targetShareBp} BETWEEN 0 AND 10000`),
    check('asset_class_target_band_chk', sql`${t.bandBp} BETWEEN 0 AND 10000`),
  ],
);

/** Product (Wertpapier): ETF, stock, crypto, P2P loans. */
export const security = sqliteTable(
  'security',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: SECURITY_KINDS }).notNull(),
    symbol: text('symbol'),
    isin: text('isin'),
    currency: text('currency').notNull().default('EUR'),
    /** Total expense ratio in basis points (0,20 % = 20). */
    terBp: integer('ter_bp').notNull().default(0),
    /** Leverage in integer tenths: 10 = 1.0x, configurable per instrument. */
    leverageFactor: integer('leverage_factor').notNull().default(10),
    assetClassId: text('asset_class_id').references(() => assetClass.id),
    institutionId: text('institution_id').references(() => institution.id),
    /** Region weights as JSON `{ "Europa": 0.15 }`. */
    regionsJson: text('regions_json'),
    benchmark: text('benchmark'),
    /** Legacy, unused by the sources: Ariva's CSV needs a login, so the numeric id is not needed. */
    fallbackQuoteId: text('fallback_quote_id'),
    /** Exchange of the Ariva quote (`boerse_id`); wins over a `boerse_id` inside `quoteUrl`. */
    quoteExchange: text('quote_exchange'),
    /**
     * The quote page as stored in Portfolio Performance (its HTML-table feed URL), by host:
     * `https://www.ariva.de/<path>/kurse/historische-kurse[?boerse_id=…]` (Ariva, not for crypto) or
     * `https://cryptocalc.cc/bitpanda-kurse/?currency=BTC&fiat=EUR&range=all` (fallback for a
     * crypto security without `coingecko_id`).
     */
    quoteUrl: text('quote_url'),
    /** CoinGecko coin id (`bitcoin`): primary price source of a crypto security (EUR prices). */
    coingeckoId: text('coingecko_id'),
    /** Switch for the daily price refresh; off keeps the security out of it. */
    pricesEnabled: integer('prices_enabled', { mode: 'boolean' }).notNull().default(true),
    /** Adjusted close instead of the plain close from the primary source (default: plain). */
    quoteAdjusted: integer('quote_adjusted', { mode: 'boolean' }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [oneOf('security_kind_chk', t.kind, SECURITY_KINDS)],
);

/**
 * Trade. `units_e8` is signed (see `TRADE_KINDS`) in 1e-8 units; `amount_cents` is the gross value
 * (positive) in the account currency, `fee_cents` and `tax_cents` come on top (buy) or are
 * deducted (sell, dividend). A buy funded from a budget account links its booking.
 */
export const trade = sqliteTable(
  'trade',
  {
    id: id(),
    securityId: text('security_id')
      .notNull()
      .references(() => security.id),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    date: text('date').notNull(),
    kind: text('kind', { enum: TRADE_KINDS }).notNull(),
    unitsE8: integer('units_e8', { mode: 'number' }).notNull().default(0),
    amountCents: cents('amount_cents').notNull(),
    feeCents: cents('fee_cents').notNull().default(0),
    taxCents: cents('tax_cents').notNull().default(0),
    bookingId: text('booking_id').references(() => booking.id),
    importKey: text('import_key'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('trade_kind_chk', t.kind, TRADE_KINDS),
    check(
      'trade_units_chk',
      sql`CASE
        WHEN ${t.kind} IN ('buy', 'delivery_in') THEN ${t.unitsE8} > 0
        WHEN ${t.kind} IN ('sell', 'delivery_out') THEN ${t.unitsE8} < 0
        WHEN ${t.kind} = 'split' THEN ${t.unitsE8} <> 0
        ELSE ${t.unitsE8} = 0 END`,
    ),
    check(
      'trade_amounts_chk',
      sql`${t.amountCents} >= 0 AND ${t.feeCents} >= 0 AND ${t.taxCents} >= 0`,
    ),
    isoDay('trade_date_chk', t.date),
    index('trade_security_date_idx').on(t.securityId, t.date),
    index('trade_account_date_idx').on(t.accountId, t.date),
    uniqueIndex('trade_import_key_uq').on(t.accountId, t.importKey),
  ],
);

/** Holding snapshot (Bestand), e.g. from the initial import; otherwise derived from trades. */
export const holding = sqliteTable(
  'holding',
  {
    id: id(),
    securityId: text('security_id')
      .notNull()
      .references(() => security.id),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    asOf: text('as_of').notNull(),
    unitsE8: integer('units_e8', { mode: 'number' }).notNull(),
    costBasisCents: cents('cost_basis_cents'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('holding_uq').on(t.securityId, t.accountId, t.asOf),
    isoDay('holding_as_of_chk', t.asOf),
  ],
);

/** One price per product and day with its source (Ariva, Yahoo, crypto feeds, manual valuation). */
export const price = sqliteTable(
  'price',
  {
    securityId: text('security_id')
      .notNull()
      .references(() => security.id),
    date: text('date').notNull(),
    /** Price in the security currency, micro-units (1,234567 = 1234567). */
    priceMicro: integer('price_micro', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    source: text('source', { enum: PRICE_SOURCES }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.securityId, t.date] }),
    oneOf('price_source_chk', t.source, PRICE_SOURCES),
    isoDay('price_date_chk', t.date),
    check('price_positive_chk', sql`${t.priceMicro} > 0`),
  ],
);

/**
 * Successful refresh inserts (null old value/source) and every change of an existing price
 * (refresh, manual correction): old and new value and source. A manual price is protected from
 * refreshes by the repository.
 */
export const priceAudit = sqliteTable(
  'price_audit',
  {
    id: id(),
    securityId: text('security_id')
      .notNull()
      .references(() => security.id),
    date: text('date').notNull(),
    oldPriceMicro: integer('old_price_micro', { mode: 'number' }),
    newPriceMicro: integer('new_price_micro', { mode: 'number' }).notNull(),
    oldSource: text('old_source', { enum: PRICE_SOURCES }),
    newSource: text('new_source', { enum: PRICE_SOURCES }).notNull(),
    ts: text('ts').notNull().default(nowSql),
  },
  (t) => [index('price_audit_security_idx').on(t.securityId, t.date)],
);

/**
 * Manual valuation (Bewertung) of an account on a day: P2P, other assets, corrections. Used where
 * no holdings and prices exist; the newest valuation on or before a day is the account's value.
 */
export const valuation = sqliteTable(
  'valuation',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    date: text('date').notNull(),
    valueCents: cents('value_cents').notNull(),
    source: text('source', { enum: VALUATION_SOURCES }).notNull().default('manual'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('valuation_source_chk', t.source, VALUATION_SOURCES),
    isoDay('valuation_date_chk', t.date),
    uniqueIndex('valuation_uq').on(t.accountId, t.date),
  ],
);

/** ECB reference rate: EUR per one unit of `currency`, micro-units. */
export const fxRate = sqliteTable(
  'fx_rate',
  {
    date: text('date').notNull(),
    currency: text('currency').notNull(),
    rateMicro: integer('rate_micro', { mode: 'number' }).notNull(),
    source: text('source').notNull().default('ecb'),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.currency] }),
    isoDay('fx_rate_date_chk', t.date),
    check('fx_rate_positive_chk', sql`${t.rateMicro} > 0`),
  ],
);

/**
 * Run log of the market refresh (prices and ECB rates), one row per run. Holds counts and error
 * classes only, never URLs or response bodies. The newest `ok`/`partial` run is the "Stand ...
 * Kurse HH:MM" of the app and what the nightly timer checks to know whether a night was missed.
 */
export const marketRun = sqliteTable(
  'market_run',
  {
    id: id(),
    trigger: text('trigger', { enum: MARKET_RUN_TRIGGERS }).notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at').notNull(),
    /** Last day the run asked for (the previous day for the nightly run). */
    asOf: text('as_of').notNull(),
    /** `failed`: the run threw, or every lookup failed and nothing was written. */
    status: text('status', { enum: MARKET_RUN_STATUSES }).notNull(),
    priceRows: integer('price_rows').notNull().default(0),
    fxRows: integer('fx_rows').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    /** Distinct error classes, comma separated (`timeout,parse`). */
    errorClasses: text('error_classes'),
  },
  (t) => [
    oneOf('market_run_trigger_chk', t.trigger, MARKET_RUN_TRIGGERS),
    oneOf('market_run_status_chk', t.status, MARKET_RUN_STATUSES),
    isoDay('market_run_as_of_chk', t.asOf),
    index('market_run_finished_idx').on(t.finishedAt),
  ],
);

/**
 * Consumer price index of one month for the comparison in report 2.4 (Statistik Austria VPI, open
 * data): index number in micro-units of one `series` (the index base, e.g. `vpi2020`).
 * `fetched_at` says when the series was last read from the source; the nightly market run reads it
 * again only when that is more than a month ago.
 */
export const consumerPriceIndex = sqliteTable(
  'consumer_price_index',
  {
    series: text('series').notNull(),
    month: text('month').notNull(),
    indexMicro: integer('index_micro', { mode: 'number' }).notNull(),
    source: text('source').notNull().default('statistik_austria'),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.series, t.month] }),
    check('cpi_month_chk', sql`${t.month} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'`),
    check('cpi_index_positive_chk', sql`${t.indexMicro} > 0`),
  ],
);

/**
 * Savings plan (Sparplan) of one security on one investment account: a fixed amount on a day of
 * the month. The bank executes it, the app only plans and checks it. A change never rewrites a
 * row: it ends the current one (`valid_to`, inclusive) and starts a new one from a day, so past
 * months keep the rate that applied. `source_account_id` is the account the money comes from.
 */
export const savingsPlan = sqliteTable(
  'savings_plan',
  {
    id: id(),
    securityId: text('security_id')
      .notNull()
      .references(() => security.id),
    accountId: text('account_id')
      .notNull()
      .references(() => account.id),
    sourceAccountId: text('source_account_id').references(() => account.id),
    amountCents: cents('amount_cents').notNull(),
    /** 1-31; in a shorter month the plan runs on the last day. */
    dayOfMonth: integer('day_of_month').notNull(),
    validFrom: text('valid_from').notNull(),
    /** Last day the row applies (inclusive); `NULL` = open end. */
    validTo: text('valid_to'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    isoDay('savings_plan_valid_from_chk', t.validFrom),
    isoDay('savings_plan_valid_to_chk', t.validTo),
    check('savings_plan_amount_chk', sql`${t.amountCents} > 0`),
    check('savings_plan_day_chk', sql`${t.dayOfMonth} BETWEEN 1 AND 31`),
    check('savings_plan_range_chk', sql`${t.validTo} IS NULL OR ${t.validTo} >= ${t.validFrom}`),
    index('savings_plan_key_idx').on(t.securityId, t.accountId, t.validFrom),
  ],
);
