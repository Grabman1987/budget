import { expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { undo } from './audit';
import { linkBookings } from './bank-followups';
import { createBooking, createTransfer, getBooking } from './bookings';
import { accounts } from './entities';
import { paceOfMonth } from './heute';
import { accountBalances, budget } from './queries';
import { overviewData } from './report-ledger';
import { reportMonthFigures } from './report-tables';
import { forecastInputs, loadFacts } from './rule-inputs';
import { seedBasics, testCtx } from './test-helpers';

it('counts giro and card purchases once and nets full and partial refunds in cents', () => {
  const opened = createTestDatabase();
  try {
    const { db } = opened;
    seedBasics(db);
    for (const [id, type] of [
      ['provider', 'checking'],
      ['card', 'credit_card'],
    ] as const)
      accounts.create(
        db,
        { id, name: id, type, role: 'budget', onBudget: true, openingDate: '2026-01-01' },
        testCtx,
      );
    const date = '2026-01-10';
    const asOf = '2026-02-01';
    const book = (accountId: string, amountCents: number, categoryId?: string) =>
      createBooking(
        db,
        {
          accountId,
          date,
          amountCents,
          splits: [{ amountCents, ...(categoryId && { categoryId }) }],
        },
        testCtx,
      );
    const giroPurchase = book('provider', -1201, 'essen');
    const cardPurchase = book('provider', -1703, 'essen');
    const fullRefund = book('provider', 1201, 'essen');
    const partialRefund = book('provider', 207, 'essen');
    const plain = () =>
      overviewData(db).splits.map(({ bookingId, amountCents }) => ({ bookingId, amountCents }));
    const spending = [
      { bookingId: giroPurchase, amountCents: 1201 },
      { bookingId: cardPurchase, amountCents: 1703 },
      { bookingId: fullRefund, amountCents: -1201 },
      { bookingId: partialRefund, amountCents: -207 },
    ];
    expect(plain()).toEqual(spending);
    // Funding from giro and the two return transfers use the existing transfer identity.
    for (const [fromAccountId, toAccountId, amountCents] of [
      ['giro', 'provider', 1201],
      ['provider', 'giro', 1201],
      ['provider', 'card', 207],
    ] as const)
      createTransfer(db, { fromAccountId, toAccountId, date, amountCents }, testCtx);
    expect(plain()).toEqual(spending);

    const debit = book('card', -1703, 'essen');
    const credit = book('provider', 1703);
    const balances = () => accountBalances(db, asOf);
    const legs = () => [getBooking(db, debit)?.amountCents, getBooking(db, credit)?.amountCents];
    const before = balances();
    const { groupId, transferId } = linkBookings(db, [debit, credit], testCtx);
    expect([getBooking(db, debit)?.transferId, getBooking(db, credit)?.transferId]).toEqual([
      transferId,
      transferId,
    ]);
    expect(legs()).toEqual([-1703, 1703]);
    expect(balances()).toEqual(before);
    expect(balances()).toEqual(
      expect.arrayContaining([
        { accountId: 'giro', balanceCents: 100000 },
        { accountId: 'card', balanceCents: -1496 },
        { accountId: 'provider', balanceCents: 0 },
      ]),
    );
    expect(plain()).toEqual(spending);
    expect(budget(db, ['2026-01'])[0]?.envelopes['essen']?.activityCents).toBe(-1496);
    expect(
      reportMonthFigures(db, { today: asOf }).find((row) => row.month === '2026-01')?.spending,
    ).toEqual({ essen: 1496 });
    const facts = loadFacts(db, asOf);
    expect(paceOfMonth(facts, '2026-01', asOf, []).figures.spentCents).toBe(1496);
    const byAccount = Object.fromEntries(before.map((row) => [row.accountId, row.balanceCents]));
    expect(forecastInputs(facts, asOf, { byAccount }).variableMonthlyCents).toBe(499);

    undo(db, { groupId }, testCtx);
    expect(legs()).toEqual([-1703, 1703]);
    expect(getBooking(db, debit)).toMatchObject({
      transferId: null,
      splits: [{ categoryId: 'essen' }],
    });
    expect(getBooking(db, credit)?.transferId).toBeNull();
    expect(balances()).toEqual(before);
  } finally {
    opened.close();
  }
});
