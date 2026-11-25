import { describe, expect, it } from 'vitest';
import { liquidityForecast } from '../forecast/liquidity';
import { addDays } from '../date';
import {
  freeUntilBoundary,
  freeUntilPayday,
  overdraftLastResort,
  type FreeAccount,
} from './free-until-payday';

const acc = (
  id: string,
  balanceCents: number,
  overdraftLimitCents: number | null,
): FreeAccount => ({ id, name: id, balanceCents, overdraftLimitCents });
const base = { payday: '2026-09-30', today: '2026-09-17', precision: 'cent' as const };

describe('freeUntilPayday as cash flow', () => {
  it('balance - open outflows, only items before payday; no inflows', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', 200_000, null)],
      openOutflows: [
        { id: 'o1', label: 'Strom', day: '2026-09-25', cents: 10_500 },
        { id: 'o2', label: 'Miete', day: '2026-10-01', cents: 80_000 },
      ],
    });
    expect(r.balanceCents).toBe(200_000);
    expect(r.openCents).toBe(10_500);
    expect(r.lastResortCents).toBe(0);
    expect(r.freeCents).toBe(189_500);
    expect(r.daysToPayday).toBe(13);
    expect(r.chain.map((t) => t.label)).toEqual([
      'Kontostand',
      'offen bis Gehalt',
      'frei verfügbar',
    ]);
    expect(r.items.open.map((o) => o.id)).toEqual(['o1']);
  });

  it('Dispo on: never free money, shown as the separate last resort (balance -4000, limit 5000)', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', -400_000, 500_000)],
      openOutflows: [],
    });
    expect(r.freeCents).toBe(-400_000);
    expect(r.lastResortCents).toBe(100_000);
    expect(r.chain.map((t) => [t.op, t.value])).toEqual([
      [undefined, -400_000],
      ['-', 0],
      ['=', -400_000],
    ]);
    expect(r.chain.at(-1)?.result).toBe(true);
  });

  it('Dispo off: a negative balance counts fully negative', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', -400_000, null), acc('bar', 10_000, 0)],
      openOutflows: [{ id: 'o', label: 'x', day: '2026-09-20', cents: 1000 }],
    });
    expect(r.lastResortCents).toBe(0);
    expect(r.freeCents).toBe(-391_000);
  });

  it('last resort is the unused limit per account, never below 0; closed lenders are not passed', () => {
    expect(
      overdraftLastResort([acc('a', -1001, 5000), acc('b', 2503, null), acc('c', 99, 1234)]),
    ).toBe(3999 + 1234);
    expect(overdraftLastResort([acc('x', -9000, 5000)])).toBe(0);
    expect(Number.isInteger(overdraftLastResort([acc('a', -1, 3)]))).toBe(true);
  });

  it('sums several accounts in integer cents', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('a', -1001, 5000), acc('b', 2503, null), acc('c', 99, 1234)],
      openOutflows: [{ id: 'o', label: 'o', day: '2026-09-18', cents: 3 }],
    });
    expect(r.balanceCents).toBe(1601);
    expect(r.freeCents).toBe(1601 - 3);
    expect(r.lastResortCents).toBe(3999 + 1234);
  });

  it('retains cents for legacy euro callers; empty input is zero', () => {
    const r = freeUntilPayday({
      ...base,
      precision: 'euro',
      accounts: [acc('a', 1049, null)],
      openOutflows: [{ id: 'o', label: 'o', day: '2026-09-18', cents: 1049 }],
    });
    expect(r.freeCents).toBe(0);
    expect(r.chain.map((t) => t.value)).toEqual([1049, 1049, 0]);
    const empty = freeUntilPayday({ ...base, accounts: [], openOutflows: [] });
    expect(empty.freeCents).toBe(0);
  });
});

describe('freeUntilPayday and liquidityForecast share their inputs (#1227)', () => {
  it('agree on the balance before the next payday when no inflow is expected', () => {
    const accounts = [acc('giro', 123_456, 300_000), acc('bar', 7_001, null)];
    const outflows = [
      { id: 'o1', label: 'Strom', day: '2026-09-18', cents: 10_501 },
      { id: 'o2', label: 'Miete', day: '2026-09-29', cents: 80_000 },
      { id: 'o3', label: 'Nach dem Gehalt', day: '2026-09-30', cents: 55_555 },
    ];
    const lead = freeUntilPayday({ ...base, accounts, openOutflows: outflows });
    const forecast = liquidityForecast({
      startDay: base.today,
      startCents: accounts.reduce((s, a) => s + a.balanceCents, 0),
      days: 20,
      items: outflows.map((o) => ({ day: o.day, cents: -o.cents, kind: 'fixed' as const })),
      variablePerDay: () => 0,
    });
    const eve = forecast.days.find((d) => d.day === addDays(base.payday, -1));
    expect(eve?.balanceCents).toBe(lead.freeCents);
    // the overdraft is neither in the forecast balance nor in the free figure
    expect(lead.lastResortCents).toBe(300_000);
  });
});

