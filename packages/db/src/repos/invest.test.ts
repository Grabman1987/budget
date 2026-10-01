import { INCOME_TYPES } from '../schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { undo } from './audit';
import { createBooking, createTransfer, getBooking } from './bookings';
import { ConflictError } from './errors';
import { accounts, createEntity } from './entities';
import { portfolioFlows } from './portfolio';
import { accountBalances } from './queries';
import {
  changeSavingsPlan,
  createSavingsPlan,
  endSavingsPlan,
  listSavingsPlans,
  plansOn,
} from './savings-plans';
import {
  createAssetClass,
  createSecurity,
  deleteSecurity,
  deleteTargetVersion,
  listTargetVersions,
  setTargets,
  targetsAsOf,
  updateSecurity,
} from './securities';
import { seedBasics, testCtx } from './test-helpers';
import {
  createTrade,
  deleteTrade,
  getTrade,
  listTrades,
  updateTrade,
  TradeRuleError,
} from './trades';
import { institution } from '../schema';

let opened: OpenedDatabase;
let db: OpenedDatabase['db'];

const balance = (accountId: string, asOf = '2026-12-31') =>
  accountBalances(db, asOf).find((b) => b.accountId === accountId)?.balanceCents ?? 0;
const E8 = 100_000_000;

beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  seedBasics(db);
  accounts.create(
    db,
    {
      id: 'depot',
      name: 'Depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
      sortOrder: 4,
    },
    testCtx,
  );
  createEntity(db, institution, { id: 'inst', name: 'Broker C' }, testCtx);
  createAssetClass(db, { id: 'ac1', name: 'Aktien Welt', sortOrder: 1 }, testCtx);
  createAssetClass(db, { id: 'ac2', name: 'Schwellenländer', sortOrder: 2 }, testCtx);
  createSecurity(
    db,
    { id: 's1', name: 'Welt-ETF', kind: 'etf', isin: 'IE00B4L5Y983', assetClassId: 'ac1' },
    testCtx,
  );
});

/** Savings-plan money arrives on the depot (transfer from the current account). */
const fund = (cents: number, date = '2026-03-01') =>
  createTransfer(
    db,
    { fromAccountId: 'giro', toAccountId: 'depot', date, amountCents: cents },
    testCtx,
  );

