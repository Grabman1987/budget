import {
  applySavingsProposal,
  createTestDatabase,
  portfolioSummary,
  savingsExecutions,
  savingsProposal,
  listSavingsPlans,
  schema,
  type Db,
} from '@budget/db';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from './seed';

const TODAY = '2026-09-17';
let db: Db;
beforeAll(() => {
  db = createTestDatabase().db;
  seedDatabase(db);
});

describe('portfolio summary of the seeded sample ledger on 17.09.2026', () => {
  it('positions and totals equal the prototype (Vermögen POS / EXACT)', () => {
    const p = portfolioSummary(db, { today: TODAY });
    const value = (id: string) => p.positions.find((l) => l.securityId === `sec-${id}`)?.valueCents;
    expect([
      value('etfw'),
      value('etfem'),
      value('akta'),
      value('btc'),
      value('eth'),
      value('p2p'),
    ]).toEqual([6_850_000, 700_000, 395_000, 340_000, 93_500, 421_500]);
    expect(p.valueCents).toBe(8_800_000);
    expect(p.positions.reduce((a, l) => a + l.shareBp, 0)).toBe(10_000);
    expect(p.gainCents).toBe(p.valueCents - p.costCents);
  });

  it('allocation: the emerging-markets class is under its band; speculative is 14,2 % (R13, R15)', () => {
    const p = portfolioSummary(db, { today: TODAY });
    const em = p.allocation.rows.find((r) => r.assetClass === 'ac-em');
    expect(em).toMatchObject({ shareBp: 796, targetBp: 1200, breach: true, side: 'under' });
    expect(p.allocation.rows.find((r) => r.assetClass === 'ac-welt')).toMatchObject({
      shareBp: 7784,
      breach: false,
    });
    expect(p.speculative).toMatchObject({ shareBp: 1420, breach: true });
    expect(p.proposals.map((r) => r.code)).toEqual(['r13_under', 'r15_speculative']);
    expect(p.classes.map((c) => c.name)).toEqual(['Aktien Welt', 'Schwellenländer', 'Spekulativ']);
    expect(p.platforms.map((x) => x.shareBp).reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it('performance of 3J matches the prototype (TTWROR 38,2 %) and carries a benchmark', () => {
    const p = portfolioSummary(db, { today: TODAY, period: '3J' });
    expect(p.performance?.ttwror).toBeCloseTo(0.382, 3);
    expect(p.performance?.endValueCents).toBe(8_800_000);
    expect(p.benchmark?.securityId).toBe('sec-etfw');
    expect(p.performance?.benchmarkTtwror).not.toBeNull();
    expect(p.costs.terCents).toBeGreaterThan(0);
    // The sample distribution of December 2025: 18,00 gross, 1,50 fee, 3,50 tax.
    expect(p.income).toEqual({ grossCents: 1_800, taxCents: 350, feeCents: 150, netCents: 1_300 });
  });
});

describe('savings plans of the sample ledger', () => {
  it('every month before today shows its executions as ausgeführt', () => {
    for (const month of ['2024-03', '2026-07', '2026-08']) {
      const rows = savingsExecutions(db, month, TODAY);
      expect(rows).toHaveLength(5);
      expect(
        rows.every((r) => r.status === 'executed'),
        month,
      ).toBe(true);
    }
    // The first quarter ran at the lower rate: the history rows keep it.
    expect(savingsExecutions(db, '2023-11', TODAY).every((r) => r.status === 'executed')).toBe(
      true,
    );
    expect(savingsExecutions(db, '2026-09', TODAY).every((r) => r.status === 'upcoming')).toBe(
      true,
    );
  });

  it('proposal equals the prototype next rates: 300 / 100 / 0 / 0 / 0', () => {
    const proposal = savingsProposal(db, TODAY);
    const byName = Object.fromEntries(
      proposal.plans.map((p) => [p.name, [p.currentCents, p.proposedCents, p.reason]]),
    );
    expect(byName).toEqual({
      'ETF Welt': [31_680, 30_000, 'rounded'],
      'ETF Schwellenländer': [6_000, 10_000, 'steer_r13_under'],
      'Einzelaktie A': [2_000, 0, 'paused_r15'],
      Bitcoin: [200, 0, 'paused_r15'],
      Ethereum: [120, 0, 'paused_r15'],
    });
    expect(proposal.totalCents).toBe(40_000);
  });

  it('apply ends and starts rows from the next execution day, adds one inbox item, once', () => {
    const copy = createTestDatabase().db;
    seedDatabase(copy);
    const result = applySavingsProposal(copy, TODAY, { actor: 'test' });
    expect(result.changes).toHaveLength(5);
    expect(result.changes.every((c) => c.from === '2026-09-30')).toBe(true);
    const open = listSavingsPlans(copy);
    expect(open.map((r) => [r.securityId, r.amountCents, r.validFrom]).sort()).toEqual([
      ['sec-etfem', 10_000, '2026-09-30'],
      ['sec-etfw', 30_000, '2026-09-30'],
    ]);
    const items = () =>
      copy
        .select()
        .from(schema.inboxItem)
        .all()
        .filter((i) => i.title === 'Sparplan bei der Bank ändern');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toMatchObject({ kind: 'other', refType: 'savings_plan' });
    // A second apply finds nothing left to change.
    expect(applySavingsProposal(copy, TODAY, { actor: 'test' }).changes).toEqual([]);
    expect(items()).toHaveLength(1);
  });
});
