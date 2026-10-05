import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import type { SourceAmount, SourceOperation } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { auditLog, booking, bookingSplit, inboxItem, price, trade, transfer } from '../schema';
import { accounts } from './entities';
import { createBooking, createTransfer, updateBooking } from './bookings';
import { createSecurity } from './securities';
import { mapReadSource } from './read-source';
import { applySourceRebuild } from './operator-source-rebuild';
import { createTrade, listTrades, tradeCashTransferInput } from './trades';
import { undoAuditGroups } from './operator-ops';
import { accountSummaries } from './ledger-queries';
import { applyOwnerTrades, parseOwnerTradesFile } from './operator-owner-trades';

const ctx = { actor: 'operator' };
let opened: OpenedDatabase, db: OpenedDatabase['db'];
const options = {
  depot: 'Synthetic Depot',
  cash: 'Synthetic Cash',
  since: '2026-03-01',
  today: '2026-04-30',
};
const asset = (id: string, value: string): SourceAmount => ({
  assetId: id,
  currencyId: null,
  value,
  cents: null,
});
const eur = (cents: number): SourceAmount => ({
  assetId: null,
  currencyId: 'eur',
  value: (cents / 100).toFixed(2),
  cents,
});
const leg = (
  id: string,
  day: string,
  amount: SourceAmount,
  flow = 'INCOMING',
  patch: Partial<SourceOperation['transactions'][number]> = {},
): SourceOperation['transactions'][number] => ({
  id,
  type: 'movement',
  walletId: amount.assetId ?? 'eur',
  flow,
  creditedAt: `${day}T12:00:00Z`,
  amount,
  fee: null,
  balanceAfter: null,
  tradeId: null,
  tradeFee: null,
  compensates: null,
  ...patch,
});
function stage(id: string, type: string, transactions: SourceOperation['transactions']) {
  db.insert(inboxItem)
    .values({
      id,
      kind: 'import',
      title: 'Synthetic source',
      refType: 'read_source',
      detail: JSON.stringify({ id, type, transactions }),
    })
    .run();
}
function sourceTrade(
  id: string,
  day: string,
  coin: string,
  units: string,
  cents: number,
  sell = false,
  extra: SourceOperation['transactions'] = [],
) {
  stage(id, sell ? 'sell' : 'buy', [
    leg(`${id}-asset`, day, asset(coin, units), sell ? 'OUTGOING' : 'INCOMING', { tradeId: id }),
    leg(`${id}-cash`, day, eur(cents), sell ? 'INCOMING' : 'OUTGOING', { tradeId: id }),
    ...extra,
  ]);
}
const liveState = () => ({
  trades: db.select().from(trade).where(isNull(trade.deletedAt)).all(),
  bookings: db.select().from(booking).where(isNull(booking.deletedAt)).all(),
  balances: accountSummaries(db, options.today).map((a) => [a.id, a.balanceCents]),
});
const rowCounts = () =>
  [auditLog, booking, bookingSplit, trade, transfer].map(
    (table) => db.select().from(table).all().length,
  );
