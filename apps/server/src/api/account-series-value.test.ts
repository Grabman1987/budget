/* eslint-disable @typescript-eslint/no-explicit-any -- Inspect synthetic JSON responses. */
import { createBooking, createTestDatabase, schema } from '@budget/db';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AuthGate } from '../app';

const TODAY = '2026-10-05';
const auth: AuthGate = {
  routes: new Hono(),
  originGuard: async (_c, next) => next(),
  requireSession: async (_c, next) => next(),
  requireStepUp: async (_c, next) => next(),
};
let opened: ReturnType<typeof createTestDatabase>;
let app: ReturnType<typeof createApp>;
const call = async (path: string) => (await app.request(`/api${path}`)).json() as Promise<any>;

beforeEach(() => {
  opened = createTestDatabase();
  const { db } = opened;
  db.insert(schema.account)
    .values(
      [
        ['cash', 'checking', 'budget', true],
        ['depot', 'brokerage', 'investment', false],
        ['p2p', 'p2p', 'investment', false],
      ].map(([id, type, role, onBudget]) => ({
        id: id as string,
        name: `Synthetic ${id}`,
        type: type as 'checking',
        role: role as 'budget',
        onBudget: onBudget as boolean,
        openingDate: '2026-09-01',
        openingBalanceCents: id === 'cash' ? 5_000 : 0,
      })),
    )
    .run();
  db.insert(schema.security)
    .values([
      { id: 'fund', name: 'Synthetic fund', kind: 'etf', currency: 'EUR' },
      { id: 'loan', name: 'Synthetic loan', kind: 'other', currency: 'EUR' },
    ])
    .run();
  db.insert(schema.holding)
    .values([
      {
        id: 'h1',
        accountId: 'depot',
        securityId: 'fund',
        asOf: '2026-09-01',
        unitsE8: 1_000_000_000,
      },
      { id: 'h2', accountId: 'p2p', securityId: 'loan', asOf: '2026-09-01', unitsE8: 100_000_000 },
      // written off on the 2nd: no units left
      { id: 'h3', accountId: 'p2p', securityId: 'loan', asOf: '2026-10-02', unitsE8: 0 },
    ])
    .run();
  const quote = (securityId: string, date: string, eur: number) => ({
    securityId,
    date,
    priceMicro: eur * 1_000_000,
    currency: 'EUR',
    source: 'manual' as const,
  });
  db.insert(schema.price)
    .values([
      quote('fund', '2026-09-01', 100),
      quote('fund', '2026-10-03', 120),
      quote('loan', '2026-09-01', 69),
    ])
    .run();
  for (const [accountId, date, amountCents] of [
    ['p2p', '2026-10-04', 250], // interest payout after the write-off
    ['cash', '2026-10-04', -700],
  ] as const)
    createBooking(
      db,
      { accountId, date, amountCents, status: 'confirmed', splits: [{ amountCents }] },
      { actor: 'test', groupId: `g-${accountId}` },
    );
  app = createApp({ webDir: 'apps/web/dist', auth, ledger: { db, today: () => TODAY } });
});
afterEach(() => opened.close());

describe('account series follow the value column', () => {
  it('ends every series on the value of the same day, for the batch and the single account', async () => {
    const range = 'from=2026-09-28&to=2026-10-05';
    const list = (await call('/accounts')).accounts as any[];
    const batch = (await call(`/accounts/series?${range}`)).series;
    for (const id of ['cash', 'depot', 'p2p']) {
      const value = list.find((a) => a.id === id).valueEurCents;
      const single = await call(`/accounts/${id}/series?${range}`);
      expect(batch[id].points.at(-1).balanceCents).toBe(value);
      expect(batch[id].points.at(-1).valuation.eurCents).toBe(value);
      expect(single.points).toEqual(batch[id].points);
    }
    expect(list.find((a) => a.id === 'depot').valueEurCents).toBe(120_000);
    expect(list.find((a) => a.id === 'p2p').valueEurCents).toBe(250);
    expect(list.find((a) => a.id === 'cash').valueEurCents).toBe(4_300);
  });

  it('moves a depot with its price and a written-off P2P account down to its payout', async () => {
    const { series } = await call('/accounts/series?from=2026-10-01&to=2026-10-05');
    const balances = (id: string) => series[id].points.map((p: any) => p.balanceCents);
    expect(balances('depot')).toEqual([100_000, 100_000, 120_000, 120_000, 120_000]);
    expect(balances('p2p')).toEqual([6_900, 0, 0, 250, 250]);
    expect(balances('cash')).toEqual([5_000, 5_000, 5_000, 4_300, 4_300]);
  });
});
