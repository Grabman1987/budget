import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, auditLog, booking, bookingSplit, INCOME_TYPES, price, transfer } from '../schema';
import { deleteBooking } from './bookings';
import { accounts } from './entities';
import { accountSummaries } from './ledger-queries';
import { applyOwnerTrades, parseOwnerTradesFile } from './operator-owner-trades';
import { undoAuditGroups } from './operator-ops';
import { costsTaxesReport } from './portfolio-costs';
import { portfolioSummary } from './portfolio-summary';
import { portfolioFlows } from './portfolio';
import { createSecurity } from './securities';
import { createTrade, listTrades, updateTrade } from './trades';

const ctx = { actor: 'operator' };
let opened: OpenedDatabase;
let db: OpenedDatabase['db'];
const add = (patch: Record<string, unknown> = {}) => ({
  kind: 'add',
  id: 'buy',
  account: 'Synthetic Depot',
  security: 'Synthetic Coin',
  date: '2026-03-02',
  tradeKind: 'buy',
  units: '1.23456789',
  amountCents: 12000,
  feeCents: 100,
  cashAccount: 'Synthetic Cash',
  importKey: 'synthetic:purchase',
  ...patch,
});
const run = (trades: unknown[], dryRun = false) =>
  applyOwnerTrades(db, parseOwnerTradesFile({ trades }), ctx, { dryRun });
const balances = () =>
  Object.fromEntries(accountSummaries(db, '2026-03-20').map((a) => [a.id, a.balanceCents]));
const counts = () => [
  db.select().from(auditLog).all().length,
  db.select().from(booking).all().length,
  db.select().from(bookingSplit).all().length,
  listTrades(db, { includeDeleted: true }).length,
  db.select().from(transfer).all().length,
];
const deletion = (tradeKind = 'buy', patch: Record<string, unknown> = {}) => ({
  kind: 'delete',
  id: 'remove',
  match: {
    account: 'Synthetic Depot',
    isin: 'XX0000000001',
    date: '2026-03-02',
    tradeKind,
    ...patch,
  },
});
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  accounts.create(
    db,
    {
      id: 'cash',
      name: 'Synthetic Cash',
      type: 'checking',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
      openingBalanceCents: 100000,
    },
    ctx,
  );
  accounts.create(
    db,
    {
      id: 'depot',
      name: 'Synthetic Depot',
      type: 'crypto',
      role: 'investment',
      onBudget: false,
      openingDate: '2023-10-01',
      referenceAccountId: 'cash',
    },
    ctx,
  );
  createSecurity(
    db,
    { id: 'coin', name: 'Synthetic Coin', isin: 'XX0000000001', kind: 'crypto' },
    ctx,
  );
});
afterEach(() => opened.close());

