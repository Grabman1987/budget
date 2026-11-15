import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type OpenedDatabase } from '../client';
import { account, auditLog, booking, trade } from '../schema';
import { accounts, createSecurity } from './index';
import { seedBasics, testCtx } from './test-helpers';
import { undo } from './audit';
import { accountBalances } from './queries';
import { createTrade, createTradeWithCashTransfer, TradeRuleError } from './trades';

// Synthetic data only.
let opened: OpenedDatabase;
beforeEach(() => {
  opened = createTestDatabase();
  seedBasics(opened.db); // 'giro' (EUR budget), 'usd' (USD)
  accounts.create(
    opened.db,
    {
      id: 'depot',
      name: 'Synthetic depot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingDate: '2026-09-01',
    },
    testCtx,
  );
  createSecurity(opened.db, { id: 'fund', name: 'Synthetic Fund', kind: 'etf' }, testCtx);
});
afterEach(() => opened.close());

const base = {
  securityId: 'fund',
  accountId: 'depot',
  date: '2026-11-09',
  unitsE8: 33_944_300,
  amountCents: 10_000,
};
const buy = (extra = {}) => ({ ...base, kind: 'buy' as const, feeCents: 100, ...extra });
const legs = () => opened.db.select().from(booking).all();
const balance = (id: string) =>
  accountBalances(opened.db).find((row) => row.accountId === id)?.balanceCents;

describe('trade with counter booking on the Verrechnungskonto (#1099)', () => {
  it('moves gross plus fee from the settlement account into the depot, fee stays in the trade', () => {
    const giro = balance('giro')!;
    const result = createTradeWithCashTransfer(
      opened.db,
      buy({ importKey: 'wpa:1' }),
      'giro',
      testCtx,
    );
    expect(result.duplicate).toBe(false);
    expect(result.transferId).toBeTruthy();
    expect(opened.db.select().from(trade).get()).toMatchObject({
      amountCents: 10_000,
      feeCents: 100,
    });
    const rows = legs();
    // Trade settlement on the depot, plus the two transfer legs: exactly three bookings.
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.accountId === 'giro').map((r) => r.amountCents)).toEqual([-10_100]);
    expect(
      rows
        .filter((r) => r.accountId === 'depot')
        .map((r) => r.amountCents)
        .sort(),
    ).toEqual([-10_100, 10_100]);
    expect(rows.filter((r) => r.transferId).every((r) => r.source === 'manual')).toBe(true);
    // Depot cash stays 0; the settlement account carries the bank amount.
    expect(balance('depot')).toBe(0);
    expect(balance('giro')).toBe(giro - 10_100);
  });

  it('moves the net proceeds of a sale back to the settlement account', () => {
    createTrade(opened.db, { ...buy(), feeCents: 0 }, testCtx);
    const giro = balance('giro')!;
    createTradeWithCashTransfer(
      opened.db,
      {
        ...base,
        kind: 'sell',
        unitsE8: -33_944_300,
        amountCents: 12_000,
        feeCents: 100,
        taxCents: 250,
        date: '2026-11-20',
      },
      'giro',
      testCtx,
    );
    expect(balance('giro')).toBe(giro + 11_650);
    expect(balance('depot')).toBe(-10_000);
  });

  it('writes trade, depot booking and transfer in one audit group that undo reverts together', () => {
    const result = createTradeWithCashTransfer(opened.db, buy(), 'giro', {
      ...testCtx,
      groupId: 'synthetic-group',
    });
    const written = opened.db
      .select()
      .from(auditLog)
      .all()
      .filter((row) => ['trade', 'booking', 'booking_split', 'transfer'].includes(row.entityType));
    expect(written.length).toBeGreaterThanOrEqual(6);
    expect(new Set(written.map((row) => row.groupId))).toEqual(new Set(['synthetic-group']));
    undo(opened.db, { groupId: 'synthetic-group' }, testCtx);
    expect(
      opened.db.select().from(trade).where(eq(trade.id, result.trade.id)).get()?.deletedAt,
    ).not.toBeNull();
    expect(legs().filter((r) => r.deletedAt === null)).toHaveLength(0);
  });

  it('writes nothing twice for a repeated confirmation reference', () => {
    createTradeWithCashTransfer(opened.db, buy({ importKey: 'wpa:1' }), 'giro', testCtx);
    const again = createTradeWithCashTransfer(
      opened.db,
      buy({ importKey: 'wpa:1' }),
      'giro',
      testCtx,
    );
    expect(again).toMatchObject({ duplicate: true, transferId: null });
    expect(legs()).toHaveLength(3);
  });

  it('rejects the depot itself, a closed account and another currency without writing', () => {
    expect(() => createTradeWithCashTransfer(opened.db, buy(), 'depot', testCtx)).toThrow(
      TradeRuleError,
    );
    expect(() => createTradeWithCashTransfer(opened.db, buy(), 'usd', testCtx)).toThrow(
      /different currencies/,
    );
    opened.db.update(account).set({ closedAt: '2026-11-01' }).where(eq(account.id, 'spar')).run();
    expect(() => createTradeWithCashTransfer(opened.db, buy(), 'spar', testCtx)).toThrow(/closed/);
    expect(opened.db.select().from(trade).all()).toHaveLength(0);
    expect(legs()).toHaveLength(0);
  });
});
