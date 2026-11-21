import { afterEach, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import * as schema from '../schema';
import { accounts } from './entities';
import { createBooking, createTransfer, deleteBooking, getBooking } from './bookings';
import { undo } from './audit';
import { bankTransitReconciliation } from './bank-transfer-transit';
import { allocationInputsAsOf } from './allocation-inputs';
import { portfolioAllocation } from './portfolio-allocation';
import { portfolioSummary } from './portfolio-summary';
import { depotComparison } from './portfolio-depots';
import { wholePicture } from './whole-picture';
import { accountBalances } from './queries';
import { cashSeries, netWorthAsOf } from './portfolio';
import { bookInputs } from './book-inputs';
import { loadFacts } from './rule-inputs';

let opened: OpenedDatabase;
const ctx = { actor: 'synthetic-transit' };
const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'];
beforeEach(() => {
  opened = createTestDatabase();
  for (const [id, type, openingBalanceCents] of [
    ['source', 'checking', 50000],
    ['recipient', 'savings', 10000],
  ] as const)
    accounts.create(
      opened.db,
      {
        id,
        name: id,
        type,
        role: 'investment',
        onBudget: false,
        allocationScope: 'included',
        openingDate: '2026-01-01',
        openingBalanceCents,
      },
      ctx,
    );
  for (const amountCents of [1, -1])
    createBooking(
      opened.db,
      {
        accountId: 'source',
        date: '2026-01-02',
        amountCents,
        splits: [{ amountCents }],
      },
      ctx,
    );
});
afterEach(() => opened.close());

it('withholds optional display values at the safe-cent limit without breaking incomplete allocation', () => {
  for (const id of ['source', 'recipient'])
    accounts.update(opened.db, id, { openingBalanceCents: 9007199254740991 }, ctx);
  transfer(false);
  const before = snapshot();
  // Raw aggregate and corrected recipient both exceed safe cents; neither is rounded.
  expect(allocationInputsAsOf(opened.db, '2026-11-01').valueCents).toBeNull();
  expect(bankTransitReconciliation(opened.db, '2026-11-01', ['source', 'recipient'])).toMatchObject(
    {
      rawCashCents: null,
      transitCents: null,
      cashIncludingTransitCents: null,
      missingFxAccountIds: [],
    },
  );
  expect(snapshot()).toBe(before);
});

it('uses the existing EUR conversion source and requires no FX for zero foreign cash', () => {
  accounts.create(
    opened.db,
    {
      id: 'foreign',
      name: 'Synthetic FX',
      type: 'checking',
      role: 'investment',
      onBudget: false,
      currency: 'USD',
      openingDate: '2026-01-01',
      openingBalanceCents: 0,
    },
    ctx,
  );
  expect(bankTransitReconciliation(opened.db, '2026-11-01', ['foreign'])).toMatchObject({
    rawCashCents: 0,
    transitCents: 0,
    cashIncludingTransitCents: 0,
    missingFxAccountIds: [],
  });
  accounts.update(opened.db, 'foreign', { openingBalanceCents: 12345 }, ctx);
  opened.db
    .insert(schema.fxRate)
    .values({ currency: 'USD', date: '2026-10-31', rateMicro: 900000, source: 'ecb' })
    .run();
  const read = bankTransitReconciliation(opened.db, '2026-11-01', ['foreign']);
  expect(read).toMatchObject({
    rawCashCents: 11111,
    transitCents: 0,
    cashIncludingTransitCents: 11111,
    missingFxAccountIds: [],
  });
  expect(read.rawCashCents).toBe(
    cashSeries(opened.db, ['2026-11-01'], ['foreign']).get('foreign')![0],
  );
  expect(read.cashIncludingTransitCents).toBe(
    netWorthAsOf(opened.db, '2026-11-01').byAccount['foreign'],
  );
});

function transfer(reverse: boolean) {
  return createTransfer(
    opened.db,
    { fromAccountId: 'source', toAccountId: 'recipient', date: '2026-10-31', amountCents: 10000 },
    ctx,
    {
      bankLegs: {
        from: { date: reverse ? '2026-11-02' : '2026-10-31', status: 'confirmed' },
        to: { date: reverse ? '2026-10-31' : '2026-11-02', status: 'pending' },
      },
    },
  );
}
const snapshot = () =>
  JSON.stringify([
    opened.db.select().from(schema.booking).all(),
    opened.db.select().from(schema.bookingSplit).all(),
    opened.db.select().from(schema.transfer).all(),
    opened.db.select().from(schema.account).all(),
    opened.db.select().from(schema.trade).all(),
    opened.db.select().from(schema.envelopeMonth).all(),
    opened.db.select().from(schema.auditLog).all(),
  ]);
it.each([false, true])(
  'reconciles raw cash and every selected aggregate on days 0-4 (reversed=%s), without writes',
  (reverse) => {
    transfer(reverse);
    const before = snapshot();
    const raw = reverse ? [60000, 70000, 70000, 60000, 60000] : [60000, 50000, 50000, 60000, 60000];
    const corrections = reverse ? [0, -10000, -10000, 0, 0] : [0, 10000, 10000, 0, 0];
    for (const [index, asOf] of days.entries()) {
      const db = opened.db;
      const nw = netWorthAsOf(db, asOf);
      const inputs = allocationInputsAsOf(db, asOf);
      const summary = portfolioSummary(db, { today: asOf, period: '1M', view: 'depot' });
      const depots = depotComparison(db, { today: asOf, period: '1M' });
      const whole = wholePicture(db, asOf, `${asOf.slice(0, 7)}..${asOf.slice(0, 7)}`);
      const book = bookInputs(loadFacts(db, asOf), asOf, asOf.slice(0, 7), nw);
      const expected = {
        label: 'Geld unterwegs',
        asOf,
        accountIds: ['recipient', 'source'],
        rawCashCents: raw[index],
        transitCents: corrections[index],
        cashIncludingTransitCents: 60000,
        missingFxAccountIds: [],
      };
      for (const reader of [inputs, portfolioAllocation(db, asOf), summary, depots, whole, book])
        expect(reader.cashReconciliation).toEqual(expected);
      expect(
        ['source', 'recipient'].map(
          (id) => accountBalances(db, asOf).find((a) => a.accountId === id)!.balanceCents,
        ),
      ).toEqual(
        index === 0
          ? [50000, 10000]
          : index >= 3
            ? [40000, 20000]
            : reverse
              ? [50000, 20000]
              : [40000, 10000],
      );
      expect(inputs.valueCents).toBe(raw[index]);
      expect(depots.total?.valueCents).toBe(raw[index]);
      expect(summary.performance?.endValueCents).toBe(raw[index]);
      expect(book.investmentValueCents).toBe(raw[index]);
      expect(summary.valueCents).toBe(0);
      expect(whole.totals.endCents).toBe(60000);
      expect(nw.totalCents).toBe(60000);
      expect(
        ['source', 'recipient'].map(
          (id) => cashSeries(db, [asOf], ['source', 'recipient'], true).get(id)![0],
        ),
      ).toEqual([
        index === 0 || (reverse && index < 3) ? 50000 : 40000,
        index === 0 || (reverse && index < 3) ? 10000 : 20000,
      ]);
      expect(inputs.valueCents! + inputs.cashReconciliation.transitCents!).toBe(nw.totalCents);
    }
    expect(snapshot()).toBe(before);
  },
);
it('attributes transit only to the selected recipient, without implying a household total for a subset', () => {
  transfer(false);
  expect(bankTransitReconciliation(opened.db, '2026-11-01', ['source'])).toMatchObject({
    accountIds: ['source'],
    rawCashCents: 40000,
    transitCents: 0,
    cashIncludingTransitCents: 40000,
  });
  expect(bankTransitReconciliation(opened.db, '2026-11-01', ['recipient'])).toMatchObject({
    accountIds: ['recipient'],
    rawCashCents: 10000,
    transitCents: 10000,
    cashIncludingTransitCents: 20000,
  });
  expect(bankTransitReconciliation(opened.db, '2026-11-01', [])).toMatchObject({
    accountIds: [],
    rawCashCents: 0,
    transitCents: 0,
    cashIncludingTransitCents: 0,
  });
});
it('withholds the cash bridge for missing FX, preserving native bank facts and existing allocation unavailability', () => {
  opened.close();
  opened = createTestDatabase();
  for (const [id, openingBalanceCents] of [
    ['source', 50000],
    ['recipient', 10000],
  ] as const)
    accounts.create(
      opened.db,
      {
        id,
        name: id,
        type: 'checking',
        role: 'investment',
        onBudget: false,
        currency: 'USD',
        allocationScope: 'included',
        openingDate: '2026-01-01',
        openingBalanceCents,
      },
      ctx,
    );

  transfer(false);
  const before = snapshot();
  const input = allocationInputsAsOf(opened.db, '2026-11-01');
  expect(input.valueCents).toBeNull();
  expect(input.cashReconciliation).toMatchObject({
    rawCashCents: null,
    transitCents: null,
    cashIncludingTransitCents: null,
    missingFxAccountIds: ['recipient', 'source'],
  });
  expect(
    ['source', 'recipient'].map(
      (id) =>
        accountBalances(opened.db, '2026-11-01').find((a) => a.accountId === id)!.balanceCents,
    ),
  ).toEqual([40000, 10000]);
  expect(() => netWorthAsOf(opened.db, '2026-11-01')).toThrow('USD');
  expect(snapshot()).toBe(before);
});
it.each(['fromBookingId', 'toBookingId'] as const)(
  'deleting ONE %s deletes the pair; Undo and redo conserve all days',
  (key) => {
    const pair = transfer(false);
    const saved = [
      getBooking(opened.db, pair.fromBookingId),
      getBooking(opened.db, pair.toBookingId),
    ];
    deleteBooking(opened.db, pair[key], { ...ctx, groupId: 'delete-one-leg' });
    const checkDeleted = () => {
      expect(getBooking(opened.db, pair.fromBookingId)).toBeUndefined();
      expect(getBooking(opened.db, pair.toBookingId)).toBeUndefined();
      for (const asOf of days) {
        expect(
          ['source', 'recipient'].map(
            (id) => accountBalances(opened.db, asOf).find((a) => a.accountId === id)!.balanceCents,
          ),
        ).toEqual([50000, 10000]);
        expect(bankTransitReconciliation(opened.db, asOf, ['source', 'recipient'])).toMatchObject({
          rawCashCents: 60000,
          transitCents: 0,
          cashIncludingTransitCents: 60000,
        });
        expect(netWorthAsOf(opened.db, asOf).totalCents).toBe(60000);
      }
    };
    checkDeleted();
    const restored = undo(opened.db, { groupId: 'delete-one-leg' }, ctx);
    expect([
      getBooking(opened.db, pair.fromBookingId),
      getBooking(opened.db, pair.toBookingId),
    ]).toEqual(saved);
    expect(
      days.map(
        (asOf) => bankTransitReconciliation(opened.db, asOf, ['source', 'recipient']).transitCents,
      ),
    ).toEqual([0, 10000, 10000, 0, 0]);
    expect(days.map((asOf) => netWorthAsOf(opened.db, asOf).totalCents)).toEqual([
      60000, 60000, 60000, 60000, 60000,
    ]);
    undo(opened.db, { groupId: restored.groupId }, ctx);
    checkDeleted();
  },
);
