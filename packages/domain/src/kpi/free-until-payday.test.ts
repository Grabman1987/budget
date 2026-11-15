import { describe, expect, it } from 'vitest';
import { freeUntilPayday, type FreeAccount } from './free-until-payday';

const acc = (
  id: string,
  balanceCents: number,
  overdraftLimitCents: number | null,
): FreeAccount => ({ id, name: id, balanceCents, overdraftLimitCents });
const base = { payday: '2026-09-30', today: '2026-09-17', precision: 'cent' as const };

describe('freeUntilPayday as cash flow', () => {
  it('balance + expected inflows - open outflows, only items before payday', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', 200_000, null)],
      expectedInflows: [
        { id: 'i1', label: 'Erstattung', day: '2026-09-20', cents: 5000 },
        { id: 'i2', label: 'Gehalt', day: '2026-09-30', cents: 300_000 },
      ],
      openOutflows: [
        { id: 'o1', label: 'Strom', day: '2026-09-25', cents: 10_500 },
        { id: 'o2', label: 'Miete', day: '2026-10-01', cents: 80_000 },
      ],
    });
    expect(r.balanceCents).toBe(200_000);
    expect(r.inflowCents).toBe(5000);
    expect(r.openCents).toBe(10_500);
    expect(r.overdraftCents).toBe(0);
    expect(r.freeCents).toBe(194_500);
    expect(r.daysToPayday).toBe(13);
    expect(r.chain.map((t) => t.label)).toEqual([
      'Kontostand',
      'erwartete Eingänge',
      'offen bis Gehalt',
      'frei verfügbar',
    ]);
    expect(r.items.inflow.map((i) => i.id)).toEqual(['i1']);
    expect(r.items.open.map((o) => o.id)).toEqual(['o1']);
  });

  it('Dispo on: the limit counts as available money (balance -4000, limit 5000 gives +1000)', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', -400_000, 500_000)],
      expectedInflows: [],
      openOutflows: [],
    });
    expect(r.overdraftCents).toBe(500_000);
    expect(r.freeCents).toBe(100_000);
    expect(r.chain.map((t) => [t.op, t.value])).toEqual([
      [undefined, -400_000],
      ['+', 0],
      ['-', 0],
      ['+', 500_000],
      ['=', 100_000],
    ]);
    expect(r.chain.at(-1)?.result).toBe(true);
  });

  it('Dispo off: a negative balance counts fully negative', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('giro', -400_000, null), acc('bar', 10_000, 0)],
      expectedInflows: [],
      openOutflows: [{ id: 'o', label: 'x', day: '2026-09-20', cents: 1000 }],
    });
    expect(r.overdraftCents).toBe(0);
    expect(r.freeCents).toBe(-391_000);
  });

  it('sums several accounts; only accounts with a limit add headroom; integer cents', () => {
    const r = freeUntilPayday({
      ...base,
      accounts: [acc('a', -1001, 5000), acc('b', 2503, null), acc('c', 99, 1234)],
      expectedInflows: [{ id: 'i', label: 'i', day: '2026-09-18', cents: 7 }],
      openOutflows: [{ id: 'o', label: 'o', day: '2026-09-18', cents: 3 }],
    });
    expect(r.balanceCents).toBe(1601);
    expect(r.overdraftCents).toBe(6234);
    expect(r.freeCents).toBe(1601 + 7 - 3 + 6234);
    expect(Number.isInteger(r.freeCents)).toBe(true);
  });

  it('the whole-euro chain absorbs the rounding gap; empty input is zero', () => {
    const r = freeUntilPayday({
      ...base,
      precision: 'euro',
      accounts: [acc('a', 1049, null)],
      expectedInflows: [{ id: 'i', label: 'i', day: '2026-09-18', cents: 1049 }],
      openOutflows: [],
    });
    expect(r.freeCents).toBe(2098);
    expect(r.chain.map((t) => t.value)).toEqual([1100, 1000, 0, 2100]);
    const empty = freeUntilPayday({ ...base, accounts: [], expectedInflows: [], openOutflows: [] });
    expect(empty.freeCents).toBe(0);
  });
});
