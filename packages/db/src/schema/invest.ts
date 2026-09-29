import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { account, institution } from './accounts';
import { booking } from './bookings';
import { cents, id, oneOf, timestamps } from './common';

export const SECURITY_KINDS = ['etf', 'stock', 'crypto', 'p2p', 'fund', 'other'] as const;
export const TRADE_KINDS = ['buy', 'sell', 'dividend', 'fee'] as const;
export const PRICE_SOURCES = ['yfinance', 'ariva', 'manual', 'import'] as const;

export const assetClass = sqliteTable('asset_class', {
  id: id(),
  name: text('name').notNull(),
  /** Target share in basis points (Soll-Allocation), 10 000 = 100 %. */
  targetShareBp: integer('target_share_bp'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
});

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
    assetClassId: text('asset_class_id').references(() => assetClass.id),
    institutionId: text('institution_id').references(() => institution.id),
    /** Region weights as JSON `{ "Europa": 0.15 }`. */
    regionsJson: text('regions_json'),
    benchmark: text('benchmark'),
    ...timestamps(),
  },
  (t) => [oneOf('security_kind_chk', t.kind, SECURITY_KINDS)],
);

/**
 * Trade. `units_e8` is signed (buy positive, sell negative) in 1e-8 units; `amount_cents` is the
 * gross trade value (positive). A buy funded from a budget account links its transfer booking.
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
    bookingId: text('booking_id').references(() => booking.id),
    importKey: text('import_key'),
    note: text('note'),
    ...timestamps(),
  },
  (t) => [
    oneOf('trade_kind_chk', t.kind, TRADE_KINDS),
    index('trade_security_date_idx').on(t.securityId, t.date),
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
  (t) => [uniqueIndex('holding_uq').on(t.securityId, t.accountId, t.asOf)],
);

/** One price per product and day with its source (yfinance, Ariva fallback, manual valuation). */
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
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);
