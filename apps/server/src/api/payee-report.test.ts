/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect API JSON at the boundary. */
import {
  accounts,
  budget,
  createBooking,
  createEntity,
  createTestDatabase,
  createTransfer,
  schema,
  type OpenedDatabase,
} from '@budget/db';
import { eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedBasics } from '../../../../packages/db/src/repos/test-helpers';
import { createLedgerApi } from './index';

let opened: OpenedDatabase;
let app: Hono;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
  opened.db
    .insert(schema.category)
    .values({
      id: 'future',
      name: 'Sparplan',
      groupId: 'g',
      class: 'future',
      kind: 'fixed',
    })
    .run();
  opened.db
    .insert(schema.category)
    .values({
      id: 'deleted',
      name: 'Gelöschte Kategorie',
      groupId: 'g',
      class: 'need',
      kind: 'variable',
    })
    .run();
  app = createLedgerApi({
    db: opened.db,
    today: () => '2026-09-17',
    stepUp: async (_c, next) => next(),
  });
});
afterEach(() => opened.close());

async function get(path: string) {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as any };
}
function addBooking(input: Parameters<typeof createBooking>[1]) {
  return createBooking(opened.db, input, { actor: 'test' });
}

describe('payee analysis report API', () => {
  it('uses exact shared budget eligibility, signed refunds, IDs, statuses and explicit null-payee drilldown', async () => {
    const expense = addBooking({
      accountId: 'giro',
      date: '2026-08-04',
      amountCents: -10000,
      payeeId: 'p1',
      status: 'pending',
      splits: [
        { categoryId: 'miete', amountCents: -6000 },
        { categoryId: 'essen', amountCents: -4000 },
      ],
    });
    const refund = addBooking({
      accountId: 'giro',
      date: '2026-08-08',
      amountCents: 2500,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: 2500 }],
    });
    const withoutPayee = addBooking({
      accountId: 'giro',
      date: '2026-08-10',
      amountCents: -800,
      splits: [{ categoryId: 'reise', amountCents: -800 }],
    });
    addBooking({
      accountId: 'giro',
      date: '2026-08-12',
      amountCents: -900,
      payeeId: 'p1',
      splits: [{ categoryId: 'future', amountCents: -900 }],
    });
    addBooking({
      accountId: 'giro',
      date: '2026-08-13',
      amountCents: -300,
      payeeId: 'p1',
      splits: [{ categoryId: null, amountCents: -300 }],
    });
    const zeroNet = addBooking({
      accountId: 'giro',
      date: '2026-08-15',
      amountCents: 0,
      payeeId: 'p1',
      splits: [
        { categoryId: 'miete', amountCents: -100 },
        { categoryId: 'essen', amountCents: 100 },
      ],
    });
    createEntity(opened.db, schema.payee, { id: 'p-zero', name: 'Ausgleich' }, { actor: 'test' });
    addBooking({
      accountId: 'giro',
      date: '2026-08-15',
      amountCents: 0,
      payeeId: 'p-zero',
      splits: [
        { categoryId: 'miete', amountCents: -250 },
        { categoryId: 'essen', amountCents: 250 },
      ],
    });
    addBooking({
      accountId: 'giro',
      date: '2026-08-16',
      amountCents: -400,
      payeeId: 'p1',
      splits: [{ categoryId: 'deleted', amountCents: -400 }],
    });
    opened.db
      .update(schema.category)
      .set({ deletedAt: '2026-08-17T00:00:00.000Z' })
      .where(eq(schema.category.id, 'deleted'))
      .run();
    opened.db
      .update(schema.booking)
      .set({ status: 'reconciled' })
      .where(eq(schema.booking.id, refund))
      .run();
    const answer = await get('/reports/payees?period=Alles');
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      availableMonths: 35,
      from: '2023-10-01',
      to: '2026-08-31',
      totalSpendCents: 8300,
      bookingCount: 5,
      includedStatuses: ['pending', 'confirmed', 'reconciled'],
      observedStatuses: ['confirmed', 'pending', 'reconciled'],
      excludedUnclassifiedOutflowCents: 700,
    });
    const named = answer.body.rows.find((row: any) => row.payeeId === 'p1');
    expect(named).toMatchObject({ amountCents: 7500, bookingCount: 3, previousAmountCents: null });
    expect(named.categories).toEqual(
      expect.arrayContaining([
        { id: 'miete', name: 'Miete', amountCents: 3600 },
        { id: 'essen', name: 'Essen', amountCents: 3900 },
      ]),
    );
    expect(answer.body.rows.find((row: any) => row.payeeId === null)).toMatchObject({
      name: 'Ohne Empfänger',
      amountCents: 800,
      bookingCount: 1,
    });
    expect(answer.body.rows.find((row: any) => row.payeeId === 'p-zero')).toMatchObject({
      name: 'Ausgleich',
      amountCents: 0,
      bookingCount: 1,
    });
    const namedDetail = await get(`/reports/payees/p1/bookings?from=2026-08-01&to=2026-08-31`);
    expect(namedDetail.body.items.map((item: any) => item.booking.id)).toEqual([
      zeroNet,
      refund,
      expense,
    ]);
    expect(namedDetail.body.items.find((item: any) => item.booking.id === zeroNet).spendCents).toBe(
      0,
    );
    const nullDetail = await get(
      '/reports/payees/ohne-empfaenger/bookings?from=2026-08-01&to=2026-08-31',
    );
    expect(nullDetail.body.items.map((item: any) => item.booking.id)).toEqual([withoutPayee]);
    const invalidDay = await get('/reports/payees/p1/bookings?from=2026-02-30&to=2026-08-31');
    expect(invalidDay.status).toBe(400);
    const month = budget(opened.db, ['2026-08'])[0]!;
    const sharedEligibleActivityCents = -Object.entries(month.envelopes)
      .filter(([id]) => ['miete', 'essen', 'reise'].includes(id))
      .reduce((sum, [, envelope]) => sum + envelope.activityCents, 0);
    expect(answer.body.totalSpendCents).toBe(sharedEligibleActivityCents);
  });

  it('rejects aggregation that would leave the exact integer-cent range', async () => {
    for (let i = 0; i < 2; i++)
      addBooking({
        accountId: 'giro',
        date: '2026-08-01',
        amountCents: -Number.MAX_SAFE_INTEGER,
        payeeId: 'p1',
        splits: [{ categoryId: 'miete', amountCents: -Number.MAX_SAFE_INTEGER }],
      });
    const answer = await get('/reports/payees?period=1M');
    expect(answer.status).toBe(422);
    expect(answer.body.error).toBe('calculation_limit');
    expect(answer.body).not.toHaveProperty('rows');
  });

  it('rejects an unsafe legacy split operand even when other source amounts could cancel it', async () => {
    addBooking({
      accountId: 'giro',
      date: '2026-08-01',
      amountCents: Number.MAX_SAFE_INTEGER,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: Number.MAX_SAFE_INTEGER }],
    });
    const unsafe = addBooking({
      accountId: 'giro',
      date: '2026-08-02',
      amountCents: -1,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -1 }],
    });
    opened.sqlite
      .prepare('UPDATE booking_split SET amount_cents = ? WHERE booking_id = ?')
      .run(-9_007_199_254_740_993n, unsafe);
    const answer = await get('/reports/payees?period=1M');
    expect(answer.status).toBe(422);
    expect(answer.body.error).toBe('calculation_limit');
    expect(answer.body).not.toHaveProperty('totalSpendCents');
  });

  it('matches shared need/want activity for neutral, debt, future, card and pre-opening splits', async () => {
    accounts.create(
      opened.db,
      {
        id: 'new-budget',
        name: 'Neues Konto',
        type: 'checking',
        role: 'budget',
        onBudget: true,
        openingDate: '2026-08-15',
        openingBalanceCents: 0,
        sortOrder: 4,
      },
      { actor: 'test' },
    );
    accounts.create(
      opened.db,
      {
        id: 'card',
        name: 'Kreditkarte',
        type: 'credit_card',
        role: 'budget',
        onBudget: true,
        openingDate: '2023-10-01',
        openingBalanceCents: 10000,
        sortOrder: 5,
      },
      { actor: 'test' },
    );
    accounts.create(
      opened.db,
      {
        id: 'loan-account',
        name: 'Darlehen',
        type: 'loan',
        role: 'debt',
        onBudget: false,
        openingDate: '2023-10-01',
        openingBalanceCents: 0,
        sortOrder: 6,
      },
      { actor: 'test' },
    );
    opened.db
      .insert(schema.category)
      .values({
        id: 'loan-payment',
        name: 'Kreditrate',
        groupId: 'g',
        class: 'need',
        kind: 'debt',
      })
      .run();
    opened.db
      .insert(schema.category)
      .values({
        id: 'card-payment',
        name: 'Kartenzahlung',
        groupId: 'g',
        class: null,
        kind: 'card_payment',
        cardAccountId: 'card',
      })
      .run();
    createTransfer(
      opened.db,
      {
        fromAccountId: 'giro',
        toAccountId: 'spar',
        date: '2026-08-01',
        amountCents: 2000,
      },
      { actor: 'test' },
    );
    createTransfer(
      opened.db,
      {
        fromAccountId: 'giro',
        toAccountId: 'loan-account',
        date: '2026-08-02',
        amountCents: 5000,
        categoryId: 'loan-payment',
      },
      { actor: 'test' },
    );
    createTransfer(
      opened.db,
      {
        fromAccountId: 'giro',
        toAccountId: 'loan-account',
        date: '2026-08-03',
        amountCents: 9000,
        categoryId: 'future',
      },
      { actor: 'test' },
    );
    const openingExcluded = addBooking({
      accountId: 'new-budget',
      date: '2026-08-10',
      amountCents: -1000,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -1000 }],
    });
    addBooking({
      accountId: 'card',
      date: '2026-08-05',
      amountCents: -2000,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -2000 }],
    });
    const answer = await get('/reports/payees?period=1M');
    expect(answer.body).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
      totalSpendCents: 7000,
    });
    expect(answer.body.rows.find((row: any) => row.payeeId === null)).toMatchObject({
      amountCents: 5000,
      bookingCount: 1,
    });
    expect(answer.body.rows.find((row: any) => row.payeeId === 'p1')).toMatchObject({
      amountCents: 2000,
      bookingCount: 1,
    });
    expect(
      answer.body.rows.flatMap((row: any) => row.categories).map((row: any) => row.id),
    ).toEqual(['loan-payment', 'miete']);
    const month = budget(opened.db, ['2026-08'])[0]!;
    const sharedConsumptionCents = -Object.entries(month.envelopes)
      .filter(([id]) => ['miete', 'loan-payment'].includes(id))
      .reduce((sum, [, envelope]) => sum + envelope.activityCents, 0);
    expect(answer.body.totalSpendCents).toBe(sharedConsumptionCents);
    const details = await get(
      '/reports/payees/ohne-empfaenger/bookings?from=2026-08-01&to=2026-08-31',
    );
    expect(details.body.items).toHaveLength(1);
    expect(details.body.items[0].booking.transferId).toBeTruthy();
    expect(details.body.items[0].booking.id).not.toBe(openingExcluded);
  });

  it('clamps 3J to 36 closed months, compares an available equal window and keeps signed zero/negative rows', async () => {
    opened.db
      .update(schema.account)
      .set({ openingDate: '2019-01-01' })
      .where(eq(schema.account.id, 'giro'))
      .run();
    addBooking({
      accountId: 'giro',
      date: '2020-09-01',
      amountCents: -30,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -30 }],
    });
    addBooking({
      accountId: 'giro',
      date: '2023-09-01',
      amountCents: -100,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -100 }],
    });
    addBooking({
      accountId: 'giro',
      date: '2026-08-01',
      amountCents: -400,
      payeeId: 'p1',
      splits: [{ categoryId: 'miete', amountCents: -400 }],
    });
    const threeYears = await get('/reports/payees?period=3J');
    expect(threeYears.body).toMatchObject({
      from: '2023-09-01',
      to: '2026-08-31',
      availableMonths: 92,
      previousFrom: '2020-09-01',
      previousTo: '2023-08-31',
      previousAvailable: true,
    });
    expect(threeYears.body.rows[0]).toMatchObject({
      amountCents: 500,
      previousAmountCents: 30,
      changeCents: 470,
    });
    const all = await get('/reports/payees?period=Alles');
    expect(all.body).toMatchObject({
      from: '2019-01-01',
      availableMonths: 92,
      previousAvailable: false,
    });
    createEntity(opened.db, schema.payee, { id: 'p2', name: 'Andere Stelle' }, { actor: 'test' });
    addBooking({
      accountId: 'giro',
      date: '2026-08-12',
      amountCents: 500,
      payeeId: 'p2',
      splits: [{ categoryId: 'miete', amountCents: 500 }],
    });
    const refunds = await get('/reports/payees?period=1M');
    const refundRow = refunds.body.rows.find((row: any) => row.payeeId === 'p2');
    expect(refunds.body.totalSpendCents).toBe(-100);
    expect(refunds.body.topFiveSharePercent).toBeNull();
    expect(refundRow).toMatchObject({
      amountCents: -500,
      averageSpendCents: -500,
      sharePercent: null,
    });
  });

  it('uses the existing signed safe-cent average rounding for net booking values', async () => {
    createEntity(opened.db, schema.payee, { id: 'p2', name: 'Erstattungen' }, { actor: 'test' });
    for (const [payeeId, amounts] of [
      ['p1', [-2, -3]],
      ['p2', [2, 3]],
    ] as const)
      for (const amountCents of amounts)
        addBooking({
          accountId: 'giro',
          date: '2026-08-01',
          amountCents,
          payeeId,
          splits: [{ categoryId: 'miete', amountCents }],
        });
    const answer = await get('/reports/payees?period=1M');
    expect(answer.body.rows.find((row: any) => row.payeeId === 'p1').averageSpendCents).toBe(3);
    expect(answer.body.rows.find((row: any) => row.payeeId === 'p2').averageSpendCents).toBe(-3);
  });

  it('paginates detail past the first forty qualifying bookings', async () => {
    const ids = [
      ...Array.from({ length: 36 }, (_, index) => `z${String(index).padStart(2, '0')}`),
      'a!',
      'a-',
      'a',
      'A!',
      'A',
    ];
    for (const id of ids) {
      opened.db
        .insert(schema.booking)
        .values({
          id,
          accountId: 'giro',
          date: '2026-08-01',
          amountCents: -1,
          payeeId: 'p1',
        })
        .run();
      opened.db
        .insert(schema.bookingSplit)
        .values({
          id: `split-${id}`,
          bookingId: id,
          categoryId: 'miete',
          amountCents: -1,
        })
        .run();
    }
    const first = await get('/reports/payees/p1/bookings?from=2026-08-01&to=2026-08-31');
    expect(first.body.items).toHaveLength(40);
    expect(first.body.total).toBe(41);
    const second = await get(
      `/reports/payees/p1/bookings?from=2026-08-01&to=2026-08-31&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items).toHaveLength(1);
    const expectedOrder = [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(first.body.items.map((item: any) => item.booking.id)).toEqual(
      expectedOrder.slice(0, 40),
    );
    expect(second.body.items.map((item: any) => item.booking.id)).toEqual(expectedOrder.slice(40));
  });
});