it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid cents %s at every entry',
  (invalid) => {
    expect(() => overdraftLastResort([acc('x', invalid, null)])).toThrow(RangeError);
    expect(() => overdraftLastResort([acc('x', 0, invalid)])).toThrow(RangeError);
    expect(() =>
      freeUntilPayday({ ...base, accounts: [acc('x', invalid, null)], openOutflows: [] }),
    ).toThrow(RangeError);
    expect(() =>
      freeUntilPayday({
        ...base,
        accounts: [],
        openOutflows: [{ id: 'x', label: 'x', day: '2027-01-01', cents: invalid }],
      }),
    ).toThrow(RangeError);
  },
);

it('keeps the default lead chain at cent precision', () => {
  const r = freeUntilPayday({
    today: base.today,
    payday: base.payday,
    accounts: [acc('x', 1001, null)],
    openOutflows: [{ id: 'x', label: 'x', day: base.today, cents: 103 }],
  });
  expect(r.chain.map((t) => t.value)).toEqual([1001, 103, 898]);
});

describe('freeUntilBoundary monthEnd ("Frei bis Monatsende")', () => {
  const monthEnd = { day: '2026-11-30', kind: 'monthEnd' as const };
  const input = { today: '2026-11-25', boundary: monthEnd };

  it('counts outflows through the last day, excludes the following month; no inflows', () => {
    const r = freeUntilBoundary({
      ...input,
      accounts: [acc('giro', 200_000, null)],
      openOutflows: [
        { id: 'a', label: 'Strom', day: '2026-11-26', cents: 10_000 },
        { id: 'b', label: 'Letzter', day: '2026-11-30', cents: 5_000 },
        { id: 'c', label: 'Miete', day: '2026-12-01', cents: 80_000 },
        { id: 'd', label: 'Gehaltstag', day: '2026-12-15', cents: 1_000 },
      ],
    });
    expect(r.openCents).toBe(15_000);
    expect(r.freeCents).toBe(185_000);
    expect(r.items.open.map((o) => o.id)).toEqual(['a', 'b']);
    expect(r.boundary).toEqual(monthEnd);
    // Today and the last day both count: 25.-30. = 6 days.
    expect(r.daysToBoundary).toBe(6);
    expect(r.chain.map((t) => t.label)).toEqual([
      'Kontostand',
      'offen bis Monatsende',
      'frei verfügbar',
    ]);
  });

  it('counts an overdue outflow exactly once and keeps the Dispo out of free money', () => {
    const r = freeUntilBoundary({
      ...input,
      accounts: [acc('giro', 50_000, 100_000)],
      openOutflows: [{ id: 'late', label: 'Überfällig', day: '2026-11-10', cents: 20_000 }],
    });
    expect(r.openCents).toBe(20_000);
    expect(r.freeCents).toBe(30_000);
    expect(r.lastResortCents).toBe(100_000);
  });

  it('is one day on the last day of the month, and payday kind equals freeUntilPayday', () => {
    expect(
      freeUntilBoundary({
        today: '2026-11-30',
        boundary: monthEnd,
        accounts: [],
        openOutflows: [],
      }).daysToBoundary,
    ).toBe(1);
    const args = {
      accounts: [acc('giro', 200_000, null)],
      openOutflows: [{ id: 'o', label: 'x', day: '2026-12-02', cents: 1_000 }],
      today: '2026-11-25',
    };
    const viaPayday = freeUntilPayday({ ...args, payday: '2026-12-15' });
    const viaBoundary = freeUntilBoundary({
      ...args,
      boundary: { day: '2026-12-15', kind: 'payday' },
    });
    expect(viaBoundary.freeCents).toBe(viaPayday.freeCents);
    expect(viaBoundary.daysToBoundary).toBe(viaPayday.daysToPayday);
    expect(Object.keys(viaPayday)).toEqual([
      'balanceCents',
      'openCents',
      'lastResortCents',
      'freeCents',
      'daysToPayday',
      'chain',
      'items',
    ]);
  });
});