describe('trades settle on the investment account', () => {
  it('a buy leaves -(amount + fee) so the depot cash stays 0', () => {
    fund(50_500);
    const r = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: 5 * E8,
        amountCents: 50_000,
        feeCents: 500,
      },
      testCtx,
    );
    expect(r.duplicate).toBe(false);
    expect(getBooking(db, r.bookingId as string)?.amountCents).toBe(-50_500);
    expect(r.trade.bookingId).toBe(r.bookingId);
    expect(balance('depot')).toBe(0);
  });

  it('sell = amount - fee - tax; dividend is income of type Kapitalerträge', () => {
    const sell = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-04-01',
        kind: 'sell',
        unitsE8: -1 * E8,
        amountCents: 30_000,
        feeCents: 200,
        taxCents: 1_000,
      },
      testCtx,
    );
    expect(getBooking(db, sell.bookingId as string)?.amountCents).toBe(28_800);
    const dividend = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-04-02',
        kind: 'dividend',
        amountCents: 1_800,
        feeCents: 150,
        taxCents: 350,
      },
      testCtx,
    );
    const booking = getBooking(db, dividend.bookingId as string);
    expect(booking?.amountCents).toBe(1_300);
    expect(booking?.splits.map((s) => [s.amountCents, s.incomeTypeId, s.categoryId])).toEqual([
      [1_300, INCOME_TYPES.capital.id, null],
    ]);
    expect(balance('depot')).toBe(28_800 + 1_300);
  });

  it('standalone fee and tax are outflows; deliveries and splits move no money', () => {
    const fee = createTrade(
      db,
      { securityId: 's1', accountId: 'depot', date: '2026-05-01', kind: 'fee', amountCents: 450 },
      testCtx,
    );
    expect(getBooking(db, fee.bookingId as string)?.amountCents).toBe(-450);
    const tax = createTrade(
      db,
      { securityId: 's1', accountId: 'depot', date: '2026-05-02', kind: 'tax', amountCents: 800 },
      testCtx,
    );
    expect(getBooking(db, tax.bookingId as string)?.amountCents).toBe(-800);
    for (const [kind, units] of [
      ['delivery_in', E8],
      ['delivery_out', -E8],
      ['split', 3 * E8],
    ] as const) {
      const r = createTrade(
        db,
        {
          securityId: 's1',
          accountId: 'depot',
          date: '2026-05-03',
          kind,
          unitsE8: units,
          amountCents: 0,
        },
        testCtx,
      );
      expect(r.bookingId).toBeNull();
    }
    expect(balance('depot')).toBe(-1_250);
  });

  it('undo of a trade reverts the trade and its booking in one step', () => {
    const groupId = 'trade-group';
    const r = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: E8,
        amountCents: 10_000,
      },
      { actor: 'tester', groupId },
    );
    expect(balance('depot')).toBe(-10_000);
    undo(db, { groupId }, { actor: 'tester' });
    expect(listTrades(db)).toHaveLength(0);
    expect(getBooking(db, r.bookingId as string)).toBeUndefined();
    expect(balance('depot')).toBe(0);
  });

  it('deleting a trade removes its booking too; undo of the deletion restores both', () => {
    const r = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: E8,
        amountCents: 10_000,
      },
      testCtx,
    );
    const groupId = 'del-group';
    deleteTrade(db, r.trade.id, { actor: 'tester', groupId });
    expect(listTrades(db)).toHaveLength(0);
    expect(balance('depot')).toBe(0);
    undo(db, { groupId }, { actor: 'tester' });
    expect(listTrades(db)).toHaveLength(1);
    expect(balance('depot')).toBe(-10_000);
  });

  it('update moves the booking along; a kind without money drops it', () => {
    const r = createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: E8,
        amountCents: 10_000,
      },
      testCtx,
    );
    const changed = updateTrade(
      db,
      r.trade.id,
      { amountCents: 12_000, feeCents: 300, date: '2026-03-03' },
      testCtx,
    );
    const booking = getBooking(db, changed.bookingId as string);
    expect(booking).toMatchObject({ amountCents: -12_300, date: '2026-03-03' });
    expect(balance('depot')).toBe(-12_300);
    const delivery = updateTrade(db, r.trade.id, { kind: 'delivery_in', feeCents: 0 }, testCtx);
    expect(delivery.bookingId).toBeNull();
    expect(getBooking(db, r.bookingId as string)).toBeUndefined();
    expect(balance('depot')).toBe(0);
    // And the other way round: it gets a booking again.
    const again = updateTrade(db, r.trade.id, { kind: 'buy' }, testCtx);
    expect(again.bookingId).not.toBeNull();
    expect(balance('depot')).toBe(-12_000);
  });

  it('refuses units with the wrong sign, a missing booking account and bad money', () => {
    const base = { securityId: 's1', accountId: 'depot', date: '2026-03-02', amountCents: 100 };
    expect(() => createTrade(db, { ...base, kind: 'buy', unitsE8: -E8 }, testCtx)).toThrow(
      TradeRuleError,
    );
    expect(() => createTrade(db, { ...base, kind: 'sell', unitsE8: E8 }, testCtx)).toThrow(
      TradeRuleError,
    );
    expect(() => createTrade(db, { ...base, kind: 'split', unitsE8: 0 }, testCtx)).toThrow(
      TradeRuleError,
    );
    expect(() => createTrade(db, { ...base, kind: 'dividend', unitsE8: E8 }, testCtx)).toThrow(
      /moves money only/,
    );
    expect(() =>
      createTrade(db, { ...base, kind: 'buy', unitsE8: E8, taxCents: 5 }, testCtx),
    ).toThrow(/no tax/);
    expect(() =>
      createTrade(db, { ...base, kind: 'sell', unitsE8: -E8, feeCents: 80, taxCents: 30 }, testCtx),
    ).toThrow(/cannot exceed/);
    expect(() =>
      createTrade(db, { ...base, accountId: 'giro', kind: 'buy', unitsE8: E8 }, testCtx),
    ).toThrow(/investment account/);
    expect(() =>
      createTrade(db, { ...base, securityId: 'nope', kind: 'buy', unitsE8: E8 }, testCtx),
    ).toThrow(/not found/);
    expect(listTrades(db)).toHaveLength(0);
    expect(balance('depot')).toBe(0);
  });

  it('an import key makes the write idempotent per account', () => {
    const input = {
      securityId: 's1',
      accountId: 'depot',
      date: '2026-03-02',
      kind: 'buy' as const,
      unitsE8: E8,
      amountCents: 10_000,
      importKey: 'order-1',
    };
    const first = createTrade(db, input, testCtx);
    const second = createTrade(db, input, testCtx);
    expect(second.duplicate).toBe(true);
    expect(second.trade.id).toBe(first.trade.id);
    expect(listTrades(db)).toHaveLength(1);
    expect(balance('depot')).toBe(-10_000);
    expect(getTrade(db, first.trade.id).importKey).toBe('order-1');
  });
});

