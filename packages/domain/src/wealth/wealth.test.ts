import { describe, expect, it } from 'vitest';
import {
  allocationStatus,
  clusterRisk,
  defaultBandBp,
  rebalancingProposals,
  savingsPlanProposal,
  speculativeShare,
  type ClassTarget,
  type SavingsPlan,
  type WealthPosition,
} from './index';

// Prototype portfolio (design/prototype/vermoegen.js), total 88.000 €.
const POS: WealthPosition[] = [
  { id: 'p1', kind: 'etf', assetClass: 'welt', valueCents: 6_850_000, platform: 'broker-c' },
  { id: 'p2', kind: 'etf', assetClass: 'em', valueCents: 700_000, platform: 'broker-c' },
  { id: 'p3', kind: 'stock', assetClass: 'spec', valueCents: 395_000, platform: 'broker-c' },
  { id: 'p4', kind: 'crypto', assetClass: 'spec', valueCents: 340_000, platform: 'plat-d' },
  { id: 'p5', kind: 'crypto', assetClass: 'spec', valueCents: 93_500, platform: 'plat-d' },
  { id: 'p6', kind: 'p2p', assetClass: 'spec', valueCents: 421_500, platform: 'plat-e' },
];
const TARGETS: ClassTarget[] = [
  { assetClass: 'welt', targetBp: 8000 },
  { assetClass: 'em', targetBp: 1200 },
  { assetClass: 'spec', targetBp: 800 },
];

describe('allocationStatus (R13)', () => {
  const status = allocationStatus(POS, TARGETS);
  const row = (k: string) => status.rows.find((r) => r.assetClass === k)!;

  it('prototype: shares add up to 100 %, EM is -4,0 pp', () => {
    expect(status.totalCents).toBe(8_800_000);
    expect(status.rows.map((r) => r.shareBp)).toEqual([7784, 796, 1420]);
    expect(status.rows.reduce((a, r) => a + r.shareBp, 0)).toBe(10_000);
    expect(row('em').deviationBp).toBe(-404);
    expect(row('em').gapCents).toBe(356_000);
    expect(row('em').bandBp).toBe(300);
    expect(row('em').side).toBe('under');
  });

  it('band is min(5 pp, 25 % of the target); breaches are EM and the speculative class', () => {
    expect(defaultBandBp(8000)).toBe(500);
    expect(defaultBandBp(1200)).toBe(300);
    expect(defaultBandBp(800)).toBe(200);
    expect(row('welt').breach).toBe(false);
    expect(status.breaches.map((r) => r.assetClass)).toEqual(['em', 'spec']);
    expect(status.ok).toBe(false);
    expect(row('spec').speculativeOnly).toBe(true);
    expect(row('welt').speculativeOnly).toBe(false);
    expect(status.maxDeviationBp).toBe(620);
  });

  it('a stored band wins over the default', () => {
    const s = allocationStatus(POS, [
      { assetClass: 'welt', targetBp: 8000, bandBp: 100 },
      { assetClass: 'em', targetBp: 1200, bandBp: 1000 },
      { assetClass: 'spec', targetBp: 800, bandBp: 1000 },
    ]);
    expect(s.breaches.map((r) => r.assetClass)).toEqual(['welt']);
  });

  it('exactly on the band edge is inside (decided on cents, not on rounded shares)', () => {
    const s = allocationStatus(
      [
        { id: 'a', kind: 'etf', assetClass: 'a', valueCents: 5_500 },
        { id: 'b', kind: 'etf', assetClass: 'b', valueCents: 4_500 },
      ],
      [
        { assetClass: 'a', targetBp: 5000 },
        { assetClass: 'b', targetBp: 5000 },
      ],
    );
    expect(s.rows.map((r) => r.breach)).toEqual([false, false]);
    const s2 = allocationStatus(
      [
        { id: 'a', kind: 'etf', assetClass: 'a', valueCents: 5_501 },
        { id: 'b', kind: 'etf', assetClass: 'b', valueCents: 4_499 },
      ],
      [
        { assetClass: 'a', targetBp: 5000 },
        { assetClass: 'b', targetBp: 5000 },
      ],
    );
    expect(s2.rows.map((r) => r.breach)).toEqual([true, true]);
  });

  it('classes without target and unclassified positions get their own row and never breach', () => {
    const s = allocationStatus(
      [
        { id: 'a', kind: 'etf', assetClass: 'a', valueCents: 5_000 },
        { id: 'x', kind: 'etf', assetClass: 'zz', valueCents: 3_000 },
        { id: 'y', kind: 'other', assetClass: null, valueCents: 2_000 },
      ],
      [{ assetClass: 'a', targetBp: 10_000 }],
    );
    expect(s.rows.map((r) => [r.assetClass, r.shareBp, r.targetBp, r.breach])).toEqual([
      ['a', 5000, 10_000, true],
      ['zz', 3000, null, false],
      ['', 2000, null, false],
    ]);
  });

  it('empty portfolio: no shares, no breach', () => {
    const s = allocationStatus([], TARGETS);
    expect(s.totalCents).toBe(0);
    expect(s.rows.every((r) => r.shareBp === 0 && !r.breach && r.gapCents === 0)).toBe(true);
    expect(s.ok).toBe(true);
  });

  it('largest remainder keeps the sum at 10 000 for thirds', () => {
    const s = allocationStatus(
      ['a', 'b', 'c'].map((k) => ({ id: k, kind: 'etf' as const, assetClass: k, valueCents: 100 })),
      [],
    );
    expect(s.rows.map((r) => r.shareBp)).toEqual([3334, 3333, 3333]);
  });

  it('does not overflow for very large portfolios', () => {
    const big = 900_000_000_000_000; // 9 trillion euros
    const s = allocationStatus(
      [
        { id: 'a', kind: 'etf', assetClass: 'a', valueCents: big },
        { id: 'b', kind: 'etf', assetClass: 'b', valueCents: 1 },
      ],
      [
        { assetClass: 'a', targetBp: 9999 },
        { assetClass: 'b', targetBp: 1 },
      ],
    );
    expect(s.rows.reduce((x, r) => x + r.shareBp, 0)).toBe(10_000);
    expect(s.rows[0]).toMatchObject({ shareBp: 10_000, breach: false });
  });
});