beforeEach(() => {
  opened = createTestDatabase();
  db = opened.db;
  for (const id of ['cash', 'bank'])
    accounts.create(
      db,
      {
        id,
        name: id === 'cash' ? 'Synthetic Cash' : 'Synthetic Bank',
        type: 'checking',
        role: 'investment',
        onBudget: false,
        openingDate: '2026-02-01',
        openingBalanceCents: id === 'cash' ? 100000 : 0,
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
      referenceAccountId: 'cash',
      openingDate: '2026-02-01',
    },
    ctx,
  );
  for (const id of ['a', 'b']) {
    createSecurity(db, { id, name: `Synthetic Coin ${id}`, kind: 'crypto' }, ctx);
    mapReadSource(db, { key: `asset:${id}`, accountId: 'depot', securityId: id }, ctx, {
      allowUnseen: true,
    });
    for (const date of ['2026-02-28', '2026-03-03', '2026-03-08', '2026-03-12', '2026-03-20'])
      db.insert(price)
        .values({
          securityId: id,
          date,
          priceMicro: id === 'a' ? 100000000 : 50000000,
          currency: 'EUR',
          source: 'manual',
        })
        .run();
  }
  mapReadSource(db, { key: 'currency:eur', accountId: 'cash', securityId: null }, ctx, {
    allowUnseen: true,
  });
  stage('opening', 'deposit', [
    leg('oa', '2026-02-28', asset('a', '5'), 'INCOMING', { balanceAfter: asset('a', '5') }),
    leg('ob', '2026-02-28', asset('b', '2'), 'INCOMING', { balanceAfter: asset('b', '2') }),
    leg('oe', '2026-02-28', eur(100000), 'INCOMING', { balanceAfter: eur(100000) }),
  ]);
  stage('deposit-1', 'deposit', [leg('dep1', '2026-03-01', eur(10000))]);
  stage('deposit-2', 'deposit', [leg('dep2', '2026-03-02', eur(20000))]);
  createTransfer(
    db,
    { fromAccountId: 'bank', toAccountId: 'cash', date: '2026-03-10', amountCents: 30000 },
    ctx,
  );
  sourceTrade('buy-a', '2026-03-03', 'a', '2', 20000, false, [
    leg('asset-fee', '2026-03-03', asset('a', '0.1'), 'OUTGOING', {
      type: 'fee',
      tradeId: 'buy-a',
    }),
    leg('cash-fee', '2026-03-03', eur(100), 'OUTGOING', { type: 'fee', tradeId: 'buy-a' }),
  ]);
  sourceTrade('sell-a', '2026-03-05', 'a', '1', 10000, true, [
    leg('sale-unit-fee', '2026-03-05', asset('a', '0.01'), 'OUTGOING', {
      type: 'fee',
      tradeId: 'sell-a',
    }),
    leg('sale-fee', '2026-03-05', eur(100), 'OUTGOING', { type: 'fee', tradeId: 'sell-a' }),
    leg('sale-tax', '2026-03-05', eur(200), 'OUTGOING', { type: 'tax', tradeId: 'sell-a' }),
  ]);
  stage('swap', 'swap', [
    leg('swap-out', '2026-03-08', asset('a', '1'), 'OUTGOING', { tradeId: 'swap' }),
    leg('swap-in', '2026-03-08', asset('b', '2'), 'INCOMING', { tradeId: 'swap' }),
  ]);
  stage('reward-1', 'reward', [leg('r1', '2026-03-12', asset('a', '0.00000001'))]);
  stage('reward-2', 'passive_earn_reward', [leg('r2', '2026-03-20', asset('a', '0.12345678'))]);
  stage('reward-unpriced', 'reward', [leg('ru', '2026-04-02', asset('b', '0.1'))]);
  sourceTrade('owner-buy', '2026-03-15', 'b', '1', 5000);
  stage('interest', 'earn_on_fiat_reward', [leg('int', '2026-03-17', eur(50))]);
  sourceTrade('unmapped', '2026-04-04', 'x', '0.5', 2000);
  const ownerInput = {
    accountId: 'depot',
    securityId: 'b',
    date: '2026-03-15',
    kind: 'buy' as const,
    unitsE8: 100000000,
    amountCents: 5000,
    importKey: 'owner:buy',
    source: 'import' as const,
  };
  createTrade(db, ownerInput, ctx);
  createTransfer(db, tradeCashTransferInput(ownerInput, 'cash')!, ctx);
  const pp = {
    accountId: 'depot',
    securityId: 'a',
    date: '2026-03-04',
    kind: 'buy' as const,
    unitsE8: 400000000,
    amountCents: 40000,
    importKey: 'pp:old',
    source: 'import' as const,
  };
  createTrade(db, pp, ctx);
  createTransfer(db, tradeCashTransferInput(pp, 'cash')!, ctx);
  createBooking(
    db,
    {
      accountId: 'cash',
      date: '2026-03-01',
      amountCents: 777,
      source: 'import',
      importKey: 'pp:cash-target:cash:2026-03-01',
      splits: [{ amountCents: 777 }],
    },
    ctx,
  );
});
afterEach(() => opened.close());

