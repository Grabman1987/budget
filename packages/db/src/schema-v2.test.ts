import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  defaultMigrationsFolder,
  migrateDatabase,
  openDatabase,
  type OpenedDatabase,
} from './client';
import { createBooking, getBooking, listBookings, type BookingInput } from './repos/bookings';
import { latestPriceOnOrBefore, upsertPrice } from './repos/prices';
import { accountBalances } from './repos/queries';
import { seedBasics, testCtx as ctx } from './repos/test-helpers';
import { INCOME_TYPES, SYSTEM_PAYEE_IDS } from './schema';

/**
 * Schema v2 (P1f-3 PR 1). Constraints are exercised with plain SQL: `ok` must succeed, `bad`
 * must be refused by the named constraint kind. Repository rules go through the repositories.
 */
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const ok = (statement: string) => opened.sqlite.exec(statement);
const bad = (statement: string, error: RegExp = /CHECK/) =>
  expect(() => opened.sqlite.exec(statement)).toThrow(error);
const all = (statement: string) => opened.sqlite.prepare(statement).all();

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
});

const booking = (over: Partial<BookingInput> & Pick<BookingInput, 'splits'>): BookingInput => ({
  accountId: 'giro',
  date: '2026-09-01',
  amountCents: over.splits.reduce((a, s) => a + s.amountCents, 0),
  ...over,
});
const ACC = `INSERT INTO account (id, name, type, role, on_budget, opening_date) VALUES`;
const CAT = `INSERT INTO category (id, name, group_id, class, kind, stage, card_account_id) VALUES`;

describe('C6 account type and on-budget flag', () => {
  it('stores type and on_budget; tracking-only types can never be on-budget', () => {
    ok(`${ACC} ('karte', 'Karte', 'credit_card', 'budget', 1, '2023-10-01')`);
    ok(`${ACC} ('depot', 'Depot', 'brokerage', 'investment', 0, '2023-10-01')`);
    for (const type of ['loan', 'brokerage', 'crypto', 'p2p', 'receivable'])
      bad(`${ACC} ('${type}', 'x', '${type}', 'investment', 1, '2023-10-01')`);
    bad(`${ACC} ('w', 'x', 'wallet', 'budget', 1, '2023-10-01')`);
    bad(`${ACC} ('d', 'x', 'checking', 'budget', 1, '01.10.2023')`);
  });
});

describe('C3 income types and categories', () => {
  it('the migration brings the eight standard income types', () => {
    expect(all('SELECT id, name FROM income_type ORDER BY sort_order')).toEqual(
      Object.values(INCOME_TYPES),
    );
  });

  it('income, card-payment and advance categories have no class, all others need one; stage 1–9', () => {
    ok(`${CAT} ('lohn', 'Lohn', 'g', NULL, 'income', NULL, NULL)`);
    bad(`${CAT} ('a', 'x', 'g', 'need', 'income', NULL, NULL)`);
    bad(`${CAT} ('b', 'x', 'g', NULL, 'variable', NULL, NULL)`);
    bad(`${CAT} ('c', 'x', 'g', 'need', 'variable', 10, NULL)`);
    bad(`${CAT} ('d', 'x', 'g', 'need', 'swap', NULL, NULL)`);
  });

  it('a split carries an income type; it cannot also be a receivable share or a transfer leg', () => {
    const id = createBooking(
      db,
      booking({ splits: [{ amountCents: 300_000, incomeTypeId: INCOME_TYPES.salary.id }] }),
      ctx,
    );
    expect(getBooking(db, id)?.splits[0]?.incomeTypeId).toBe('income-salary');
    bad(`INSERT INTO booking_split (id, booking_id, amount_cents, income_type_id, contact_id)
         VALUES ('x', '${id}', 1, 'income-salary', 'k1')`);
  });

  it('a receivable share (contact) must run through the "Auslagen" envelope', () => {
    const share = (categoryId: string) =>
      booking({ splits: [{ categoryId, amountCents: -500, contactId: 'k1' }] });
    expect(() => createBooking(db, share('essen'), ctx)).toThrow(/Auslagen/);
    expect(getBooking(db, createBooking(db, share('auslagen'), ctx))?.splits[0]?.contactId).toBe(
      'k1',
    );
  });
});