describe('securities and asset classes', () => {
  it('keeps the ISIN unique and refuses to delete a security that is in use', () => {
    expect(() =>
      createSecurity(db, { name: 'Zweiter', kind: 'etf', isin: 'IE00B4L5Y983' }, testCtx),
    ).toThrow(ConflictError);
    const other = createSecurity(db, { name: 'Zweiter', kind: 'etf' }, testCtx);
    expect(() => updateSecurity(db, other.id, { isin: 'IE00B4L5Y983' }, testCtx)).toThrow(
      ConflictError,
    );
    createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: E8,
        amountCents: 100,
      },
      testCtx,
    );
    expect(() => deleteSecurity(db, 's1', testCtx)).toThrow(ConflictError);
    deleteSecurity(db, other.id, testCtx);
  });

  it('target versions add up to 10 000 bp, replace per day, and end the share of a dropped class', () => {
    expect(() =>
      setTargets(db, '2026-01-01', [{ assetClassId: 'ac1', targetShareBp: 9_000 }], testCtx),
    ).toThrow(/10 000/);
    setTargets(
      db,
      '2026-01-01',
      [
        { assetClassId: 'ac1', targetShareBp: 8_000, bandBp: 500 },
        { assetClassId: 'ac2', targetShareBp: 2_000 },
      ],
      testCtx,
    );
    // From July only the world class is wanted: ac2 is set to 0 on its own.
    const v2 = setTargets(
      db,
      '2026-07-01',
      [{ assetClassId: 'ac1', targetShareBp: 10_000 }],
      testCtx,
    );
    expect(v2.targets.map((t) => [t.assetClassId, t.targetShareBp])).toEqual([
      ['ac1', 10_000],
      ['ac2', 0],
    ]);
    expect(targetsAsOf(db, '2026-06-30').map((t) => t.targetShareBp)).toEqual([8_000, 2_000]);
    expect(targetsAsOf(db, '2026-07-01').map((t) => t.targetShareBp)).toEqual([10_000, 0]);
    expect(targetsAsOf(db, '2025-12-31')).toEqual([]);
    // Same day again replaces the rows.
    setTargets(
      db,
      '2026-07-01',
      [
        { assetClassId: 'ac1', targetShareBp: 7_000 },
        { assetClassId: 'ac2', targetShareBp: 3_000 },
      ],
      testCtx,
    );
    expect(listTargetVersions(db).map((v) => [v.validFrom, v.sumBp])).toEqual([
      ['2026-01-01', 10_000],
      ['2026-07-01', 10_000],
    ]);
    expect(() =>
      setTargets(
        db,
        '2026-08-01',
        [
          { assetClassId: 'ac1', targetShareBp: 5_000 },
          { assetClassId: 'ac1', targetShareBp: 5_000 },
        ],
        testCtx,
      ),
    ).toThrow(/twice/);
    deleteTargetVersion(db, '2026-07-01', testCtx);
    expect(targetsAsOf(db, '2026-12-31').map((t) => t.targetShareBp)).toEqual([8_000, 2_000]);
  });
});