it('rebuilds exact month ends, openings, monthly rewards, swap, fees/tax, preserved owner trade and cash course; idempotent, dry-run and undo', () => {
  const before = liveState(),
    counts = rowCounts();
  const dry = applySourceRebuild(db, { ...options, dryRun: true }, ctx);
  expect(dry.groupId).toBe('');
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const result = applySourceRebuild(db, options, ctx);
  expect(result.outcomes.filter((o) => o.status === 'skipped')).toEqual([]);
  expect(result.units.every((u) => u.differenceE8 === 0)).toBe(true);
  expect(result.units.filter((u) => u.date === '2026-04-30')).toEqual([
    {
      date: '2026-04-30',
      securityId: 'a',
      appUnitsE8: 501345679,
      sourceUnitsE8: 501345679,
      differenceE8: 0,
    },
    {
      date: '2026-04-30',
      securityId: 'b',
      appUnitsE8: 510000000,
      sourceUnitsE8: 510000000,
      differenceE8: 0,
    },
  ]);
  expect(result.cashEnd).toEqual({
    date: '2026-04-30',
    appCents: 114650,
    sourceCents: 112650,
    differenceCents: 2000,
  });
  expect(result.cash.filter((r) => r.date >= '2026-03-10' && r.date < '2026-04-04')).toEqual([]);
  expect(result.openingCash).toMatchObject({
    appCents: 100000,
    sourceCents: 100000,
    differenceCents: 0,
  });
  expect(result.aggregatedCashMatches).toHaveLength(1);
  expect(result.fiatMovements.map((r) => r.cashStatus)).toEqual([
    'matched_by_sum',
    'matched_by_sum',
  ]);
  expect(result.fiatMovements.map((r) => r.verdict)).toEqual([
    { status: 'missing' },
    { status: 'missing' },
  ]);
  expect(result.unmapped).toEqual([{ key: 'asset:x', legs: 1, fiatEffectCents: -2000 }]);
  expect(result.removedRows).toEqual({ trades: 1, bookings: 4 });
  const trades = listTrades(db);
  expect(trades.find((t) => t.importKey === 'rebuild:buy-a:0')).toMatchObject({
    kind: 'buy',
    unitsE8: 190000000,
    amountCents: 20000,
    feeCents: 100,
  });
  expect(trades.find((t) => t.importKey === 'rebuild:sell-a:0')).toMatchObject({
    kind: 'sell',
    unitsE8: -101000000,
    amountCents: 10000,
    feeCents: 100,
    taxCents: 200,
  });
  expect(
    trades.filter((t) => t.importKey?.startsWith('rebuild:swap:')).map((t) => t.amountCents),
  ).toEqual([10000, 10000]);
  expect(trades.find((t) => t.importKey === 'rebuild:reward:2026-03:a:buy')).toMatchObject({
    unitsE8: 12345679,
    amountCents: 1235,
    date: '2026-03-20',
    note: '2 source rewards (2026-03)',
  });
  expect(trades.find((t) => t.importKey === 'rebuild:reward:2026-04:b:unpriced')).toMatchObject({
    kind: 'delivery_in',
    amountCents: 0,
  });
  expect(trades.filter((t) => t.securityId === 'b' && t.date === '2026-03-15')).toHaveLength(1);
  expect(
    result.outcomes.some((o) => o.id === 'rebuild:owner-buy:0' && o.status === 'matched'),
  ).toBe(true);
  expect(trades.filter((t) => t.importKey?.startsWith('rebuild:opening:'))).toHaveLength(2);
  const rebuilt = liveState(),
    afterCounts = rowCounts();
  const second = applySourceRebuild(db, options, ctx);
  expect(second.groupId).toBe('');
  expect(second.counts['created'] ?? 0).toBe(0);
  expect(second.counts['removed'] ?? 0).toBe(0);
  expect(liveState()).toEqual(rebuilt);
  expect(rowCounts()).toEqual(afterCounts);
  undoAuditGroups(db, [result.groupId], ctx);
  // Undo retains audited soft-deleted new rows; every previously live row is restored exactly.
  const restored = liveState();
  const withoutUpdatedAt = (row: { updatedAt: string }) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updatedAt'));
  expect(restored.trades.map(withoutUpdatedAt)).toEqual(before.trades.map(withoutUpdatedAt));
  expect(restored.bookings.map(withoutUpdatedAt)).toEqual(before.bookings.map(withoutUpdatedAt));
  expect(restored.balances).toEqual(before.balances);
});

it('skips the complete reconciled PP trade/transfer unit without unlock and unlocks atomically when requested', () => {
  const pp = listTrades(db).find((t) => t.importKey === 'pp:old')!;
  updateBooking(db, pp.bookingId!, { status: 'reconciled' }, ctx);
  const cashLeg = db
    .select()
    .from(booking)
    .where(eq(booking.importKey, 'pp:old:cash'))
    .all()
    .find((b) => b.accountId === 'cash')!;
  updateBooking(db, cashLeg.id, { status: 'reconciled' }, ctx);
  const result = applySourceRebuild(db, options, ctx);
  expect(result.outcomes.find((o) => o.id === 'pp:old')).toMatchObject({
    status: 'skipped',
    reason: 'reconciled_locked',
  });
  expect(listTrades(db).some((t) => t.id === pp.id)).toBe(true);
  expect(db.select().from(booking).where(eq(booking.id, cashLeg.id)).get()?.deletedAt).toBeNull();
  const unlocked = applySourceRebuild(db, { ...options, unlock: true }, ctx);
  expect(unlocked.outcomes.find((o) => o.id === 'pp:old')?.status).toBe('removed');
  expect(unlocked.units.every((u) => u.differenceE8 === 0)).toBe(true);
});

