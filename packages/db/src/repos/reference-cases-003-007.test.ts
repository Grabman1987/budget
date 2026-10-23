import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../client';
import { INCOME_TYPES } from '../schema';
import { history, undo } from './audit';
import { assignmentPatch } from './assignment-rules';
import { createBooking, createTransfer, getBooking, listBookings } from './bookings';
import { createCategory } from './categories';
import { accounts } from './entities';
import { setAssigned } from './envelopes';
import { portfolioFlows } from './portfolio';
import { portfolioSummary } from './portfolio-summary';
import { upsertPrice } from './prices';
import { accountBalances, budget } from './queries';
import { createSecurity } from './securities';
import { seedBasics } from './test-helpers';
import { createTrade, getTrade } from './trades';

let opened: ReturnType<typeof createTestDatabase>;
const ctx = { actor: 'synthetic-wp001' };
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db);
});
afterEach(() => opened.close());
const group = () => ({ ...ctx, groupId: randomUUID() });
const balance = (id: string) =>
  accountBalances(opened.db, '2026-10-31').find((row) => row.accountId === id)!.balanceCents;
const months = () => budget(opened.db, ['2026-09', '2026-10']);

function card(opening: number, foodAssigned: number, reserveAssigned: number, carry = false) {
  const db = opened.db;
  accounts.create(
    db,
    {
      id: 'card',
      name: 'Synthetic card',
      type: 'credit_card',
      role: 'budget',
      onBudget: true,
      openingDate: '2026-08-01',
      openingBalanceCents: opening,
    },
    ctx,
  );
  const food = createCategory(
    db,
    { name: 'Synthetic food', groupId: 'g', class: 'need', rolloverOverspending: carry },
    ctx,
  );
  const reserve = createCategory(
    db,
    { name: 'Synthetic reserve', groupId: 'g', kind: 'card_payment', cardAccountId: 'card' },
    ctx,
  );
  setAssigned(db, food.id, '2026-09', foodAssigned, ctx);
  setAssigned(db, reserve.id, '2026-09', reserveAssigned, ctx);
  return { food: food.id, reserve: reserve.id };
}