describe('clusterRisk (R14) and speculativeShare (R15)', () => {
  it('prototype: largest single title 4,5 %, platforms within 20 %', () => {
    const c = clusterRisk(POS);
    expect(c.largestSingle).toMatchObject({ id: 'p3', shareBp: 449, breach: false });
    expect(c.platforms.map((p) => [p.id, p.shareBp])).toEqual([
      ['plat-d', 493],
      ['plat-e', 479],
    ]);
    expect(c.breach).toBe(false);
  });

  it('ETFs and brokers are never a cluster, names do not matter', () => {
    const c = clusterRisk([
      { id: 'etf', kind: 'etf', assetClass: 'welt', valueCents: 9_000, platform: 'b' },
      { id: 'Bitcoin', kind: 'other', assetClass: 'spec', valueCents: 1_000, platform: 'b' },
    ]);
    expect(c.singles).toEqual([]);
    expect(c.platforms).toEqual([]);
    expect(c.breach).toBe(false);
  });

  it('flags a single title above 10 % and a platform above 20 %', () => {
    const c = clusterRisk([
      { id: 'etf', kind: 'etf', assetClass: 'w', valueCents: 7_000, platform: 'b' },
      { id: 's1', kind: 'stock', assetClass: 'w', valueCents: 1_001, platform: 'b' },
      { id: 'c1', kind: 'crypto', assetClass: 'w', valueCents: 1_000, platform: 'x' },
      { id: 'c2', kind: 'p2p', assetClass: 'w', valueCents: 1_000, platform: 'x' },
    ]);
    expect(c.singles.find((e) => e.id === 's1')?.breach).toBe(true);
    expect(c.singles.find((e) => e.id === 'c1')?.breach).toBe(false); // exactly 10,0 % of 10 001 is below
    expect(c.platforms).toMatchObject([{ id: 'x', valueCents: 2_000, breach: false }]);
    const d = clusterRisk([
      { id: 'etf', kind: 'etf', assetClass: 'w', valueCents: 7_900, platform: 'b' },
      { id: 'c1', kind: 'crypto', assetClass: 'w', valueCents: 1_050, platform: 'x' },
      { id: 'c2', kind: 'p2p', assetClass: 'w', valueCents: 1_050, platform: 'x' },
    ]);
    expect(d.platforms[0]).toMatchObject({ id: 'x', breach: true });
  });

  it('one security on several platforms is summed', () => {
    const c = clusterRisk([
      {
        id: 'a1',
        securityId: 's',
        kind: 'stock',
        assetClass: 'w',
        valueCents: 600,
        platform: 'b1',
      },
      {
        id: 'a2',
        securityId: 's',
        kind: 'stock',
        assetClass: 'w',
        valueCents: 600,
        platform: 'b2',
      },
      { id: 'e', kind: 'etf', assetClass: 'w', valueCents: 8_800, platform: 'b1' },
    ]);
    expect(c.singles).toEqual([{ id: 's', valueCents: 1_200, shareBp: 1200, breach: true }]);
  });

  it('prototype: speculative share 14,2 %, 3.700 € over the limit', () => {
    const s = speculativeShare(POS);
    expect(s).toMatchObject({
      valueCents: 1_250_000,
      shareBp: 1420,
      breach: true,
      overCents: 370_000,
    });
  });

  it('exactly 10 % is fine; empty portfolio has no breach', () => {
    const s = speculativeShare([
      { id: 'a', kind: 'etf', assetClass: 'w', valueCents: 9_000 },
      { id: 'b', kind: 'crypto', assetClass: 'w', valueCents: 1_000 },
    ]);
    expect(s).toMatchObject({ shareBp: 1000, breach: false, overCents: 0 });
    expect(speculativeShare([]).breach).toBe(false);
  });
});