describe('C14 YNAB model needs', () => {
  it('a card_payment category belongs to exactly one credit card and cannot be booked directly', () => {
    ok(`${ACC} ('karte', 'Karte', 'credit_card', 'budget', 1, '2023-10-01')`);
    bad(`${CAT} ('kz0', 'Kartenzahlung', 'g', NULL, 'card_payment', NULL, NULL)`);
    ok(`${CAT} ('kz', 'Kartenzahlung', 'g', NULL, 'card_payment', NULL, 'karte')`);
    bad(`${CAT} ('kz2', 'Kartenzahlung', 'g', NULL, 'card_payment', NULL, 'karte')`, /UNIQUE/);
    bad(`${CAT} ('x', 'x', 'g', 'need', 'variable', NULL, 'karte')`);
    const spend = booking({ splits: [{ categoryId: 'kz', amountCents: -100 }] });
    expect(() => createBooking(db, spend, ctx)).toThrow(/filled automatically/);
  });

  it('bookings keep a colour flag; unknown flags are refused', () => {
    const splits = [{ categoryId: 'essen', amountCents: -100 }];
    const id = createBooking(db, booking({ flag: 'purple', splits }), ctx);
    expect(getBooking(db, id)?.flag).toBe('purple');
    bad(`UPDATE booking SET flag = 'pink' WHERE id = '${id}'`);
  });

  it('future-dated pending bookings are allowed and not part of today’s balance', () => {
    const splits = [{ categoryId: 'miete', amountCents: -2_000 }];
    createBooking(db, booking({ date: '2027-02-01', status: 'pending', splits }), ctx);
    const giro = (asOf?: string) => accountBalances(db, asOf).find((b) => b.accountId === 'giro');
    expect(giro('2026-09-30')?.balanceCents).toBe(100_000);
    expect(giro()?.balanceCents).toBe(98_000);
    expect(listBookings(db, { from: '2027-01-01' })[0]?.status).toBe('pending');
  });

  it('system payees for the opening balance and balance adjustments exist once each', () => {
    expect(
      all('SELECT id, system_kind FROM payee WHERE system_kind IS NOT NULL ORDER BY id'),
    ).toEqual(
      Object.entries(SYSTEM_PAYEE_IDS)
        .map(([kind, p]) => ({ id: p.id, system_kind: kind }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
    bad(`INSERT INTO payee (id, name, system_kind) VALUES ('d', 'x', 'opening_balance')`, /UNIQUE/);
  });

  it('an import run holds raw YNAB rows and versioned mapping documents; bookings point to it', () => {
    ok(`INSERT INTO import_run (id, source, rules_from) VALUES ('run1', 'ynab', '2025-01')`);
    const reg = `INSERT INTO ynab_register_row (id, import_run_id, row_no, account, date, payee, outflow, inflow, cleared) VALUES`;
    ok(
      `${reg} ('r1', 'run1', 2, 'Giro', '01.10.2023', 'Starting Balance', '€0,00', '€1000,00', 'Reconciled')`,
    );
    bad(`${reg} ('r2', 'run1', 2, 'Giro', '01.10.2023', '', '', '', '')`, /UNIQUE/);
    ok(`INSERT INTO ynab_plan_row (id, import_run_id, row_no, month, category, assigned, activity, available)
        VALUES ('p1', 'run1', 2, 'Oct 2023', 'Miete', '€800,00', '-€800,00', '€0,00')`);
    const map = `INSERT INTO import_mapping (id, import_run_id, version, mapping_json) VALUES`;
    ok(`${map} ('m1', 'run1', 1, '{}'), ('m2', 'run1', 2, '{}')`);
    bad(`${map} ('m3', 'run1', 2, '{}')`, /UNIQUE/);
    bad(`INSERT INTO import_run (id, source, rules_from) VALUES ('run2', 'ynab', '2025')`);
    const splits = [{ amountCents: 100 }];
    const id = createBooking(
      db,
      booking({ importRunId: 'run1', source: 'migration', splits }),
      ctx,
    );
    expect(getBooking(db, id)?.importRunId).toBe('run1');
  });
});

describe('C7 foreign currency', () => {
  // -20,00 USD at 0,93 = -18,60 EUR; the bank took 10 cents more.
  const fx = (over: Partial<BookingInput> = {}) =>
    booking({
      amountCents: -1_870,
      originalAmountCents: -2_000,
      originalCurrency: 'USD',
      fxRateMicro: 930_000,
      splits: [{ categoryId: 'essen', amountCents: over.amountCents ?? -1_870 }],
      ...over,
    });

  it('amount = round(original × rate) + fee within a cent; the fee defaults to 0', () => {
    const id = createBooking(db, fx({ fxFeeCents: -10 }), ctx);
    expect(getBooking(db, id)).toMatchObject({ fxFeeCents: -10, originalAmountCents: -2_000 });
    expect(getBooking(db, createBooking(db, fx({ amountCents: -1_860 }), ctx))?.fxFeeCents).toBe(0);
    expect(() => createBooking(db, fx(), ctx)).toThrow(/does not match/);
  });

  it('all fields or none, and the original is signed like the amount', () => {
    expect(() => createBooking(db, fx({ fxRateMicro: null }), ctx)).toThrow(/together/);
    const fee = booking({ fxFeeCents: -5, splits: [{ categoryId: 'essen', amountCents: -5 }] });
    expect(() => createBooking(db, fee, ctx)).toThrow(/FX fee/);
    const id = createBooking(db, fx({ fxFeeCents: -10 }), ctx);
    bad(`UPDATE booking SET original_amount_cents = 2000 WHERE id = '${id}'`);
    bad(`UPDATE booking SET fx_fee_cents = NULL WHERE id = '${id}'`);
    bad(`UPDATE booking SET original_currency = 'EUR' WHERE id = '${id}'`);
  });
});

describe('C9 trade kinds', () => {
  it('knows tax, fee, dividend, interest, deliveries and splits, with the units each implies', () => {
    ok(`INSERT INTO security (id, name, kind) VALUES ('etf', 'ETF', 'etf')`);
    const trade = (id: string, kind: string, units: number) =>
      `INSERT INTO trade (id, security_id, account_id, date, kind, units_e8, amount_cents, import_key)
       VALUES ('${id}', 'etf', 'spar', '2026-01-02', '${kind}', ${units}, 100, '${id}')`;
    const valid: [string, number][] = [
      ['buy', 5],
      ['sell', -2],
      ['delivery_in', 1],
      ['delivery_out', -1],
      ['split', 3],
      ['dividend', 0],
      ['interest', 0],
      ['fee', 0],
      ['tax', 0],
    ];
    valid.forEach(([kind, units], i) => ok(trade(`t${i}`, kind, units)));
    for (const [kind, units] of [
      ['buy', -1],
      ['sell', 1],
      ['dividend', 1],
      ['split', 0],
      ['swap', 0],
    ] as const)
      bad(trade(`x-${kind}`, kind, units));
    bad(trade('neg', 'buy', 1).replace(', 100,', ', -100,'));
  });
});

describe('C12 model gaps', () => {
  it('category targets are versioned by month and typed', () => {
    const t = `INSERT INTO category_target (id, category_id, kind, amount_cents, valid_from, target_date) VALUES`;
    ok(
      `${t} ('t1', 'essen', 'monthly', 40000, '2026-01', NULL), ('t2', 'essen', 'monthly', 45000, '2026-07', NULL)`,
    );
    ok(`${t} ('t3', 'reise', 'by_date', 150000, '2026-01', '2026-12-01')`);
    bad(`${t} ('t4', 'reise', 'by_date', 1, '2026-02', NULL)`);
    bad(`${t} ('t5', 'essen', 'monthly', 1, '2026-07', NULL)`, /UNIQUE/);
  });

  it('expected payments: tolerance, window and contact share; versions are immutable', () => {
    const ep = `INSERT INTO expected_payment (id, name, category_id, contact_id, contact_share_bp, income_type_id) VALUES`;
    ok(`${ep} ('ep', 'Streaming', 'reise', 'k1', 5000, NULL)`);
    bad(`${ep} ('ep2', 'x', NULL, NULL, 5000, NULL)`);
    bad(`${ep} ('ep3', 'x', 'reise', NULL, 0, 'income-salary')`);
    ok(`INSERT INTO expected_payment_version (id, expected_payment_id, valid_from, amount_cents)
        VALUES ('v1', 'ep', '2026-01-01', 1299)`);
    bad(`UPDATE expected_payment_version SET amount_cents = 1499 WHERE id = 'v1'`, /immutable/);
    // Soft delete (and so the undo of a creation) stays possible.
    ok(`UPDATE expected_payment_version SET deleted_at = '2026-02-01T00:00:00Z' WHERE id = 'v1'`);
  });

  it('occurrences carry a status; received ones point to their booking', () => {
    ok(`INSERT INTO expected_payment (id, name, category_id) VALUES ('ep', 'Miete', 'miete')`);
    const o = `INSERT INTO expected_occurrence (id, expected_payment_id, due_date, expected_amount_cents, status) VALUES`;
    ok(`${o} ('o1', 'ep', '2026-10-01', -80000, 'expected')`);
    bad(`${o} ('o2', 'ep', '2026-11-01', -80000, 'received')`);
    bad(`${o} ('o3', 'ep', '2026-10-01', -80000, 'expected')`, /UNIQUE/);
  });

  it('asset-class targets are versioned with a band; valuations are one per account and day', () => {
    ok(`INSERT INTO asset_class (id, name) VALUES ('ac', 'Welt')`);
    const t = `INSERT INTO asset_class_target (id, asset_class_id, valid_from, target_share_bp, band_bp) VALUES`;
    ok(`${t} ('a1', 'ac', '2023-10-01', 8000, 500)`);
    bad(`${t} ('a2', 'ac', '2024-01-01', 12000, 0)`);
    const v = `INSERT INTO valuation (id, account_id, date, value_cents) VALUES`;
    ok(`${v} ('v1', 'spar', '2026-01-31', 150000)`);
    bad(`${v} ('v2', 'spar', '2026-01-31', 1)`, /UNIQUE/);
  });

  it('receipts link to splits n:m', () => {
    const splits = [
      { categoryId: 'essen', amountCents: -200 },
      { categoryId: 'reise', amountCents: -100 },
    ];
    const [a, b] = getBooking(db, createBooking(db, booking({ splits }), ctx))!.splits;
    ok(`INSERT INTO receipt (id, storage_key, mime, size_bytes) VALUES ('r', 'k', 'image/png', 1)`);
    ok(`INSERT INTO receipt_split VALUES ('r', '${a!.id}'), ('r', '${b!.id}')`);
    expect(all('SELECT * FROM receipt_split')).toHaveLength(2);
  });

  it('a manual price is protected from a refresh; every change is audited', () => {
    ok(`INSERT INTO security (id, name, kind) VALUES ('etf', 'ETF', 'etf')`);
    const p = (priceMicro: number, source: 'yfinance' | 'manual') => ({
      securityId: 'etf',
      date: '2026-01-02',
      priceMicro,
      source,
    });
    expect(upsertPrice(db, p(100_000_000, 'yfinance'))).toBe(true);
    expect(upsertPrice(db, p(101_000_000, 'manual'))).toBe(true);
    expect(upsertPrice(db, p(102_000_000, 'yfinance'))).toBe(false);
    expect(upsertPrice(db, p(101_000_000, 'manual'))).toBe(true); // unchanged: no audit row
    expect(latestPriceOnOrBefore(db, 'etf', '2026-01-02')?.priceMicro).toBe(101_000_000);
    expect(
      all('SELECT old_price_micro, new_price_micro, old_source, new_source FROM price_audit'),
    ).toEqual([
      {
        old_price_micro: 100_000_000,
        new_price_micro: 101_000_000,
        old_source: 'yfinance',
        new_source: 'manual',
      },
    ]);
  });
});

describe('migration 0003 on a database that already has rows', () => {
  /** A copy of the migrations folder that ends with the migration whose tag starts with `tag`. */
  function migrationsUpTo(tag: string): string {
    const source = defaultMigrationsFolder();
    const folder = join(mkdtempSync(join(tmpdir(), 'budget-mig-')), tag);
    mkdirSync(join(folder, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(source, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[];
    };
    const entries = journal.entries.slice(
      0,
      journal.entries.findIndex((e) => e.tag.startsWith(tag)) + 1,
    );
    writeFileSync(join(folder, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries }));
    for (const f of readdirSync(source))
      if (entries.some((e) => f === `${e.tag}.sql`)) copyFileSync(join(source, f), join(folder, f));
    return folder;
  }

  it('keeps the rows, derives type and on-budget from the role, moves links and targets', () => {
    const old = openDatabase(join(mkdtempSync(join(tmpdir(), 'budget-db-')), 'old.sqlite'));
    migrateDatabase(old.db, migrationsUpTo('0002'));
    old.sqlite.exec(`
      INSERT INTO account (id, name, role, opening_date) VALUES
        ('g', 'Giro', 'budget', '2023-10-01'), ('d', 'Depot', 'investment', '2023-10-01');
      INSERT INTO category_group (id, name) VALUES ('grp', 'Wohnen');
      INSERT INTO category (id, name, group_id, class, kind) VALUES ('c', 'Miete', 'grp', 'need', 'fixed');
      INSERT INTO booking (id, account_id, date, amount_cents) VALUES ('b', 'g', '2024-01-01', -100);
      INSERT INTO booking_split (id, booking_id, category_id, amount_cents) VALUES ('s', 'b', 'c', -100);
      INSERT INTO receipt (id, storage_key, mime, size_bytes, booking_id) VALUES ('r', 'k', 'x', 1, 'b');
      INSERT INTO asset_class (id, name, target_share_bp) VALUES ('ac', 'Welt', 8000);`);
    migrateDatabase(old.db);
    const q = (statement: string) => old.sqlite.prepare(statement).all();
    expect(q('SELECT id, type, on_budget FROM account ORDER BY id')).toEqual([
      { id: 'd', type: 'brokerage', on_budget: 0 },
      { id: 'g', type: 'checking', on_budget: 1 },
    ]);
    expect(q('SELECT id FROM booking_split')).toEqual([{ id: 's' }]);
    expect(q('SELECT * FROM receipt_split')).toEqual([{ receipt_id: 'r', split_id: 's' }]);
    expect(q('SELECT target_share_bp FROM asset_class_target')).toEqual([
      { target_share_bp: 8000 },
    ]);
    expect(old.sqlite.pragma('foreign_key_check')).toEqual([]);
    old.close();
  });
});
