/** Synthetic strategy evidence for tests only; never a real US exchange calendar or market feed. */
import { STRATEGY_CATEGORIES, type StrategyConfiguration } from '@budget/domain';
import type { OpenedDatabase } from '../client';
import { account, assetClass, holding, price } from '../schema';
import { createSecurity } from './securities';
import type { StrategyEvidence } from './portfolio-strategy';

export const STRATEGY_TEST_AS_OF = '2026-09-30T12:00:00.000Z';
export function strategyTestConfiguration(): StrategyConfiguration {
  return {
    version: 1,
    enabled: true,
    contributionCents: 10000,
    includeFreeCash: false,
    classes: {
      global: 'strategy-global',
      gold: 'strategy-gold',
      nasdaq2x: 'strategy-nasdaq2x',
      eurBonds: 'strategy-eurBonds',
    },
    routes: STRATEGY_CATEGORIES.map((category) => ({
      category,
      securityId: `strategy-${category}`,
      weightBp: 10000,
      daily2xNasdaqConfirmed: category === 'nasdaq2x',
      constraints: { minimumGrossCents: 0, fixedFeeCents: 0, feeBp: 0, unitStepE8: null },
    })),
  };
}
export function strategyTestEvidence(
  asOf = STRATEGY_TEST_AS_OF,
): Extract<StrategyEvidence, { status: 'verified' }> {
  const end = Date.parse('2026-09-29T00:00:00.000Z');
  const sessions = Array.from({ length: 220 }, (_, index) => {
    const date = new Date(end - (219 - index) * 86400000).toISOString().slice(0, 10);
    return { date, completedAt: `${date}T21:00:00.000Z` };
  });
  return {
    status: 'verified',
    verifiedIndex: 'nasdaq-100-usd-price-index',
    input: {
      asOf,
      latestCompletedSession: '2026-09-29',
      calendar: { id: 'synthetic-us', verifiedComplete: true, sessions },
      source: {
        sourceId: 'synthetic-source',
        indexId: 'synthetic-index',
        kind: 'price-index',
        currency: 'USD',
        leverage: 1,
        unitsPerPoint: 1000,
      },
      closes: sessions.map((row) => ({
        sessionDate: row.date,
        closedAt: row.completedAt,
        observedAt: row.completedAt,
        sourceId: 'synthetic-source',
        indexId: 'synthetic-index',
        closeUnits: 100000,
      })),
    },
    months: [
      {
        id: 'synthetic-us',
        sourceId: 'synthetic-calendar',
        verifiedComplete: true,
        month: '2026-09',
        sessions: [
          ...sessions.filter((row) => row.date.startsWith('2026-09')).map((row) => row.date),
          '2026-09-30',
        ],
      },
    ],
  };
}
export function seedStrategyTestPortfolio(opened: OpenedDatabase) {
  const db = opened.db;
  for (const category of STRATEGY_CATEGORIES)
    db.insert(assetClass)
      .values({ id: `strategy-${category}`, name: `Testklasse ${category}` })
      .run();
  db.insert(account)
    .values({
      id: 'strategy-depot',
      name: 'Testdepot',
      type: 'brokerage',
      role: 'investment',
      onBudget: false,
      openingBalanceCents: 0,
      openingDate: '2026-01-01',
    })
    .run();
  STRATEGY_CATEGORIES.forEach((category, index) => {
    const id = `strategy-${category}`;
    createSecurity(
      db,
      {
        id,
        name: `Testfonds ${category}`,
        kind: 'etf',
        currency: 'EUR',
        assetClassId: id,
        exposureValidFrom: '2026-01-01',
        leverageFactor: category === 'nasdaq2x' ? 20 : 10,
      },
      { actor: 'test', groupId: `seed-${category}` },
    );
    db.insert(holding)
      .values({
        id,
        securityId: id,
        accountId: 'strategy-depot',
        asOf: '2026-09-01',
        unitsE8: 100000000,
      })
      .run();
    db.insert(price)
      .values({
        securityId: id,
        date: '2026-09-30',
        currency: 'EUR',
        source: 'manual',
        priceMicro: [600000000, 100000000, 100000000, 200000000][index]!,
      })
      .run();
  });
}