describe('owner-trades', () => {
  it('repairs a duplicate missing its cash transfer, including dry-run and undo', () => {
    createTrade(
      db,
      {
        accountId: 'depot',
        securityId: 'coin',
        date: '2026-03-02',
        kind: 'buy',
        unitsE8: 123456789,
        amountCents: 12000,
        feeCents: 100,
        importKey: 'synthetic:purchase',
        source: 'import',
      },
      ctx,
    );
    expect(balances()).toEqual({ cash: 100000, depot: -12100 });
    const before = counts();
    const trial = run([add()], true);
    expect(trial.outcomes[0]).toMatchObject({ status: 'repaired', groupId: '' });
    expect(trial.cashChanges).toEqual([
      { account: 'Synthetic Cash', cents: '-12100' },
      { account: 'Synthetic Depot', cents: '12100' },
    ]);
    expect(counts()).toEqual(before);
    const repaired = run([add()]);
    expect(repaired.counts).toEqual({
      added: 0,
      repaired: 1,
      unchanged: 0,
      deleted: 0,
      skipped: 0,
    });
    expect(balances()).toEqual({ cash: 87900, depot: 0 });
    expect(listTrades(db)).toHaveLength(1);
    expect(
      db
        .select()
        .from(booking)
        .where(eq(booking.importKey, 'synthetic:purchase:cash'))
        .all()
        .map((b) => [b.accountId, b.amountCents])
        .sort(),
    ).toEqual([
      ['cash', -12100],
      ['depot', 12100],
    ]);
    const afterRepair = counts();
    expect(run([add()]).outcomes[0]!.status).toBe('unchanged');
    expect(counts()).toEqual(afterRepair);
    undoAuditGroups(db, [repaired.outcomes[0]!.groupId], ctx);
    expect(balances()).toEqual({ cash: 100000, depot: -12100 });
    const afterUndo = counts();
    expect(run([add()]).outcomes[0]!.status).toBe('unchanged');
    expect(counts()).toEqual(afterUndo);
  });

  it('leaves a cash transfer deleted by the owner unchanged on duplicate add', () => {
    run([add()]);
    const leg = db
      .select()
      .from(booking)
      .where(eq(booking.importKey, 'synthetic:purchase:cash'))
      .get()!;
    deleteBooking(db, leg.id, ctx);
    const before = counts();
    expect(run([add()]).outcomes[0]!.status).toBe('unchanged');
    expect(counts()).toEqual(before);
    expect(balances()).toEqual({ cash: 100000, depot: -12100 });
  });

  it.each(['buy', 'sell', 'dividend', 'interest', 'fee', 'tax'])(
    'requires cashAccount for %s on a depot with a reference account',
    (tradeKind) => {
      const entry = add({
        tradeKind,
        units: tradeKind === 'buy' ? '1' : tradeKind === 'sell' ? '-1' : '0',
        feeCents: 0,
        cashAccount: undefined,
      });
      const before = counts();
      expect(run([entry]).outcomes[0]).toMatchObject({
        status: 'skipped',
        reason: 'missing_cash_account',
        groupId: '',
      });
      expect(counts()).toEqual(before);
      expect(balances()).toEqual({ cash: 100000, depot: 0 });
      db.update(account).set({ referenceAccountId: null }).where(eq(account.id, 'depot')).run();
      expect(run([entry]).outcomes[0]!.status).toBe('added');
    },
  );

  it('adds an exact buy and PP-style transfer pair, repeats unchanged, deletes and undoes both runs', () => {
    const result = run([add({ account: 'synthetic depot' })]);
    expect(result.counts).toEqual({ added: 1, repaired: 0, unchanged: 0, deleted: 0, skipped: 0 });
    expect(balances()).toEqual({ cash: 87900, depot: 0 });
    expect(listTrades(db)[0]).toMatchObject({
      unitsE8: 123456789,
      amountCents: 12000,
      feeCents: 100,
    });
    const legs = db
      .select()
      .from(booking)
      .all()
      .filter((b) => b.importKey === 'synthetic:purchase:cash');
    expect(legs).toHaveLength(2);
    expect(legs.map((b) => [b.accountId, b.amountCents]).sort()).toEqual([
      ['cash', -12100],
      ['depot', 12100],
    ]);
    expect(legs[0]!.transferId).toBe(legs[1]!.transferId);
    expect(legs.every((b) => b.memo === 'Verrechnung')).toBe(true);
    expect(result.cashChanges).toEqual([
      { account: 'Synthetic Cash', cents: '-12100' },
      { account: 'Synthetic Depot', cents: '0' },
    ]);
    expect(result.unitChanges).toEqual([{ security: 'Synthetic Coin', units: '1.23456789' }]);
    const before = counts();
    expect(run([add()]).outcomes[0]!.status).toBe('unchanged');
    expect(counts()).toEqual(before);
    const deleted = run([deletion()]);
    expect(deleted.outcomes[0]!.status).toBe('deleted');
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
    expect(listTrades(db)).toEqual([]);
    const afterDelete = counts();
    expect(run([add()]).outcomes[0]).toMatchObject({
      status: 'skipped',
      reason: 'deleted_by_owner',
      groupId: '',
    });
    expect(counts()).toEqual(afterDelete);
    expect(
      db
        .select()
        .from(booking)
        .all()
        .every((b) => b.deletedAt),
    ).toBe(true);
    undoAuditGroups(db, [deleted.outcomes[0]!.groupId], ctx);
    expect(balances()).toEqual({ cash: 87900, depot: 0 });
    undoAuditGroups(db, [result.outcomes[0]!.groupId], ctx);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
    expect(listTrades(db)).toEqual([]);
    expect(run([add()]).outcomes[0]!.reason).toBe('deleted_by_owner');
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
  });

  it('settles sell, dividend, interest, delivery, fee and tax under one undoable group', () => {
    const result = run([
      add({
        id: 'sell',
        tradeKind: 'sell',
        units: '-0.5',
        amountCents: 6000,
        taxCents: 200,
        importKey: 'synthetic:sell',
      }),
      add({
        id: 'div',
        tradeKind: 'dividend',
        units: '0',
        amountCents: 800,
        feeCents: 0,
        taxCents: 100,
        importKey: 'synthetic:dividend',
      }),
      add({
        id: 'interest',
        tradeKind: 'interest',
        units: '0',
        amountCents: 50,
        feeCents: 0,
        importKey: 'synthetic:interest',
      }),
      add({
        id: 'delivery',
        tradeKind: 'delivery_in',
        units: '2',
        amountCents: 0,
        feeCents: 0,
        cashAccount: undefined,
        importKey: 'synthetic:delivery',
      }),
      add({
        id: 'fee',
        tradeKind: 'fee',
        units: '0',
        amountCents: 75,
        feeCents: 0,
        importKey: 'synthetic:fee',
      }),
      add({
        id: 'tax',
        tradeKind: 'tax',
        units: '0',
        amountCents: 90,
        feeCents: 0,
        importKey: 'synthetic:tax',
      }),
    ]);
    expect(result.counts.added).toBe(6);
    expect(new Set(result.outcomes.map((o) => o.groupId)).size).toBe(1);
    expect(balances()).toEqual({ cash: 106285, depot: 0 });
    for (const [key, expected] of [
      [
        'synthetic:sell:cash',
        [
          ['cash', 5700],
          ['depot', -5700],
        ],
      ],
      [
        'synthetic:fee:cash',
        [
          ['cash', -75],
          ['depot', 75],
        ],
      ],
    ] as const) {
      expect(
        db
          .select()
          .from(booking)
          .where(eq(booking.importKey, key))
          .all()
          .map((b) => [b.accountId, b.amountCents])
          .sort(),
      ).toEqual(expected);
    }
    expect(result.unitChanges[0]!.units).toBe('1.5');
    expect(listTrades(db).find((t) => t.kind === 'delivery_in')!.bookingId).toBeNull();
    undoAuditGroups(db, [result.outcomes[0]!.groupId], ctx);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
    expect(listTrades(db)).toEqual([]);
  });

  it('rewards add units with zero cash and appear as capital income and performance', () => {
    const reward = add({
      id: 'reward',
      tradeKind: 'reward',
      units: '0.25',
      amountCents: 500,
      feeCents: 0,
      cashAccount: undefined,
      importKey: 'synthetic:reward',
    });
    const result = run([reward]);
    expect(result.counts.added).toBe(1);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
    expect(
      listTrades(db)
        .map((t) => t.importKey)
        .sort(),
    ).toEqual(['synthetic:reward:buy', 'synthetic:reward:div']);
    expect(result.unitChanges[0]!.units).toBe('0.25');
    expect(db.select().from(transfer).all()).toEqual([]);
    expect(
      db
        .select()
        .from(bookingSplit)
        .where(eq(bookingSplit.incomeTypeId, INCOME_TYPES.capital.id))
        .get()!.amountCents,
    ).toBe(500);
    expect(costsTaxesReport(db, { today: '2026-03-20' }).income.dividend.grossCents).toBe(500);
    expect(portfolioSummary(db, { today: '2026-03-20' }).income.grossCents).toBe(500);
    expect(
      portfolioFlows(db, {
        accounts: ['depot'],
        securities: ['coin'],
        from: '2026-03-01',
        to: '2026-03-20',
      }),
    ).toEqual([]);
    const before = counts();
    expect(run([reward]).outcomes[0]!.status).toBe('unchanged');
    expect(counts()).toEqual(before);
    for (const kind of ['buy', 'dividend']) {
      expect(run([deletion(kind)]).outcomes[0]).toMatchObject({
        status: 'skipped',
        reason: 'reward_leg',
        detail: 'use tradeKind: "reward"',
        groupId: '',
      });
      expect(counts()).toEqual(before);
      expect(listTrades(db)).toHaveLength(2);
      expect(balances()).toEqual({ cash: 100000, depot: 0 });
    }
    const buy = listTrades(db).find((t) => t.kind === 'buy')!;
    const dateGroup = 'synthetic-reward-date-change';
    updateTrade(db, buy.id, { date: '2026-03-03' }, { ...ctx, groupId: dateGroup });
    const beforeLegDelete = counts();
    expect(run([deletion('dividend')]).outcomes[0]!.reason).toBe('reward_leg');
    expect(counts()).toEqual(beforeLegDelete);
    undoAuditGroups(db, [dateGroup], ctx);
    const deleted = run([deletion('reward', { units: '0.25', amountCents: 500 })]);
    expect(deleted.outcomes[0]!.status).toBe('deleted');
    expect(listTrades(db)).toEqual([]);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
    const afterDelete = counts();
    expect(run([reward]).outcomes[0]!.reason).toBe('deleted_by_owner');
    expect(counts()).toEqual(afterDelete);
    undoAuditGroups(db, [deleted.outcomes[0]!.groupId], ctx);
    expect(listTrades(db)).toHaveLength(2);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
  });

  it('reward value increases the performance gain without external contributions', () => {
    run([
      add({
        id: 'opening',
        date: '2026-03-01',
        units: '1',
        amountCents: 10000,
        feeCents: 0,
        importKey: 'synthetic:opening',
      }),
    ]);
    db.insert(price)
      .values({ securityId: 'coin', date: '2026-03-01', priceMicro: 100000000, source: 'manual' })
      .run();
    run([
      add({
        id: 'reward',
        tradeKind: 'reward',
        units: '0.05',
        amountCents: 500,
        feeCents: 0,
        cashAccount: undefined,
        importKey: 'synthetic:reward',
      }),
    ]);
    const summary = portfolioSummary(db, { today: '2026-03-20', includePerformanceHistory: true });
    expect(summary.positions[0]!.unitsE8).toBe(105000000);
    expect(summary.income.grossCents).toBe(500);
    expect(summary.performance).toMatchObject({
      startValueCents: 10000,
      endValueCents: 10500,
      contributionsCents: 0,
      gainCents: 500,
    });
    expect(summary.performance!.ttwror).toBeCloseTo(0.05);
    expect(summary.performanceHistory).not.toBeNull();
    expect(balances()).toEqual({ cash: 90000, depot: 0 });
  });

  it('an incomplete reward pair is refused and a locked reward deletion restores its first leg', () => {
    const reward = add({
      tradeKind: 'reward',
      feeCents: 0,
      units: '0.1',
      cashAccount: undefined,
      importKey: 'synthetic:reward',
    });
    createTrade(
      db,
      {
        accountId: 'depot',
        securityId: 'coin',
        date: '2026-03-02',
        kind: 'dividend',
        unitsE8: 0,
        amountCents: 12000,
        importKey: 'synthetic:reward:div',
        source: 'import',
      },
      ctx,
    );
    const incomplete = counts();
    expect(run([reward]).outcomes[0]!.reason).toBe('conflict');
    expect(counts()).toEqual(incomplete);
    run([
      add({
        id: 'complete',
        tradeKind: 'reward',
        feeCents: 0,
        units: '0.1',
        cashAccount: undefined,
        importKey: 'synthetic:complete',
      }),
    ]);
    const buy = listTrades(db).find((t) => t.importKey === 'synthetic:complete:buy')!;
    db.update(booking).set({ status: 'reconciled' }).where(eq(booking.id, buy.bookingId!)).run();
    const before = counts();
    expect(run([deletion('reward')]).outcomes[0]!.reason).toBe('reconciled_locked');
    expect(counts()).toEqual(before);
    expect(listTrades(db)).toHaveLength(3);
  });

  it('dry-run executes adds and deletes, reports deltas and leaves no rows or audit', () => {
    const before = counts();
    const trial = run([add()], true);
    expect(trial.counts.added).toBe(1);
    expect(trial.cashChanges[0]!.cents).toBe('-12100');
    expect(trial.outcomes[0]!.groupId).toBe('');
    expect(counts()).toEqual(before);
    run([add()]);
    const booked = counts();
    expect(run([deletion()], true).counts.deleted).toBe(1);
    expect(counts()).toEqual(booked);
    expect(balances()).toEqual({ cash: 87900, depot: 0 });
  });

  it('skips unknown, closed and invalid entries and rolls back a failed transfer after creating its trade', () => {
    accounts.create(
      db,
      {
        id: 'foreign',
        name: 'Synthetic Foreign',
        type: 'checking',
        role: 'investment',
        currency: 'USD',
        onBudget: false,
        openingDate: '2023-10-01',
      },
      ctx,
    );
    db.update(account).set({ referenceAccountId: 'foreign' }).where(eq(account.id, 'depot')).run();
    expect(
      run([
        add({
          account: 'Synthetic Foreign',
          tradeKind: 'reward',
          feeCents: 0,
          cashAccount: undefined,
        }),
      ]).outcomes[0]!.reason,
    ).toBe('invalid_currency');
    const before = counts();
    const result = run([
      add({ id: 'unknown', security: 'Missing', importKey: 'synthetic:unknown' }),
      add({ id: 'units', units: '-1', importKey: 'synthetic:units' }),
      add({
        id: 'refused',
        taxCents: 1,
        cashAccount: 'Synthetic Foreign',
        importKey: 'synthetic:refused',
      }),
      add({ id: 'transfer', cashAccount: 'Synthetic Foreign', importKey: 'synthetic:transfer' }),
      add({
        id: 'good',
        tradeKind: 'delivery_in',
        cashAccount: undefined,
        feeCents: 0,
        importKey: 'synthetic:good',
      }),
    ]);
    expect(result.outcomes.map((o) => o.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'added',
    ]);
    expect(result.outcomes.slice(0, 3).map((o) => o.reason)).toEqual([
      'unknown_security',
      'unitsRuleViolation',
      'refused_by_rules',
    ]);
    expect(listTrades(db)).toHaveLength(1);
    expect(db.select().from(transfer).all()).toEqual([]);
    expect(counts()[1]).toBe(before[1]);
    db.update(account).set({ closedAt: '2026-03-01' }).where(eq(account.id, 'depot')).run();
    const closed = counts();
    expect(run([add()]).outcomes[0]!.reason).toBe('closed_account');
    expect(run([deletion()]).outcomes[0]!.reason).toBe('closed_account');
    expect(counts()).toEqual(closed);
  });

  it('refuses ambiguous deletes and import-key collisions without changing data', () => {
    run([add(), add({ id: 'other', importKey: 'synthetic:other' })]);
    const before = counts();
    expect(run([deletion()]).outcomes[0]!.reason).toBe('ambiguous');
    expect(run([deletion('sell')]).outcomes[0]!.reason).toBe('not_found');
    expect(run([add({ amountCents: 1 })]).outcomes[0]!.reason).toBe('conflict');
    expect(counts()).toEqual(before);
  });

  it('a locked cash-transfer delete rolls back its entire entry', () => {
    run([add()]);
    db.update(booking).set({ status: 'reconciled' }).where(eq(booking.accountId, 'cash')).run();
    const before = counts();
    expect(run([deletion()]).outcomes[0]!.reason).toBe('reconciled_locked');
    expect(counts()).toEqual(before);
    expect(balances()).toEqual({ cash: 87900, depot: 0 });
    expect(listTrades(db)).toHaveLength(1);
  });

  it.each([
    { unexpected: [], trades: [] },
    { trades: [add(), add()] },
    { trades: [add({ units: '1.000000001' })] },
    { trades: [add({ units: '1e-8' })] },
    { trades: [add({ units: '90071993' })] },
    { trades: [add({ units: 1 })] },
    { trades: [add({ feeCents: null })] },
    { trades: [add({ taxCents: null })] },
    { trades: [add({ amountCents: 0 })] },
    { trades: [add({ amountCents: 0.5 })] },
    { trades: [add({ amountCents: -1 })] },
    { trades: [add({ date: '2026-02-30' })] },
    { trades: [add({ importKey: undefined })] },
    { trades: [add({ security: undefined })] },
    { trades: [add({ isin: 'XX0000000001' })] },
    { trades: [add({ extra: 1 })] },
    { trades: [deletion('buy', { extra: 1 })] },
    { trades: [add({ tradeKind: 'reward' })] },
    { trades: [add(), add({ id: 'malformed', units: '0.000000001' })] },
  ])('strictly rejects the entire malformed file %j before writes', (json) => {
    const before = counts();
    expect(() => applyOwnerTrades(db, parseOwnerTradesFile(json), ctx)).toThrow();
    expect(counts()).toEqual(before);
  });
});