describe('WP-001 repository reference and transactional proof', () => {
  it.each([
    {
      assigned: 2_000,
      available: 0,
      reserve: 12_000,
      credit: 0,
      free: 88_000,
      cash: 88_000,
      debt: 0,
    },
    {
      assigned: 1_000,
      available: -1_000,
      reserve: 11_000,
      credit: 1_000,
      free: 89_000,
      cash: 89_000,
      debt: -1_000,
    },
  ])('CASE-003 funded=$assigned: reserve, payment and grouped undo agree in both months', (e) => {
    const db = opened.db,
      ids = card(-10_000, e.assigned, 10_000);
    const initial = { months: months(), balances: accountBalances(db, '2026-10-31') };
    const expense = group();
    createBooking(
      db,
      {
        accountId: 'card',
        date: '2026-09-15',
        amountCents: -2_000,
        status: 'confirmed',
        splits: [{ categoryId: ids.food, amountCents: -2_000 }],
      },
      expense,
    );
    const spent = months();
    expect(balance('giro')).toBe(100_000);
    expect(balance('card')).toBe(-12_000);
    expect(spent[0]!.envelopes[ids.food]).toMatchObject({
      activityCents: -2_000,
      availableCents: e.available,
      fundedCardCents: e.assigned,
      creditOverspentCents: e.credit,
      cashOverspentCents: 0,
    });
    expect(spent[0]!.envelopes[ids.reserve]!.availableCents).toBe(e.reserve);
    expect(spent[0]!.cards['card']!.cardDebtGrowthCents).toBe(e.credit);
    expect(spent.map((m) => m.toBeAssignedCents)).toEqual([e.free, e.free]);
    expect(spent[1]!.envelopes[ids.food]).toMatchObject({
      carryCents: 0,
      assignedCents: 0,
      activityCents: 0,
      availableCents: 0,
    });
    expect(spent[1]!.uncoveredCents).toBe(0);
    const payment = group();
    const transfer = createTransfer(
      db,
      {
        fromAccountId: 'giro',
        toAccountId: 'card',
        date: '2026-09-20',
        amountCents: e.reserve,
        status: 'confirmed',
      },
      payment,
    );
    expect(balance('giro')).toBe(e.cash);
    expect(balance('card')).toBe(e.debt);
    const paid = months();
    expect(paid[0]!.envelopes[ids.reserve]!.availableCents).toBe(0);
    expect(paid[0]!.envelopes[ids.food]!.activityCents).toBe(-2_000);
    expect(paid.map((m) => m.toBeAssignedCents)).toEqual([e.free, e.free]);
    undo(db, { groupId: payment.groupId }, ctx);
    expect(getBooking(db, transfer.fromBookingId)).toBeUndefined();
    expect(getBooking(db, transfer.toBookingId)).toBeUndefined();
    expect(months()).toEqual(spent);
    expect(balance('giro')).toBe(100_000);
    expect(balance('card')).toBe(-12_000);
    undo(db, { groupId: expense.groupId }, ctx);
    expect({ months: months(), balances: accountBalances(db, '2026-10-31') }).toEqual(initial);
  });

  it.each([
    { carry: false, reserve: 0, credit: 2_500, cashOverspent: 0, next: 0 },
    { carry: true, reserve: 2_500, credit: 0, cashOverspent: 2_500, next: -2_500 },
  ])(
    'CASE-002 card carry=$carry preserves the default policy without double cash deduction',
    (e) => {
      const db = opened.db,
        ids = card(0, 0, 0, e.carry),
        initial = months(),
        action = group();
      createBooking(
        db,
        {
          accountId: 'card',
          date: '2026-09-15',
          amountCents: -2_500,
          splits: [{ categoryId: ids.food, amountCents: -2_500 }],
        },
        action,
      );
      const [september, october] = months();
      expect(balance('card')).toBe(-2_500);
      expect(balance('giro')).toBe(100_000);
      expect(september).toMatchObject({
        cashCents: 100_000,
        toBeAssignedCents: 100_000,
        creditOverspentCents: e.credit,
      });
      expect(september!.envelopes[ids.food]).toMatchObject({
        availableCents: -2_500,
        creditOverspentCents: e.credit,
        cashOverspentCents: e.cashOverspent,
      });
      expect(september!.envelopes[ids.reserve]!.availableCents).toBe(e.reserve);
      expect(october).toMatchObject({
        cashCents: 100_000,
        toBeAssignedCents: 100_000,
        uncoveredCents: 0,
      });
      expect(october!.envelopes[ids.food]).toMatchObject({
        carryCents: e.next,
        assignedCents: 0,
        activityCents: 0,
        availableCents: e.next,
      });
      undo(db, { groupId: action.groupId }, ctx);
      expect(months()).toEqual(initial);
      expect(balance('card')).toBe(0);
    },
  );

  it('CASE-004 persists 334/333/333 and the exact opposite reversal, with independent undo groups', () => {
    const db = opened.db;
    const template = [
      { categoryId: 'essen', weightBp: 3334 },
      { categoryId: 'reise', weightBp: 3333 },
      { categoryId: 'miete', weightBp: 3333 },
    ];
    const expense = group(),
      reversal = group(),
      initial = months();
    const original = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-09-15',
        amountCents: -1_000,
        splits: assignmentPatch(-1_000, { splits: template }).splits!,
      },
      expense,
    );
    expect(getBooking(db, original)!.splits.map((s) => [s.categoryId, s.amountCents])).toEqual([
      ['essen', -334],
      ['reise', -333],
      ['miete', -333],
    ]);
    expect(balance('giro')).toBe(99_000);
    const opposite = createBooking(
      db,
      {
        accountId: 'giro',
        date: '2026-09-16',
        amountCents: 1_000,
        splits: assignmentPatch(1_000, { splits: template }).splits!,
      },
      reversal,
    );
    expect(getBooking(db, opposite)!.splits.map((s) => [s.categoryId, s.amountCents])).toEqual([
      ['essen', 334],
      ['reise', 333],
      ['miete', 333],
    ]);
    expect(balance('giro')).toBe(100_000);
    for (const id of ['essen', 'reise', 'miete'])
      expect(months()[0]!.envelopes[id]!.activityCents).toBe(0);
    undo(db, { groupId: reversal.groupId }, ctx);
    expect(getBooking(db, opposite)).toBeUndefined();
    expect(getBooking(db, original)!.amountCents).toBe(-1_000);
    expect(balance('giro')).toBe(99_000);
    undo(db, { groupId: expense.groupId }, ctx);
    expect(months()).toEqual(initial);
    expect(balance('giro')).toBe(100_000);
  });

  it('CASE-005 rolls back the actual second INSERT, then undoes both successful legs as one action', () => {
    const db = opened.db;
    accounts.update(db, 'spar', { openingBalanceCents: 25_000 }, ctx);
    const snapshot = () =>
      Object.fromEntries(
        ['booking', 'booking_split', 'transfer', 'audit_log'].map((table) => [
          table,
          opened.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all(),
        ]),
      );
    const before = snapshot(),
      balances = accountBalances(db, '2026-10-31'),
      initialBudget = months();
    let firstLegReached = 0;
    opened.sqlite.function('synthetic_first_leg_509', () => {
      firstLegReached++;
      return 0;
    });
    opened.sqlite
      .exec(`CREATE TRIGGER synthetic_509_first AFTER INSERT ON booking WHEN NEW.account_id = 'giro' BEGIN SELECT synthetic_first_leg_509(); END;
      CREATE TRIGGER synthetic_509_second BEFORE INSERT ON booking WHEN NEW.account_id = 'spar' BEGIN SELECT RAISE(ABORT, 'synthetic second transfer leg'); END;`);
    const input = {
      fromAccountId: 'giro',
      toAccountId: 'spar',
      date: '2026-09-15',
      amountCents: 20_000,
    };
    expect(() => createTransfer(db, input, group())).toThrow('synthetic second transfer leg');
    expect(firstLegReached).toBe(1);
    expect(snapshot()).toEqual(before);
    expect(accountBalances(db, '2026-10-31')).toEqual(balances);
    opened.sqlite.exec('DROP TRIGGER synthetic_509_first; DROP TRIGGER synthetic_509_second;');
    const action = group(),
      result = createTransfer(db, input, action);
    expect(balance('giro')).toBe(80_000);
    expect(balance('spar')).toBe(45_000);
    expect(months()[0]).toMatchObject({
      cashCents: 125_000,
      incomeCents: 0,
      assignedCents: 0,
      availableCents: 0,
      toBeAssignedCents: 125_000,
    });
    expect(
      portfolioFlows(db, {
        view: 'depot',
        referenceAccounts: ['giro', 'spar'],
        from: '2026-08-31',
        to: '2026-09-30',
      }),
    ).toEqual([]);
    expect(
      portfolioFlows(db, {
        view: 'depot',
        referenceAccounts: ['giro'],
        from: '2026-08-31',
        to: '2026-09-30',
      }),
    ).toEqual([{ date: '2026-09-15', cents: -20_000 }]);
    const creates = history(db, 'booking', result.fromBookingId);
    expect(history(db, 'booking', result.toBookingId)[0]!.groupId).toBe(action.groupId);
    undo(db, { groupId: action.groupId }, ctx);
    expect(getBooking(db, result.fromBookingId)).toBeUndefined();
    expect(getBooking(db, result.toBookingId)).toBeUndefined();
    expect(accountBalances(db, '2026-10-31')).toEqual(balances);
    expect(months()).toEqual(initialBudget);
    for (const id of [result.fromBookingId, result.toBookingId])
      expect(history(db, 'booking', id).some((row) => row.action === 'undo')).toBe(true);
    expect(history(db, 'booking', result.fromBookingId)).toEqual(expect.arrayContaining(creates));
  });

  function investment(cash: number) {
    const db = opened.db;
    accounts.create(
      db,
      {
        id: 'depot',
        name: 'Synthetic depot',
        type: 'brokerage',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-08-01',
        openingBalanceCents: cash,
      },
      ctx,
    );
    createSecurity(
      db,
      {
        id: 'fund',
        name: 'Synthetic fund',
        kind: 'etf',
        currency: 'EUR',
        exposureValidFrom: '2026-08-01',
      },
      ctx,
    );
    upsertPrice(db, {
      securityId: 'fund',
      date: '2026-08-01',
      priceMicro: 10_000_000,
      currency: 'EUR',
      source: 'manual',
    });
  }

  it('CASE-006 actual trade and cash remain internal to the depot, including grouped undo', () => {
    investment(20_000);
    const db = opened.db,
      action = group();
    const created = createTrade(
      db,
      {
        accountId: 'depot',
        securityId: 'fund',
        date: '2026-09-15',
        kind: 'buy',
        unitsE8: 1_000_000_000,
        amountCents: 10_000,
        feeCents: 200,
      },
      action,
    );
    expect(getBooking(db, created.bookingId!)!.amountCents).toBe(-10_200);
    expect(balance('depot')).toBe(9_800);
    const portfolio = portfolioSummary(db, {
      today: '2026-09-30',
      period: 'Alles',
      view: 'depot',
      referenceAccounts: ['depot'],
    });
    expect(portfolio.classes.flatMap((c) => c.positions)).toEqual([
      expect.objectContaining({ unitsE8: 1_000_000_000, valueCents: 10_000 }),
    ]);
    expect(portfolio.performance).toMatchObject({
      startValueCents: 20_000,
      endValueCents: 19_800,
      contributionsCents: 0,
      gainCents: -200,
    });
    expect(
      portfolioFlows(db, { view: 'securities', from: '2026-08-31', to: '2026-09-30' }),
    ).toEqual([{ date: '2026-09-15', cents: 10_200 }]);
    undo(db, { groupId: action.groupId }, ctx);
    expect(() => getTrade(db, created.trade.id)).toThrow('trade');
    expect(getBooking(db, created.bookingId!)).toBeUndefined();
    expect(balance('depot')).toBe(20_000);
  });

  it('CASE-007 settles 700 exactly once, with zero included-cash contribution and named security tax bases', () => {
    investment(0);
    const db = opened.db;
    createTrade(
      db,
      {
        accountId: 'depot',
        securityId: 'fund',
        date: '2026-08-01',
        kind: 'delivery_in',
        unitsE8: 1_000_000_000,
        amountCents: 10_000,
      },
      ctx,
    );
    const action = group(),
      created = createTrade(
        db,
        {
          accountId: 'depot',
          securityId: 'fund',
          date: '2026-09-15',
          kind: 'dividend',
          amountCents: 1_000,
          feeCents: 100,
          taxCents: 200,
        },
        action,
      );
    expect(balance('depot')).toBe(700);
    expect(listBookings(db).filter((row) => row.accountId === 'depot')).toHaveLength(1);
    expect(getBooking(db, created.bookingId!)!.splits[0]).toMatchObject({
      amountCents: 700,
      incomeTypeId: INCOME_TYPES.capital.id,
    });
    expect(
      portfolioSummary(db, {
        today: '2026-09-30',
        period: '1M',
        view: 'depot',
        referenceAccounts: ['depot'],
      }).performance,
    ).toMatchObject({
      startValueCents: 10_000,
      endValueCents: 10_700,
      contributionsCents: 0,
      gainCents: 700,
    });
    expect(
      portfolioFlows(db, {
        view: 'securities',
        from: '2026-08-31',
        to: '2026-09-30',
        taxBasis: 'after-tax',
      }),
    ).toEqual([{ date: '2026-09-15', cents: -700 }]);
    expect(
      portfolioFlows(db, {
        view: 'securities',
        from: '2026-08-31',
        to: '2026-09-30',
        taxBasis: 'before-tax',
      }),
    ).toEqual([{ date: '2026-09-15', cents: -900 }]);
    const undone = undo(db, { groupId: action.groupId }, ctx);
    expect(balance('depot')).toBe(0);
    expect(getBooking(db, created.bookingId!)).toBeUndefined();
    undo(db, { groupId: undone.groupId }, ctx);
    expect(balance('depot')).toBe(700);
    expect(listBookings(db).filter((row) => row.accountId === 'depot')).toHaveLength(1);
  });
});
