import {
  account,
  accounts,
  booking,
  bookingSplit,
  createTestDatabase,
  importRun,
  runInTransaction,
} from '@budget/db';
import type { TargetModel } from '@budget/import-ynab';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ledgerDifferences, writeImport } from './commit';

let db: ReturnType<typeof createTestDatabase>['db'];
let ids: { accounts: Record<string, string>; categories: Record<string, string> };
const baseTarget = (): TargetModel => ({
  startMonth: '2026-01',
  months: ['2026-01', '2026-02'],
  accounts: [
    {
      id: 'loan-target',
      ynabName: 'Synthetic loan',
      name: 'Synthetic loan',
      type: 'loan',
      onBudget: false,
      closedAt: null,
      openingDate: '2026-01-01',
      openingBalanceCents: -100_000,
      adjustments: [],
    },
  ],
  categories: [],
  bookings: [
    {
      id: 'loan-payment',
      line: 1,
      accountId: 'loan-target',
      date: '2026-01-15',
      payee: 'Synthetic payment',
      systemPayee: null,
      contact: null,
      flag: '',
      status: 'confirmed',
      memo: '',
      amountCents: 100,
      splits: [
        {
          payee: 'Synthetic payment',
          amountCents: 100,
          categoryId: null,
          memo: '',
          transferId: null,
          transferAccountId: null,
          contact: null,
          project: null,
          incomeType: null,
          ruleId: null,
        },
      ],
      scheduled: false,
    },
  ],
  assigned: {},
  openingCarry: {},
  contacts: [],
  expectedPayments: [],
  targets: [],
  moved: [],
  shifts: [],
});

beforeEach(() => {
  db = createTestDatabase().db;
  db.insert(importRun).values({ id: 'synthetic-run', source: 'ynab', status: 'staged' }).run();
  const written = writeImport(db, {
    runId: 'synthetic-run',
    target: baseTarget(),
    keys: new Map([['loan-payment', 'loan-payment-key']]),
    previous: { accounts: {}, categories: {} },
    deleteMissing: false,
    actor: 'tester',
    today: '2026-02-28',
  });
  ids = written.ids;
});