describe('savings plan rows', () => {
  const plan = {
    securityId: 's1',
    accountId: 'depot',
    sourceAccountId: 'giro',
    amountCents: 30_000,
    dayOfMonth: 15,
    validFrom: '2026-01-01',
  };

  it('a change ends the current row and starts a new one; history keeps the old rate', () => {
    const first = createSavingsPlan(db, plan, testCtx);
    expect(() => createSavingsPlan(db, plan, testCtx)).toThrow(ConflictError);
    const next = changeSavingsPlan(db, first.id, { amountCents: 10_000 }, '2026-10-15', testCtx);
    expect(next).toMatchObject({ amountCents: 10_000, validFrom: '2026-10-15', validTo: null });
    expect(listSavingsPlans(db).map((r) => r.id)).toEqual([next.id]);
    const all = listSavingsPlans(db, { includeEnded: true });
    expect(all.find((r) => r.id === first.id)?.validTo).toBe('2026-10-14');
    expect(plansOn(db, '2026-10-14').map((r) => r.amountCents)).toEqual([30_000]);
    expect(plansOn(db, '2026-10-15').map((r) => r.amountCents)).toEqual([10_000]);
    // A change from the row's own start day corrects it in place.
    const fixed = changeSavingsPlan(db, next.id, { amountCents: 12_000 }, '2026-10-15', testCtx);
    expect(fixed.id).toBe(next.id);
    expect(listSavingsPlans(db, { includeEnded: true })).toHaveLength(2);
    const ended = endSavingsPlan(db, next.id, '2026-12-31', testCtx);
    expect(ended.validTo).toBe('2026-12-31');
    expect(listSavingsPlans(db)).toEqual([]);
  });

  it('validates the rate, the day and the accounts', () => {
    expect(() => createSavingsPlan(db, { ...plan, amountCents: 0 }, testCtx)).toThrow(RangeError);
    expect(() => createSavingsPlan(db, { ...plan, dayOfMonth: 32 }, testCtx)).toThrow(RangeError);
    expect(() => createSavingsPlan(db, { ...plan, accountId: 'giro' }, testCtx)).toThrow(
      /investment account/,
    );
    expect(() => createSavingsPlan(db, { ...plan, sourceAccountId: 'depot' }, testCtx)).toThrow(
      /differ/,
    );
  });
});

describe('depot view: deposits onto the reference account are external flows', () => {
  it('counts a plain inflow, but not trade settlement, Kapitalerträge or outflows', () => {
    // A deposit booked straight onto the depot account (e.g. salary paid in).
    createBooking(
      db,
      {
        accountId: 'depot',
        date: '2026-02-01',
        amountCents: 100_000,
        splits: [{ categoryId: null, amountCents: 100_000 }],
      },
      testCtx,
    );
    // Interest on the depot cash: performance, not a deposit.
    createBooking(
      db,
      {
        accountId: 'depot',
        date: '2026-02-02',
        amountCents: 500,
        splits: [{ categoryId: null, amountCents: 500, incomeTypeId: INCOME_TYPES.capital.id }],
      },
      testCtx,
    );
    // A fee booked as a plain outflow: performance.
    createBooking(
      db,
      {
        accountId: 'depot',
        date: '2026-02-03',
        amountCents: -300,
        splits: [{ categoryId: null, amountCents: -300 }],
      },
      testCtx,
    );
    // Trade settlements (a sale, a dividend) are internal.
    createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-02-04',
        kind: 'sell',
        unitsE8: -E8,
        amountCents: 20_000,
      },
      testCtx,
    );
    createTrade(
      db,
      {
        securityId: 's1',
        accountId: 'depot',
        date: '2026-02-05',
        kind: 'dividend',
        amountCents: 900,
      },
      testCtx,
    );
    // A transfer from the current account is still a flow (as before), and a transfer out too.
    fund(40_000, '2026-02-06');
    createTransfer(
      db,
      { fromAccountId: 'depot', toAccountId: 'spar', date: '2026-02-07', amountCents: 15_000 },
      testCtx,
    );
    const flows = portfolioFlows(db, {
      view: 'depot',
      accounts: ['depot'],
      referenceAccounts: ['depot'],
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(flows).toEqual([
      { date: '2026-02-01', cents: 100_000 },
      { date: '2026-02-06', cents: 40_000 },
      { date: '2026-02-07', cents: -15_000 },
    ]);
    // Deposits on or before `from` are not flows of the window.
    expect(
      portfolioFlows(db, {
        view: 'depot',
        referenceAccounts: ['depot'],
        from: '2026-02-01',
        to: '2026-02-05',
      }),
    ).toEqual([]);
  });
});