it('rejects corrupt staged JSON before writes and reports the exact opening cash correction', () => {
  db.insert(inboxItem)
    .values({
      id: 'broken',
      kind: 'import',
      title: 'Synthetic invalid source',
      refType: 'read_source',
      detail: '{}',
    })
    .run();
  const before = rowCounts();
  expect(() => applySourceRebuild(db, options, ctx)).toThrow();
  expect(rowCounts()).toEqual(before);
  db.delete(inboxItem).where(eq(inboxItem.id, 'broken')).run();
  accounts.update(db, 'cash', { openingBalanceCents: 99000 }, ctx);
  const result = applySourceRebuild(db, options, ctx);
  expect(result.openingCash).toMatchObject({
    differenceCents: 1000,
    currentOpeningBalanceCents: 99000,
    proposedOpeningBalanceCents: 100000,
  });
  expect(accountSummaries(db, '2026-02-28').find((a) => a.id === 'cash')?.balanceCents).toBe(99000);
  accounts.update(db, 'cash', { openingDate: options.since }, ctx);
  const laterOpening = applySourceRebuild(db, options, ctx);
  expect(laterOpening.openingCash).toMatchObject({
    appCents: 0,
    differenceCents: 100000,
    proposedOpeningBalanceCents: null,
    proposedOpeningDate: '2026-02-28',
  });
});

it('matches an individual owner reward before monthly aggregation, including exact one-e8 units', () => {
  applyOwnerTrades(
    db,
    parseOwnerTradesFile({
      trades: [
        {
          id: 'owner-reward',
          kind: 'add',
          account: options.depot,
          security: 'Synthetic Coin a',
          date: '2026-03-20',
          tradeKind: 'reward',
          units: '0.12345678',
          amountCents: 1235,
          importKey: 'owner:reward',
        },
      ],
    }),
    ctx,
  );
  const result = applySourceRebuild(db, options, ctx);
  expect(result.units.every((r) => r.differenceE8 === 0)).toBe(true);
  expect(result.outcomes.some((r) => r.id === 'reward-2:r2' && r.status === 'matched')).toBe(true);
  expect(listTrades(db).find((t) => t.importKey === 'rebuild:reward:2026-03:a:buy')).toMatchObject({
    unitsE8: 1,
    amountCents: 0,
    date: '2026-03-12',
  });
  const counts = rowCounts();
  applySourceRebuild(db, options, ctx);
  expect(rowCounts()).toEqual(counts);
});

it('reports an unmapped high-precision asset and its inline fiat fee without blocking mapped history', () => {
  const row = db.select().from(inboxItem).where(eq(inboxItem.id, 'unmapped')).get()!;
  const op = JSON.parse(row.detail!) as SourceOperation;
  op.transactions[0]!.amount.value = '0.000000001';
  op.transactions[0]!.fee = eur(1);
  db.update(inboxItem)
    .set({ detail: JSON.stringify(op) })
    .where(eq(inboxItem.id, row.id))
    .run();
  const result = applySourceRebuild(db, options, ctx);
  expect(result.outcomes.filter((o) => o.status === 'skipped')).toEqual([]);
  expect(result.units.every((u) => u.differenceE8 === 0)).toBe(true);
  expect(result.unmapped).toEqual([{ key: 'asset:x', legs: 1, fiatEffectCents: -2001 }]);
  expect(result.cashEnd).toMatchObject({ sourceCents: 112649, differenceCents: 2001 });
});

it('keeps a stale reward pair atomic when one settlement is locked, then removes both with unlock', () => {
  applySourceRebuild(db, options, ctx);
  const pair = listTrades(db).filter((t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:'));
  const buy = pair.find((t) => t.kind === 'buy')!;
  updateBooking(db, buy.bookingId!, { status: 'reconciled' }, ctx);
  db.delete(inboxItem).where(eq(inboxItem.id, 'reward-1')).run();
  db.delete(inboxItem).where(eq(inboxItem.id, 'reward-2')).run();
  const locked = applySourceRebuild(db, options, ctx);
  expect(locked.outcomes.some((o) => o.reason === 'reconciled_locked')).toBe(true);
  expect(listTrades(db).filter((t) => pair.some((r) => r.id === t.id))).toHaveLength(2);
  const unlocked = applySourceRebuild(db, { ...options, unlock: true }, ctx);
  expect(listTrades(db).filter((t) => pair.some((r) => r.id === t.id))).toHaveLength(0);
  expect(unlocked.units.every((r) => r.differenceE8 === 0)).toBe(true);
});
