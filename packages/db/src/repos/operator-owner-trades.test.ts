import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, auditLog, booking, bookingSplit, INCOME_TYPES, price, transfer } from '../schema';
import { accounts } from './entities';
import { accountSummaries } from './ledger-queries';
import { applyOwnerTrades, parseOwnerTradesFile } from './operator-owner-trades';
import { undoAuditGroups } from './operator-ops';
import { costsTaxesReport } from './portfolio-costs';
import { portfolioSummary } from './portfolio-summary';
import { portfolioFlows } from './portfolio';
import { createSecurity } from './securities';
import { listTrades } from './trades';

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
  importKey: 'synthetic:buy',
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
  it('adds an exact buy and PP-style transfer pair, repeats unchanged, deletes and undoes both runs', () => {
    const result = run([add({ account: 'synthetic depot' })]);
    expect(result.counts).toEqual({ added: 1, unchanged: 0, deleted: 0, skipped: 0 });
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
      .filter((b) => b.importKey === 'synthetic:buy:cash');
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
    expect(run([add()]).outcomes[0]!.status).toBe('unchanged');
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
  });

  it('settles sell, dividend, interest, delivery and tax under one undoable group', () => {
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
        importKey: 'synthetic:div',
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
        id: 'tax',
        tradeKind: 'tax',
        units: '0',
        amountCents: 90,
        feeCents: 0,
        cashAccount: undefined,
        importKey: 'synthetic:tax',
      }),
    ]);
    expect(result.counts.added).toBe(5);
    expect(new Set(result.outcomes.map((o) => o.groupId)).size).toBe(1);
    expect(balances()).toEqual({ cash: 106450, depot: -90 });
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
    const deleted = run([deletion('reward', { units: '0.25', amountCents: 500 })]);
    expect(deleted.outcomes[0]!.status).toBe('deleted');
    expect(listTrades(db)).toEqual([]);
    expect(balances()).toEqual({ cash: 100000, depot: 0 });
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
    run([
      add({
        tradeKind: 'dividend',
        units: '0',
        feeCents: 0,
        cashAccount: undefined,
        importKey: 'synthetic:reward:div',
      }),
    ]);
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
      add({ id: 'unknown', security: 'Missing' }),
      add({ id: 'units', units: '-1' }),
      add({ id: 'refused', taxCents: 1, cashAccount: undefined }),
      add({ id: 'transfer', cashAccount: 'Synthetic Foreign' }),
      add({ id: 'good', cashAccount: undefined }),
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
    expect(counts()[1]).toBe(before[1]! + 1);
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
