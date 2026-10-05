import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq, isNull } from 'drizzle-orm';
import type { SourceAmount, SourceOperation } from '@budget/domain';
import { createTestDatabase, type OpenedDatabase } from '../client';
import {
  auditLog,
  booking,
  bookingSplit,
  inboxItem,
  price,
  trade,
  transfer,
  fxRate,
} from '../schema';
import { accounts } from './entities';
import { createBooking, createTransfer, updateBooking } from './bookings';
import { createSecurity } from './securities';
import { mapReadSource } from './read-source';
import { saveReadSourceState } from './read-source';
import { applySourceRebuild } from './operator-source-rebuild';
import { createTrade, deleteTrade, listTrades, tradeCashTransferInput } from './trades';
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
  expect(
    trades.find(
      (t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:source:') && t.kind === 'buy',
    ),
  ).toMatchObject({
    unitsE8: 12345679,
    amountCents: 1235,
    date: '2026-03-20',
    note: '2 source rewards (2026-03)',
  });
  expect(
    trades.find((t) => t.importKey?.startsWith('rebuild:reward:2026-04:b:unpriced:source:')),
  ).toMatchObject({
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
  expect(
    listTrades(db).find(
      (t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:source:') && t.kind === 'buy',
    ),
  ).toMatchObject({
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

it('does not create a new reward aggregate when a locked previous source-key pair cannot be removed', () => {
  applySourceRebuild(db, options, ctx);
  const pair = listTrades(db).filter((t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:'));
  const buy = pair.find((t) => t.kind === 'buy')!;
  updateBooking(db, buy.bookingId!, { status: 'reconciled' }, ctx);
  stage('reward-extra', 'reward', [leg('extra-reward-leg', '2026-03-20', asset('a', '0.2'))]);
  const locked = applySourceRebuild(db, options, ctx);
  expect(locked.outcomes.some((o) => o.reason === 'stale_rebuild_group_not_removed')).toBe(true);
  expect(
    listTrades(db).filter((t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:')),
  ).toEqual(pair);
  expect(
    locked.units.find((r) => r.securityId === 'a' && r.date === options.today)?.differenceE8,
  ).toBe(-20000000);
  const unlocked = applySourceRebuild(db, { ...options, unlock: true }, ctx);
  expect(unlocked.units.every((r) => r.differenceE8 === 0)).toBe(true);
});

it('reconciles a combined fiat swap, discount fee wallets, merger, staking and USD buy; dry-run, idempotency and undo', () => {
  db.delete(inboxItem).where(eq(inboxItem.id, 'unmapped')).run();
  stage('discount-swap', 'earn_on_fiat_swap', [
    leg('ds-out', '2026-03-21', asset('a', '0.5'), 'OUTGOING', { tradeId: 'ds-sell' }),
    leg('ds-sell-cash', '2026-03-21', eur(5000), 'INCOMING', { tradeId: 'ds-sell' }),
    leg('ds-in', '2026-03-21', asset('b', '1'), 'INCOMING', { tradeId: 'ds-buy' }),
    leg('ds-buy-cash', '2026-03-21', eur(5000), 'OUTGOING', { tradeId: 'ds-buy' }),
    leg('ds-fee-1', '2026-03-21', asset('b', '0.1'), 'OUTGOING', {
      type: 'fee',
      tradeId: 'ds-sell',
      walletId: 'discount-wallet',
    }),
    leg('ds-fee-2', '2026-03-21', asset('b', '0.1'), 'OUTGOING', {
      type: 'fee',
      tradeId: 'ds-buy',
      walletId: 'discount-wallet',
    }),
  ]);
  stage('merger', 'merger_crypto', [
    leg('migration-out', '2026-03-22', asset('a', '0.5'), 'OUTGOING'),
    leg('migration-in', '2026-03-22', asset('b', '1')),
  ]);
  stage('stake', 'stake', [leg('staking-out', '2026-03-23', asset('a', '1'), 'OUTGOING')]);
  stage('unstake', 'unstake', [leg('staking-in', '2026-04-03', asset('a', '0.5'))]);
  const usd = (cents: number) => ({ ...eur(cents), currencyId: 'foreign-id' });
  stage('usd-buy', 'earn_on_fiat_buy', [
    leg('usd-a', '2026-04-05', asset('a', '1'), 'INCOMING', { tradeId: 'usd' }),
    leg('usd-cash', '2026-04-05', usd(12500), 'OUTGOING', { tradeId: 'usd' }),
  ]);
  stage('usd-interest', 'earn_on_fiat_reward', [leg('usd-interest-cash', '2026-04-05', usd(125))]);
  saveReadSourceState(
    db,
    {
      lastSuccess: null,
      lastAttempt: null,
      status: 'idle',
      window: null,
      balances: [{ key: 'currency:foreign-id', amount: usd(0), currency: 'USD' }],
    },
    ctx,
  );
  db.insert(fxRate)
    .values({ currency: 'USD', date: '2026-04-05', rateMicro: 800000, source: 'ecb' })
    .run();
  const opts = { ...options, stakedNow: ['Synthetic Coin a=1.5', 'Synthetic Coin b=0'] };
  const before = liveState(),
    counts = rowCounts();
  const dry = applySourceRebuild(db, { ...opts, dryRun: true }, ctx);
  expect(dry.units.every((u) => u.differenceE8 === 0)).toBe(true);
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const result = applySourceRebuild(db, opts, ctx);
  expect(result.outcomes.filter((o) => o.status === 'skipped')).toEqual([]);
  expect(result.units.every((u) => u.differenceE8 === 0)).toBe(true);
  expect(result.staked).toEqual([
    { securityId: 'a', key: 'asset:a', openingUnitsE8: 100000000, todayUnitsE8: 150000000 },
    { securityId: 'b', key: 'asset:b', openingUnitsE8: 0, todayUnitsE8: 0 },
  ]);
  expect(
    result.units.filter((u) => u.date === options.today).map((u) => [u.securityId, u.appUnitsE8]),
  ).toEqual([
    ['a', 601345679],
    ['b', 690000000],
  ]);
  expect(result.cash.every((row) => row.date < '2026-03-10')).toBe(true);
  expect(result.cashEnd).toMatchObject({
    appCents: 114750,
    sourceCents: 114750,
    differenceCents: 0,
  });
  expect(result.fx_converted.map((r) => [r.currency, r.originalAmount, r.fromRateMicro])).toEqual([
    ['USD', '125.00', 800000],
    ['USD', '1.25', 800000],
  ]);
  const rebuilt = liveState(),
    rebuiltCounts = rowCounts();
  expect(applySourceRebuild(db, opts, ctx).groupId).toBe('');
  expect(liveState()).toEqual(rebuilt);
  expect(rowCounts()).toEqual(rebuiltCounts);
  undoAuditGroups(db, [result.groupId], ctx);
  expect(liveState().balances).toEqual(before.balances);
});

it('diagnoses unhandled source unit movements by type and reports their operation IDs', () => {
  stage('unknown', 'synthetic_unknown', [
    leg('unknown-out', '2026-03-25', asset('a', '0.25'), 'OUTGOING'),
  ]);
  const result = applySourceRebuild(db, options, ctx);
  expect(result.unhandledOperations).toEqual([{ id: 'unknown', type: 'synthetic_unknown' }]);
  const row = result.units.find((u) => u.securityId === 'a' && u.date === options.today)!;
  expect(row.differenceE8).toBe(25000000);
  expect(row.byType).toContainEqual({
    type: 'synthetic_unknown',
    sourceUnitsE8: -25000000,
    createdUnitsE8: 0,
    differenceE8: 25000000,
  });
  expect(row.byType!.reduce((sum, r) => sum + r.sourceUnitsE8, 0)).toBe(row.sourceUnitsE8);
  expect(row.byType!.reduce((sum, r) => sum + r.createdUnitsE8, 0)).toBe(row.appUnitsE8);
});

it('refuses invalid or unmapped staking declarations before any ledger writes', () => {
  const counts = rowCounts();
  expect(() => applySourceRebuild(db, { ...options, stakedNow: ['Missing Coin=1'] }, ctx)).toThrow(
    'mapped security',
  );
  expect(() =>
    applySourceRebuild(db, { ...options, stakedNow: ['Synthetic Coin a=-1'] }, ctx),
  ).toThrow();
  expect(rowCounts()).toEqual(counts);
});

it('reconciles two single-leg stakes, rewards and an incomplete unstake with private monthly trace; dry-run, repeat and undo', () => {
  db.delete(inboxItem).run(); // This isolated synthetic staging has no owner/provider data.
  sourceTrade('owner-buy', '2026-03-15', 'b', '1', 5000);
  stage('opening', 'deposit', [
    leg('main-opening', '2026-02-28', asset('a', '10'), 'INCOMING', {
      balanceAfter: asset('a', '10'),
    }),
    leg('cash-opening', '2026-02-28', eur(100000), 'INCOMING', { balanceAfter: eur(100000) }),
  ]);
  stage('stake-out', 'stake', [
    leg('main-stake-out', '2026-03-03', asset('a', '10'), 'OUTGOING', {
      balanceAfter: asset('a', '0'),
    }),
  ]);
  stage('stake-in', 'stake', [
    leg('staking-stake-in', '2026-03-03', asset('a', '10'), 'INCOMING', {
      walletId: 'staking',
      balanceAfter: asset('a', '10'),
    }),
  ]);
  stage('staking-reward', 'reward', [
    leg('staking-reward-leg', '2026-03-12', asset('a', '0.5'), 'INCOMING', {
      walletId: 'staking',
      balanceAfter: asset('a', '10.5'),
    }),
  ]);
  stage('unstake', 'unstake', [
    leg('main-unstake-in', '2026-04-03', asset('a', '10.5'), 'INCOMING', {
      balanceAfter: asset('a', '10.5'),
    }),
  ]);
  const opts = { ...options, trace: ['Synthetic Coin a', 'Synthetic Coin b'] };
  const before = liveState(),
    counts = rowCounts();
  const dry = applySourceRebuild(db, { ...opts, dryRun: true }, ctx);
  expect(dry.units.every((r) => r.differenceE8 === 0)).toBe(true);
  expect(dry.staked).toEqual([]);
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const report = applySourceRebuild(db, opts, ctx);
  expect(
    report.units
      .filter((r) => r.securityId === 'a')
      .map((r) => [r.date, r.sourceUnitsE8, r.differenceE8]),
  ).toEqual([
    ['2026-02-28', 1000000000, 0],
    ['2026-03-31', 1050000000, 0],
    ['2026-04-30', 1050000000, 0],
  ]);
  expect(report.issues).toEqual([]);
  const trace = report.trace.filter((r) => r.securityId === 'a');
  expect(trace[1]!.wallets.map((w) => [w.walletId, w.units, w.snapshotLeg?.id])).toEqual([
    ['a', 0, 'main-stake-out'],
    ['staking', 1050000000, 'staking-reward-leg'],
  ]);
  expect(trace[2]!.wallets.find((w) => w.walletId === 'staking')).toMatchObject({
    units: 0,
    correctionLeg: { id: 'main-unstake-in' },
  });
  expect(trace.flatMap((r) => r.legs).map((r) => r.operationId)).toEqual([
    'opening',
    'stake-out',
    'stake-in',
    'staking-reward',
    'unstake',
  ]);
  expect(trace[2]!.legs[0]).toMatchObject({ sourceUnitsE8: 1050000000, appUnitsE8: 1050000000 });
  expect(trace[1]!.trades.find((t) => t.kind === 'buy')).toMatchObject({
    unitsE8: 50000000,
    amountCents: 5000,
    appUnitsE8: 1050000000,
    sourceUnitsE8: 1050000000,
  });
  expect(trace[1]!.trades.every((t) => t.importKey?.includes('staking-reward'))).toBe(true);
  const override = applySourceRebuild(
    db,
    { ...opts, dryRun: true, stakedNow: ['Synthetic Coin a=0'] },
    ctx,
  );
  expect(override.units).toEqual(report.units);
  const rebuilt = liveState(),
    rebuiltCounts = rowCounts();
  expect(applySourceRebuild(db, opts, ctx).groupId).toBe('');
  expect(liveState()).toEqual(rebuilt);
  expect(rowCounts()).toEqual(rebuiltCounts);
  undoAuditGroups(db, [report.groupId], ctx);
  expect(liveState()).toEqual(before);
});

it('books unexplained expiry as a split with source IDs, dry-run, repeat and undo', () => {
  createTrade(
    db,
    {
      accountId: 'depot',
      securityId: 'b',
      date: options.today,
      kind: 'delivery_in',
      unitsE8: 200000000,
      amountCents: 0,
    },
    ctx,
  );
  stage('expiry', 'leverage_liquidation', [
    leg('expiry-leg', '2026-04-03', asset('b', '1'), 'OUTGOING', { balanceAfter: asset('b', '0') }),
    leg('expiry-cash', '2026-04-03', eur(100)),
  ]);
  sourceTrade('discount-buy', '2026-03-20', 'a', '1', 10000, false, [
    leg('discount-fee', '2026-03-20', asset('b', '0.2'), 'OUTGOING', {
      type: 'fee',
      tradeId: 'discount-buy',
    }),
  ]);
  const before = liveState(),
    counts = rowCounts();
  const opts = { ...options, trace: ['Synthetic Coin a', 'Synthetic Coin b'] };
  const report = applySourceRebuild(db, { ...opts, dryRun: true }, ctx);
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  expect(report.issues).toContainEqual({
    id: 'expiry',
    reason: 'split_from_balance',
    key: 'asset:b',
    date: '2026-04-03',
    unitsE8: -390000000,
    walletId: 'b',
    previousLegId: 'ob',
    legId: 'expiry-leg',
  });
  const trades = report.trace.flatMap((r) => r.trades);
  expect(trades.find((t) => t.importKey === 'rebuild:split:b:2026-04-03')).toMatchObject({
    kind: 'split',
    unitsE8: -390000000,
    amountCents: 0,
  });
  const remaining = report.units.find((r) => r.securityId === 'b' && r.date === options.today)!;
  expect(remaining.differenceE8).toBe(200000000);
  expect(remaining.byType).toContainEqual({
    type: 'split_from_balance',
    sourceUnitsE8: 0,
    createdUnitsE8: -390000000,
    differenceE8: -390000000,
  });
  expect(report.dust.some((t) => t.securityId === 'b')).toBe(false);
  expect(
    trades
      .filter((t) => t.importKey?.includes('rebuild:swap:'))
      .map((t) => t.kind)
      .sort(),
  ).toEqual(['buy', 'sell']);
  expect(trades.find((t) => t.importKey === 'rebuild:discount-buy:2')).toMatchObject({
    kind: 'sell',
    unitsE8: -20000000,
    amountCents: 1000,
    feeCents: 1000,
  });
  expect(() =>
    applySourceRebuild(db, { ...options, trace: ['Unknown synthetic product'] }, ctx),
  ).toThrow('mapped security');
  const written = applySourceRebuild(db, opts, ctx);
  expect(written.units).toEqual(report.units);
  const rebuilt = liveState(),
    rebuiltCounts = rowCounts();
  expect(applySourceRebuild(db, opts, ctx).groupId).toBe('');
  expect(liveState()).toEqual(rebuilt);
  expect(rowCounts()).toEqual(rebuiltCounts);
  undoAuditGroups(db, [written.groupId], ctx);
  expect(liveState()).toEqual(before);
});

it('persists zero-value dust deliveries after rebuilding, with dry-run, repeat and undo', () => {
  stage('synthetic-dust', 'synthetic_unhandled', [
    leg('dust-leg', options.today, asset('a', '0.00009')),
  ]);
  createTrade(
    db,
    {
      accountId: 'depot',
      securityId: 'b',
      date: options.today,
      kind: 'delivery_in',
      unitsE8: 19000,
      amountCents: 0,
    },
    ctx,
  );
  const before = liveState(),
    counts = rowCounts();
  const dry = applySourceRebuild(db, { ...options, dryRun: true }, ctx);
  expect(
    dry.dust.map((t) => [t.importKey, t.kind, t.unitsE8, t.amountCents, t.date, t.note]),
  ).toEqual([
    ['rebuild:dust:a', 'delivery_in', 9000, 0, options.today, 'Rundungsausgleich Quelle'],
    ['rebuild:dust:b', 'delivery_out', -19000, 0, options.today, 'Rundungsausgleich Quelle'],
  ]);
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const report = applySourceRebuild(db, options, ctx);
  expect(report.dust).toEqual(dry.dust);
  expect(report.units.filter((r) => r.date === options.today).every((r) => !r.differenceE8)).toBe(
    true,
  );
  const rebuilt = liveState(),
    rebuiltCounts = rowCounts();
  expect(applySourceRebuild(db, options, ctx).groupId).toBe('');
  expect(liveState()).toEqual(rebuilt);
  expect(rowCounts()).toEqual(rebuiltCounts);
  undoAuditGroups(db, [report.groupId], ctx);
  expect(liveState()).toEqual(before);
});

it('retains one-cent differences, closes unpriced dust, and respects deleted dust keys', () => {
  applySourceRebuild(db, options, ctx);
  db.delete(price).where(eq(price.securityId, 'b')).run();
  stage('synthetic-boundary', 'synthetic_unhandled', [
    leg('cent-leg', options.today, asset('a', '0.0001')),
    leg('unpriced-leg', options.today, asset('b', '0.00099999')),
  ]);
  const opts = { ...options, since: options.today };
  const report = applySourceRebuild(db, opts, ctx);
  expect(report.dust.map((t) => [t.securityId, t.unitsE8])).toEqual([['b', 99999]]);
  expect(
    report.units.find((r) => r.securityId === 'a' && r.date === options.today)?.differenceE8,
  ).toBe(-10000);
  const dust = listTrades(db).find((t) => t.importKey === 'rebuild:dust:b')!;
  deleteTrade(db, dust.id, ctx);
  const deleted = applySourceRebuild(db, opts, ctx);
  expect(deleted.dust).toEqual([]);
  expect(deleted.outcomes).toContainEqual(
    expect.objectContaining({
      id: 'rebuild:dust:b',
      status: 'skipped',
      reason: expect.stringContaining('rebuild_key_deleted'),
    }),
  );
  expect(
    deleted.units.find((r) => r.securityId === 'b' && r.date === options.today)?.differenceE8,
  ).toBe(-99999);
});

it('refuses a source key colliding with a reserved dust key before ledger writes', () => {
  createSecurity(db, { id: '0', name: 'Synthetic reserved key', kind: 'crypto' }, ctx);
  mapReadSource(db, { key: 'asset:reserved', accountId: 'depot', securityId: '0' }, ctx, {
    allowUnseen: true,
  });
  stage('dust', 'buy', [
    leg('reserved-asset', options.today, asset('reserved', '1')),
    leg('reserved-cash', options.today, eur(100), 'OUTGOING'),
  ]);
  const before = liveState(),
    counts = rowCounts();
  expect(() => applySourceRebuild(db, options, ctx)).toThrow('Source rebuild keys collide');
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
});

it('persists a USD-paid buy at recent EUR asset value without FX; dry-run, repeat and undo', () => {
  const usd = { ...eur(12500), currencyId: 'usd' };
  stage('price-fallback', 'buy', [
    leg('fallback-asset', '2026-03-20', asset('a', '0.5')),
    leg('fallback-usd', '2026-03-20', usd, 'OUTGOING'),
  ]);
  saveReadSourceState(
    db,
    {
      lastSuccess: null,
      lastAttempt: null,
      status: 'idle',
      window: null,
      balances: [
        { key: 'currency:usd', amount: { ...usd, value: '0.00', cents: 0 }, currency: 'USD' },
      ],
    },
    ctx,
  );
  const before = liveState(),
    counts = rowCounts();
  const preview = applySourceRebuild(db, { ...options, dryRun: true }, ctx);
  expect(preview.issues).toContainEqual({
    id: 'price-fallback',
    key: 'currency:usd',
    date: '2026-03-20',
    reason: 'fx_fallback_price',
  });
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const report = applySourceRebuild(db, options, ctx);
  expect(listTrades(db).find((t) => t.importKey === 'rebuild:price-fallback:0')).toMatchObject({
    kind: 'delivery_in',
    unitsE8: 50000000,
    amountCents: 5000,
  });
  expect(report.issues).toContainEqual({ id: 'price-fallback', reason: 'fiat_wallet_not_eur' });
  expect(report.units.every((r) => r.differenceE8 === 0)).toBe(true);
  expect(report.cashEnd).toMatchObject({ sourceCents: 112650, differenceCents: 2000 });
  const rebuiltCounts = rowCounts();
  expect(applySourceRebuild(db, options, ctx).groupId).toBe('');
  expect(rowCounts()).toEqual(rebuiltCounts);
  undoAuditGroups(db, [report.groupId], ctx);
  expect(liveState()).toEqual(before);
});

it('keeps an owner-deleted legacy monthly reward key blocked after adding operation provenance', () => {
  const { trade: old } = createTrade(
    db,
    {
      accountId: 'depot',
      securityId: 'a',
      date: '2026-03-20',
      kind: 'buy',
      unitsE8: 12345679,
      amountCents: 0,
      importKey: 'rebuild:reward:2026-03:a:buy',
    },
    ctx,
  );
  deleteTrade(db, old.id, ctx);
  const result = applySourceRebuild(db, options, ctx);
  expect(
    result.outcomes.some((o) => o.reason === 'rebuild_key_deleted: restore with undo-group first'),
  ).toBe(true);
  expect(
    listTrades(db).filter((t) => t.importKey?.startsWith('rebuild:reward:2026-03:a:')),
  ).toEqual([]);
});

it('rolls back both merger sides and settlements when the second key was deleted by the owner', () => {
  stage('blocked-merger', 'merger_crypto', [
    leg('blocked-out', '2026-03-22', asset('a', '0.5'), 'OUTGOING'),
    leg('blocked-in', '2026-03-22', asset('b', '1')),
  ]);
  const old = createTrade(
    db,
    {
      accountId: 'depot',
      securityId: 'b',
      date: '2026-03-22',
      kind: 'buy',
      unitsE8: 100000000,
      amountCents: 5000,
      importKey: 'rebuild:blocked-merger:merger:in',
      source: 'import',
    },
    ctx,
  );
  deleteTrade(db, old.trade.id, ctx);
  const result = applySourceRebuild(db, options, ctx);
  expect(result.outcomes.find((o) => o.id === 'rebuild:blocked-merger:merger:out')).toMatchObject({
    status: 'skipped',
    reason: 'rebuild_key_deleted: restore with undo-group first',
  });
  expect(listTrades(db).filter((t) => t.importKey?.includes('blocked-merger'))).toEqual([]);
  expect(
    db
      .select()
      .from(booking)
      .where(isNull(booking.deletedAt))
      .all()
      .filter((b) => b.importKey?.includes('blocked-merger')),
  ).toEqual([]);
});

it('moves a final unit residual into the opening correction with --residual-to-opening; dry-run, repeat and undo', () => {
  stage('synthetic-residual', 'synthetic_unhandled', [
    leg('residual-leg', options.today, asset('a', '0.00009')),
  ]);
  const before = liveState(),
    counts = rowCounts();
  const withFlag = { ...options, residualToOpening: true };
  const dry = applySourceRebuild(db, { ...withFlag, dryRun: true }, ctx);
  expect(dry.residualToOpening).toHaveLength(1);
  expect(dry.residualToOpening[0]!.unitsE8).toBe(9000);
  expect(
    dry.residualToOpening[0]!.finalSourceUnitsE8 - dry.residualToOpening[0]!.finalAppUnitsE8,
  ).toBe(9000);
  expect(liveState()).toEqual(before);
  expect(rowCounts()).toEqual(counts);
  const report = applySourceRebuild(db, withFlag, ctx);
  expect(report.dust).toEqual([]);
  expect(report.issues.filter((i) => i.reason === 'residual_to_opening')).toHaveLength(1);
  expect(report.units.filter((r) => r.date === options.today && r.differenceE8)).toEqual([]);
  const opening = liveState();
  expect(opening).toEqual(
    expect.objectContaining({}), // state is serialisable
  );
  expect(JSON.stringify(opening)).toContain('rebuild:opening:');
  const again = applySourceRebuild(db, withFlag, ctx);
  expect(again.units.filter((r) => r.date === options.today && r.differenceE8)).toEqual([]);
  // A repeat re-derives the opening then re-applies the residual: same values, fresh updatedAt.
  const stable = (x: unknown) => JSON.stringify(x).replace(/"updatedAt":"[^"]*"/g, '');
  expect(stable(liveState())).toEqual(stable(opening));
  // Newest group first: the repeat re-touched the opening row.
  undoAuditGroups(db, [again.groupId, report.groupId].filter(Boolean), ctx);
  expect(liveState()).toEqual(before);
});

it('books coin rewards without moving the EUR cash account', () => {
  const rewardOnly = (...ids: string[]) => {
    for (const row of db.select().from(inboxItem).all())
      if (!ids.includes(row.id) && !['opening'].includes(row.id))
        db.delete(inboxItem).where(eq(inboxItem.id, row.id)).run();
  };
  rewardOnly('reward-1', 'reward-2');
  const cashId = accounts.list(db).find((a) => a.name === 'Synthetic Cash')!.id;
  const result = applySourceRebuild(db, options, ctx);
  const rewardTrades = listTrades(db).filter((t) => t.importKey?.startsWith('rebuild:reward:'));
  expect(rewardTrades.length).toBeGreaterThan(0);
  const rewardBookingIds = new Set(rewardTrades.map((t) => t.bookingId));
  const bookings = db.select().from(booking).where(isNull(booking.deletedAt)).all();
  expect(
    bookings.filter((b) => b.accountId === cashId && b.importKey?.startsWith('rebuild:reward:')),
  ).toEqual([]);
  expect(
    bookings.filter((b) => rewardBookingIds.has(b.id)).reduce((sum, b) => sum + b.amountCents, 0),
  ).toBe(0);
  expect(result.issues.filter((i) => i.reason === 'reward_no_price')).toEqual([]);
});

it('keeps buys paid from a foreign fiat wallet away from the EUR cash account', () => {
  const usd = (cents: number) => ({ ...eur(cents), currencyId: 'foreign-id' });
  stage('usd-only-buy', 'buy', [
    leg('uo-a', '2026-04-05', asset('a', '1'), 'INCOMING', { tradeId: 'uo' }),
    leg('uo-cash', '2026-04-05', usd(12500), 'OUTGOING', {
      tradeId: 'uo',
      walletId: 'usd-wallet',
    }),
    leg('uo-fee', '2026-04-05', usd(250), 'OUTGOING', {
      type: 'fee',
      tradeId: 'uo',
      walletId: 'usd-wallet',
    }),
  ]);
  stage('usd-deposit', 'deposit', [
    leg('usd-dep', '2026-04-04', usd(12750), 'INCOMING', { walletId: 'usd-wallet' }),
  ]);
  saveReadSourceState(
    db,
    {
      lastSuccess: null,
      lastAttempt: null,
      status: 'idle',
      window: null,
      balances: [{ key: 'currency:foreign-id', amount: usd(0), currency: 'USD' }],
    },
    ctx,
  );
  db.insert(fxRate)
    .values({ currency: 'USD', date: '2026-04-05', rateMicro: 800000, source: 'ecb' })
    .run();
  db.insert(fxRate)
    .values({ currency: 'USD', date: '2026-04-04', rateMicro: 800000, source: 'ecb' })
    .run();
  const cashId = accounts.list(db).find((a) => a.name === 'Synthetic Cash')!.id;
  const result = applySourceRebuild(db, options, ctx);
  const t = listTrades(db).find((r) => r.importKey === 'rebuild:usd-only-buy:0')!;
  expect(t).toMatchObject({ kind: 'delivery_in', unitsE8: 100000000, feeCents: 0 });
  expect(t.amountCents).toBe(10200);
  expect(t.bookingId).toBeNull();
  expect(
    db
      .select()
      .from(booking)
      .where(isNull(booking.deletedAt))
      .all()
      .filter((b) => b.accountId === cashId && b.date === '2026-04-05'),
  ).toEqual([]);
  expect(result.issues).toContainEqual(
    expect.objectContaining({ id: 'usd-only-buy', reason: 'fiat_wallet_not_eur' }),
  );
  expect(accountSummaries(db, options.today).find((a) => a.id === cashId)!.balanceCents).toBe(
    114650,
  );
  expect(result.cashEnd.differenceCents).toBe(2000);
});