describe('rebalancingProposals', () => {
  it('prototype: EM under target first, then R15; the speculative class is covered by R15', () => {
    const rows = rebalancingProposals({
      allocation: allocationStatus(POS, TARGETS),
      cluster: clusterRisk(POS),
      speculative: speculativeShare(POS),
    });
    expect(rows).toEqual([
      {
        code: 'r13_under',
        rule: 'R13',
        direction: 'add',
        assetClass: 'em',
        subjectId: null,
        shareBp: 796,
        referenceBp: 1200,
        gapCents: 356_000,
      },
      {
        code: 'r15_speculative',
        rule: 'R15',
        direction: 'reduce',
        assetClass: null,
        subjectId: null,
        shareBp: 1420,
        referenceBp: 1000,
        gapCents: 370_000,
      },
    ]);
  });

  it('reports R13 over-weight and R14 rows with gaps', () => {
    const positions: WealthPosition[] = [
      { id: 'etf', kind: 'etf', assetClass: 'w', valueCents: 70_000, platform: 'b' },
      { id: 's1', kind: 'stock', assetClass: 'w', valueCents: 15_000, platform: 'b' },
      { id: 'c1', kind: 'crypto', assetClass: 'x', valueCents: 15_000, platform: 'p' },
    ];
    const rows = rebalancingProposals({
      allocation: allocationStatus(positions, [
        { assetClass: 'w', targetBp: 6000 },
        { assetClass: 'x', targetBp: 4000 },
      ]),
      cluster: clusterRisk(positions),
      speculative: speculativeShare(positions),
    });
    expect(rows.map((r) => [r.code, r.assetClass ?? r.subjectId, r.gapCents])).toEqual([
      ['r13_under', 'x', 25_000],
      ['r13_over', 'w', 25_000],
      ['r14_single', 'c1', 5_000],
      ['r14_single', 's1', 5_000],
      ['r15_speculative', null, 20_000],
    ]);
  });

  it('nothing to do when everything is within limits', () => {
    const positions: WealthPosition[] = [
      { id: 'etf', kind: 'etf', assetClass: 'w', valueCents: 100_000 },
    ];
    expect(
      rebalancingProposals({
        allocation: allocationStatus(positions, [{ assetClass: 'w', targetBp: 10_000 }]),
        cluster: clusterRisk(positions),
        speculative: speculativeShare(positions),
      }),
    ).toEqual([]);
  });
});