describe('persisted mapped account reconciliation', () => {
  it('reports the literal one-cent change on an off-budget EUR loan at month end', () => {
    const bookingId = db
      .select({ id: booking.id })
      .from(booking)
      .where(eq(booking.importKey, 'loan-payment-key'))
      .get()!.id;
    runInTransaction(db, (tx) => {
      tx.update(booking)
        .set({ amountCents: 101 })
        .where(eq(booking.importKey, 'loan-payment-key'))
        .run();
      tx.update(bookingSplit)
        .set({ amountCents: 101 })
        .where(eq(bookingSplit.bookingId, bookingId))
        .run();
    });

    const differences = ledgerDifferences(db, baseTarget(), ids);
    expect(differences).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-01',
      day: '2026-01-31',
      expectedCents: -99_900,
      actualCents: -99_899,
    });
    expect(differences).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-02',
      day: '2026-02-28',
      expectedCents: -99_900,
      actualCents: -99_899,
    });
  });

  it('reports an added one-cent non-budget booking', () => {
    runInTransaction(db, (tx) => {
      tx.insert(booking)
        .values({
          id: 'extra-cent-booking',
          accountId: ids.accounts['loan-target']!,
          date: '2026-01-20',
          amountCents: 1,
          currency: 'EUR',
        })
        .run();
      tx.insert(bookingSplit)
        .values({ id: 'extra-cent-split', bookingId: 'extra-cent-booking', amountCents: 1 })
        .run();
    });

    expect(ledgerDifferences(db, baseTarget(), ids)).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-01',
      day: '2026-01-31',
      expectedCents: -99_900,
      actualCents: -99_899,
    });
  });

  it('reports a deleted source booking', () => {
    db.update(booking)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(booking.importKey, 'loan-payment-key'))
      .run();

    expect(ledgerDifferences(db, baseTarget(), ids)).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-01',
      day: '2026-01-31',
      expectedCents: -99_900,
      actualCents: -100_000,
    });
  });

  it('reports a deleted one-cent source booking', () => {
    const target = baseTarget();
    target.bookings.push({
      ...target.bookings[0]!,
      id: 'source-cent',
      amountCents: 1,
      splits: [{ ...target.bookings[0]!.splits[0]!, amountCents: 1 }],
    });
    runInTransaction(db, (tx) => {
      tx.insert(booking)
        .values({
          id: 'source-cent-db',
          accountId: ids.accounts['loan-target']!,
          date: '2026-01-15',
          amountCents: 1,
          currency: 'EUR',
          deletedAt: '2026-03-01T00:00:00.000Z',
        })
        .run();
      tx.insert(bookingSplit)
        .values({ id: 'source-cent-split', bookingId: 'source-cent-db', amountCents: 1 })
        .run();
    });
    expect(ledgerDifferences(db, target, ids)).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-01',
      day: '2026-01-31',
      expectedCents: -99_899,
      actualCents: -99_900,
    });
  });

  it('uses posted and scheduled rows according to the persisted dated balance', () => {
    const target = baseTarget();
    target.bookings.push({
      ...target.bookings[0]!,
      id: 'scheduled-payment',
      date: '2026-02-10',
      amountCents: 25,
      scheduled: true,
      status: 'pending',
      splits: [{ ...target.bookings[0]!.splits[0]!, amountCents: 25 }],
    });
    runInTransaction(db, (tx) => {
      tx.insert(booking)
        .values({
          id: 'scheduled-payment-db',
          accountId: ids.accounts['loan-target']!,
          date: '2026-02-10',
          amountCents: 25,
          currency: 'EUR',
          status: 'pending',
        })
        .run();
      tx.insert(bookingSplit)
        .values({
          id: 'scheduled-payment-split',
          bookingId: 'scheduled-payment-db',
          amountCents: 25,
        })
        .run();
    });

    expect(ledgerDifferences(db, target, ids)).toEqual([]);
  });

  it('checks opening-date boundaries and closed or off-budget balances', () => {
    const target = baseTarget();
    db.update(account)
      .set({ closedAt: '2026-02-20' })
      .where(eq(account.id, ids.accounts['loan-target']!))
      .run();
    expect(ledgerDifferences(db, target, ids)).toEqual([]);
    target.accounts[0]!.openingDate = '2026-02-01';
    target.accounts[0]!.openingBalanceCents = -50_000;
    target.bookings[0]!.date = '2026-02-15';

    expect(ledgerDifferences(db, target, ids)).toContainEqual({
      check: 'account_opening_balance',
      account: 'loan-target',
      month: null,
      expectedCents: -50_000,
      actualCents: -100_000,
    });
    expect(ledgerDifferences(db, target, ids)).toContainEqual({
      check: 'account_opening_date',
      account: 'loan-target',
      month: null,
      expectedDate: '2026-02-01',
      actualDate: '2026-01-01',
    });
    expect(ledgerDifferences(db, target, ids)).toContainEqual({
      check: 'account_balance',
      account: 'loan-target',
      month: '2026-01',
      day: '2026-01-31',
      expectedCents: 0,
      actualCents: -99_900,
    });
    db.update(account)
      .set({ openingDate: '2026-02-01', openingBalanceCents: -50_000 })
      .where(eq(account.id, ids.accounts['loan-target']!))
      .run();
    db.update(booking)
      .set({ date: '2026-02-15' })
      .where(eq(booking.importKey, 'loan-payment-key'))
      .run();
    expect(ledgerDifferences(db, target, ids)).toEqual([]);
    db.update(account)
      .set({ openingBalanceCents: -49_999 })
      .where(eq(account.id, ids.accounts['loan-target']!))
      .run();
    expect(ledgerDifferences(db, target, ids)).toContainEqual({
      check: 'account_opening_balance',
      account: 'loan-target',
      month: null,
      expectedCents: -50_000,
      actualCents: -49_999,
    });
  });

  it('reports a mapped account that is absent even when its expected balance is zero', () => {
    const zeroTarget = baseTarget();
    zeroTarget.accounts[0]!.openingBalanceCents = 0;
    zeroTarget.bookings = [];
    db.update(account)
      .set({ deletedAt: '2026-03-01T00:00:00.000Z' })
      .where(eq(account.id, ids.accounts['loan-target']!))
      .run();

    expect(ledgerDifferences(db, zeroTarget, ids)).toContainEqual({
      check: 'account_missing',
      account: 'loan-target',
      month: null,
    });
  });

  it('reports a non-EUR currency mismatch even when cents match', () => {
    db.update(account)
      .set({ currency: 'USD' })
      .where(eq(account.id, ids.accounts['loan-target']!))
      .run();

    expect(ledgerDifferences(db, baseTarget(), ids)).toContainEqual({
      check: 'account_currency',
      account: 'loan-target',
      month: null,
      expectedCurrency: 'EUR',
      actualCurrency: 'USD',
    });
  });

  it('reports an absent ID mapping instead of substituting a zero balance', () => {
    expect(ledgerDifferences(db, baseTarget(), { accounts: {}, categories: {} })).toContainEqual({
      check: 'account_missing',
      account: 'loan-target',
      month: null,
    });
  });

  it('ignores unrelated accounts outside the import mapping', () => {
    accounts.create(
      db,
      {
        id: 'unrelated-account',
        name: 'Unrelated USD asset',
        type: 'other_asset',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        openingDate: '2026-01-01',
        openingBalanceCents: 100_000,
      },
      { actor: 'tester' },
    );

    expect(ledgerDifferences(db, baseTarget(), ids)).toEqual([]);
  });
});
