import { describe, expect, it } from 'vitest';
import {
  projectAssetComposition,
  type CompositionAccount,
  type NetWorthComponent,
} from './networth-composition';

const account = (
  accountId: string,
  type = 'checking',
  referenceAccountId: string | null = null,
): CompositionAccount => ({
  accountId,
  name: accountId,
  type,
  role: 'investment',
  referenceAccountId,
});
const component = (
  accountId: string,
  valueCents: number | null,
  extra: Partial<NetWorthComponent> = {},
): NetWorthComponent => ({
  accountId,
  valueCents,
  securityId: null,
  kind: 'cash',
  quality: 'exact',
  missing: null,
  ...extra,
});
function project(
  components: NetWorthComponent[],
  totalCents: number | null,
  accounts = components.map((c) => account(c.accountId)),
  securityKinds = new Map<string, string>(),
) {
  return projectAssetComposition({
    asOf: '2026-02-28',
    pointKind: 'as_of',
    components,
    accounts,
    securityKinds,
    totalCents,
    byAccount: Object.fromEntries(components.map((c) => [c.accountId, c.valueCents])),
  });
}

describe('asset composition owner contract #550', () => {
  it('uses signed net worth: EUR 10,000 assets and EUR -2,000 debt are 125% and -25%', () => {
    const point = project([component('cash', 1_000_000), component('loan', -200_000)], 800_000);
    expect(point.groups.map((g) => [g.key, g.valueCents, g.shareBp])).toEqual([
      ['cash', 1_000_000, 12_500],
      ['securities', 0, 0],
      ['depot_cash', 0, 0],
      ['crypto', 0, 0],
      ['other', 0, 0],
      ['debt', -200_000, -2_500],
    ]);
    expect(point.totalCents).toBe(800_000);
    expect(point.knownCents).toBe(800_000);
  });

  it.each([-10_000, 0, 9_999])(
    'suppresses shares below the EUR 100 threshold (%i cents)',
    (total) => {
      const point = project([component('cash', total)], total);
      expect(point.complete).toBe(true);
      expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
      expect(point.accounts[0]?.shareBp).toBeNull();
    },
  );

  it('includes the exact EUR 100 boundary', () => {
    expect(project([component('cash', 10_000)], 10_000).groups[0]?.shareBp).toBe(10_000);
  });

  it.each(['stale', 'estimated', 'missing'] as const)(
    'retains the known amount but suppresses every share for %s quality',
    (quality) => {
      const point = project([component('cash', 20_000, { quality })], 20_000);
      expect(point.complete).toBe(false);
      expect(point.groups[0]?.valueCents).toBe(20_000);
      expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
      expect(point.gaps).toEqual([{ accountId: 'cash', securityId: null, quality, missing: null }]);
    },
  );

  it('keeps unknown values as gaps with a literal known subtotal, never a zero holding', () => {
    const point = project(
      [
        component('cash', 20_000),
        component('depot', null, {
          kind: 'holding',
          securityId: 'unknown',
          quality: 'missing',
          missing: 'price',
        }),
      ],
      20_000,
    );
    expect(point.totalCents).toBeNull();
    expect(point.knownCents).toBe(20_000);
    expect(point.groups.at(-1)).toMatchObject({
      key: 'unclassified',
      valueCents: null,
      knownCents: 0,
      unavailable: 'missing_value',
      shareBp: null,
    });
    expect(point.accounts[1]).toMatchObject({ valueCents: null, knownCents: 0 });
    expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
  });

  it('partitions actual security kinds, manual fallback, reference cash and unsupported metadata once', () => {
    const components = [
      component('cash', 100),
      component('ref', 200),
      component('dep', 300, { kind: 'holding', securityId: 'stock' }),
      component('crypto', 400, { kind: 'holding', securityId: 'coin' }),
      component('p2p', 500, { kind: 'manual' }),
      component('unsupported', 600, { kind: 'holding', securityId: 'unknown' }),
      component('debt', -100),
    ];
    const point = project(
      components,
      2_000,
      [
        account('cash'),
        account('ref'),
        account('dep', 'brokerage', 'ref'),
        account('crypto', 'crypto'),
        account('p2p', 'p2p'),
        account('unsupported', 'brokerage'),
        account('debt', 'loan'),
      ],
      new Map([
        ['stock', 'etf'],
        ['coin', 'crypto'],
      ]),
    );
    expect(point.groups.map((g) => [g.key, g.valueCents])).toEqual([
      ['cash', 100],
      ['securities', 300],
      ['depot_cash', 200],
      ['crypto', 400],
      ['other', 500],
      ['debt', -100],
      ['unclassified', 600],
    ]);
    expect(point.knownCents).toBe(2_000);
    expect(point.groups[2]?.accounts).toHaveLength(1);
  });

  it('isolates new group result overflow while retaining safe authoritative totals and accounts', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const point = project([component('a', max), component('b', max), component('c', -max)], max);
    expect(point).toMatchObject({
      totalCents: max,
      knownCents: max,
      complete: false,
      unavailable: 'calculation_limit',
    });
    expect(point.groups[0]).toMatchObject({
      valueCents: null,
      knownCents: null,
      unavailable: 'result_limit',
    });
    expect(point.accounts.map((a) => a.valueCents)).toEqual([max, max, -max]);
    expect(point.groups.every((g) => g.shareBp === null)).toBe(true);
    expect(point.accounts.every((a) => a.shareBp === null)).toBe(true);
  });

  it('does not swallow invalid producer operands', () => {
    expect(() => project([component('bad', Number.MAX_SAFE_INTEGER + 1)], 1)).toThrow();
  });
});
