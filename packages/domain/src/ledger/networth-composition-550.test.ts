import { describe, expect, it } from 'vitest';
import { projectAssetComposition, type CompositionAccount, type NetWorthComponent } from './networth-composition';

const account = (accountId: string, type = 'checking'): CompositionAccount => ({
  accountId, name: accountId, type, role: 'investment', referenceAccountId: null,
});
const component = (accountId: string, valueCents: number | null): NetWorthComponent => ({
  accountId, valueCents, securityId: null, kind: 'cash', quality: valueCents === null ? 'missing' : 'exact', missing: null,
});
function project(components: NetWorthComponent[], totalCents: number | null, accounts = components.map((c) => account(c.accountId))) {
  return projectAssetComposition({ asOf: '2026-02-28', pointKind: 'month_end', components, accounts,
    securityKinds: new Map(), totalCents,
    byAccount: Object.fromEntries(components.map((c) => [c.accountId, c.valueCents])),
  });
}

describe('owner550 signed net-worth composition', () => {
  it('independently partitions10000 minus2000 euros into125% and minus25%', () => {
    const result = project([component('asset', 1_000_000), component('debt', -200_000)], 800_000);
    expect(result.totalCents).toBe(800_000);
    expect(result.groups.map((g) => g.valueCents)).toEqual([1_000_000, 0, 0, 0, 0, -200_000]);
    expect(result.groups.reduce((sum, g) => sum + g.valueCents!, 0)).toBe(800_000);
    expect(result.groups.find((g) => g.key === 'cash')?.shareBp).toBe(12_500);
    expect(result.groups.find((g) => g.key === 'debt')?.shareBp).toBe(-2_500);
  });
  it.each([[10_000, 10_000], [9_999, null], [0, null], [-10_000, null]] as const)(
    'gates net cents%s at the exact100EUR boundary', (net, share) => {
      const result = project([component('a', net)], net);
      expect(result.groups.find((g) => g.valueCents === net)?.shareBp).toBe(share);
    },
  );
  it.each(['stale', 'estimated'] as const)('retains%s euros but never claims complete percentages', (quality) => {
    const result = project([{ ...component('a', 10_000), quality }], 10_000);
    expect(result.groups[0]?.valueCents).toBe(10_000);
    expect(result.complete).toBe(false);
    expect(result.groups.every((g) => g.shareBp === null)).toBe(true);
    expect(result.gaps).toMatchObject([{ accountId: 'a', quality }]);
  });
  it('keeps a missing component null with a separate known subtotal, never zero', () => {
    const result = project([component('known', 10_000), { ...component('missing', null), missing: 'fx' }], null);
    expect(result.totalCents).toBeNull();
    expect(result.knownCents).toBe(10_000);
    expect(result.groups.find((g) => g.key === 'unclassified')).toMatchObject({ valueCents: null, knownCents: 0 });
    expect(result.groups.every((g) => g.shareBp === null)).toBe(true);
    expect(result.gaps).toMatchObject([{ accountId: 'missing', missing: 'fx' }]);
  });
  it('counts reference cash once and retains manual balance-fallback identity', () => {
    const accounts = [account('cash'), { ...account('depot', 'brokerage'), referenceAccountId: 'cash' }, account('manual', 'p2p')];
    const result = project([component('cash', 1_001), { ...component('manual', 7_000), kind: 'manual' }], 8_001, accounts);
    expect(result.groups.find((g) => g.key === 'depot_cash')?.valueCents).toBe(1_001);
    expect(result.groups.find((g) => g.key === 'other')?.valueCents).toBe(7_000);
    expect(result.knownCents).toBe(8_001);
  });
  it('suppresses only a new overflowing group while authoritative accounts remain safe', () => {
    const max = Number.MAX_SAFE_INTEGER;
    const result = project([component('a', max), component('b', max), component('c', -max)], max);
    expect(result.unavailable).toBe('calculation_limit');
    expect(result.groups[0]).toMatchObject({ valueCents: null, unavailable: 'result_limit' });
    expect(result.accounts.map((a) => a.valueCents)).toEqual([max, max, -max]);
    expect(result.groups.every((g) => g.shareBp === null)).toBe(true);
  });
});