describe('savingsPlanProposal', () => {
  const PLANS: SavingsPlan[] = [
    { id: 'welt', name: 'ETF Welt', kind: 'etf', assetClass: 'welt', monthlyCents: 31_700 },
    { id: 'em', name: 'ETF Schwellenländer', kind: 'etf', assetClass: 'em', monthlyCents: 6_000 },
    { id: 'a', name: 'Einzelaktie A', kind: 'stock', assetClass: 'spec', monthlyCents: 2_000 },
    { id: 'btc', name: 'Bitcoin', kind: 'crypto', assetClass: 'spec', monthlyCents: 200 },
    { id: 'eth', name: 'Ethereum', kind: 'crypto', assetClass: 'spec', monthlyCents: 100 },
  ];

  it('prototype SPARPLAN: 317/60/20/2/1 becomes 300/100/0/0/0 in 50 € steps, total 400 € kept', () => {
    const p = savingsPlanProposal(PLANS, allocationStatus(POS, TARGETS), {
      speculativeBreached: speculativeShare(POS).breach,
      stepCents: 5_000,
    });
    expect(p.plans.map((x) => [x.id, x.proposedCents, x.reason])).toEqual([
      ['welt', 30_000, 'rounded'],
      ['em', 10_000, 'steer_r13_under'],
      ['a', 0, 'paused_r15'],
      ['btc', 0, 'paused_r15'],
      ['eth', 0, 'paused_r15'],
    ]);
    expect(p.totalCents).toBe(40_000);
    expect(p.freedCents).toBe(2_300);
    expect(p.changed).toBe(true);
    expect(p.note).toBeNull();
  });

  it('with the default 1 € step the freed rate goes exactly to the under-band class', () => {
    const p = savingsPlanProposal(PLANS, allocationStatus(POS, TARGETS), {
      speculativeBreached: true,
    });
    expect(p.plans.map((x) => x.proposedCents)).toEqual([31_700, 8_300, 0, 0, 0]);
    expect(p.plans.reduce((a, x) => a + x.proposedCents, 0)).toBe(p.totalCents);
  });

  it('R15 not breached and nothing over band: nothing changes, nothing is rounded', () => {
    const balanced = allocationStatus(
      [
        { id: 'p1', kind: 'etf', assetClass: 'welt', valueCents: 80_000 },
        { id: 'p2', kind: 'etf', assetClass: 'em', valueCents: 12_000 },
        { id: 'p3', kind: 'stock', assetClass: 'spec', valueCents: 8_000 },
      ],
      TARGETS,
    );
    const p = savingsPlanProposal(PLANS, balanced, {
      speculativeBreached: false,
      stepCents: 5_000,
    });
    expect(p.changed).toBe(false);
    expect(p.plans.every((x) => x.reason === 'unchanged')).toBe(true);
  });

  it('over-band class is paused when an under-band class takes the money', () => {
    const positions: WealthPosition[] = [
      { id: 'a', kind: 'etf', assetClass: 'a', valueCents: 80_000 },
      { id: 'b', kind: 'etf', assetClass: 'b', valueCents: 20_000 },
    ];
    const allocation = allocationStatus(positions, [
      { assetClass: 'a', targetBp: 6000 },
      { assetClass: 'b', targetBp: 4000 },
    ]);
    const p = savingsPlanProposal(
      [
        { id: 'pa', name: 'A', kind: 'etf', assetClass: 'a', monthlyCents: 30_000 },
        { id: 'pb', name: 'B', kind: 'etf', assetClass: 'b', monthlyCents: 10_000 },
      ],
      allocation,
      { speculativeBreached: false },
    );
    expect(p.plans.map((x) => [x.proposedCents, x.reason])).toEqual([
      [0, 'paused_r13_over'],
      [40_000, 'steer_r13_under'],
    ]);
  });

  it('breached R15 without a class in need spreads the freed rate over the others by rate', () => {
    const allocation = allocationStatus(POS, [
      { assetClass: 'welt', targetBp: 7000 },
      { assetClass: 'em', targetBp: 500 },
      { assetClass: 'spec', targetBp: 2500 },
    ]);
    const p = savingsPlanProposal(PLANS, allocation, { speculativeBreached: true });
    expect(p.plans.map((x) => x.proposedCents)).toEqual([33_600, 6_400, 0, 0, 0]);
    expect(p.plans[0]!.reason).toBe('redistributed');
    expect(p.plans.reduce((a, x) => a + x.proposedCents, 0)).toBe(40_000);
  });

  it('when every plan is speculative nothing is paused', () => {
    const p = savingsPlanProposal(
      [{ id: 'c', name: 'C', kind: 'crypto', assetClass: 'spec', monthlyCents: 5_000 }],
      allocationStatus(POS, TARGETS),
      { speculativeBreached: true },
    );
    expect(p.changed).toBe(false);
    expect(p.note).toBe('no_eligible_plan');
  });

  it('rejects a non-positive step', () => {
    expect(() =>
      savingsPlanProposal(PLANS, allocationStatus(POS, TARGETS), {
        speculativeBreached: true,
        stepCents: 0,
      }),
    ).toThrow(RangeError);
  });
});
