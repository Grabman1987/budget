import { describe, expect, it } from 'vitest';
import {
  expectedIncome,
  incomeLineStatus,
  incomeWindow,
  monthFindings,
  monthIncomeOf,
  monthResult,
  moneyFlow,
  planSummary,
  sharesOf,
  topSpending,
  type IncomeFact,
} from './month';

const fact = (over: Partial<IncomeFact> & Pick<IncomeFact, 'month' | 'cents'>): IncomeFact => ({
  typeId: 'gehalt',
  typeName: 'Gehalt',
  kind: 'earned',
  sortOrder: 1,
  ...over,
});

describe('monthIncomeOf: household income, Kapitalerträge and refunds apart', () => {
  const facts: IncomeFact[] = [
    fact({ month: '2026-08', cents: 300_000 }),
    fact({
      month: '2026-08',
      cents: 100_000,
      typeId: 'beitrag',
      typeName: 'Beitrag',
      sortOrder: 3,
    }),
    fact({
      month: '2026-08',
      cents: 5_000,
      typeId: 'kap',
      typeName: 'Kapitalerträge',
      kind: 'capital',
    }),
    fact({
      month: '2026-08',
      cents: 7_000,
      typeId: 'erst',
      typeName: 'Erstattungen',
      kind: 'refund',
    }),
    fact({ month: '2026-08', cents: 20_000, typeId: 'sonder', typeName: 'Sonder', sortOrder: 2 }),
    fact({ month: '2026-07', cents: 250_000 }),
  ];

  it('keeps Kapitalerträge and refunds out of the household income', () => {
    const m = monthIncomeOf(facts, '2026-08');
    expect(m.earnedCents).toBe(420_000);
    expect(m.capitalCents).toBe(5_000);
    expect(m.refundCents).toBe(7_000);
    expect(m.types.map((t) => t.name)).toEqual(['Gehalt', 'Sonder', 'Beitrag']);
  });

  it('merges several bookings of one type and leaves other months out', () => {
    const m = monthIncomeOf([...facts, fact({ month: '2026-08', cents: 1_000 })], '2026-08');
    expect(m.types[0]).toEqual({ typeId: 'gehalt', name: 'Gehalt', cents: 301_000 });
    expect(monthIncomeOf(facts, '2026-07').earnedCents).toBe(250_000);
  });

  it('a month without income is empty, not an error', () => {
    expect(monthIncomeOf(facts, '2026-01')).toEqual({
      month: '2026-01',
      types: [],
      earnedCents: 0,
      capitalCents: 0,
      refundCents: 0,
    });
  });

  it('an income booking without a type is household income under its own label', () => {
    const m = monthIncomeOf(
      [fact({ month: '2026-08', cents: 900, typeId: null, typeName: 'Ohne Einnahmenart' })],
      '2026-08',
    );
    expect(m.types).toEqual([{ typeId: null, name: 'Ohne Einnahmenart', cents: 900 }]);
  });
});

describe('sharesOf', () => {
  it('adds up to exactly 100 (largest remainder)', () => {
    expect(sharesOf([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf([5_000, 3_000, 2_000]).reduce((a, v) => a + v, 0)).toBe(100);
    expect(sharesOf([333, 333, 334]).reduce((a, v) => a + v, 0)).toBe(100);
  });
  it('is all zero without a positive sum', () => {
    expect(sharesOf([])).toEqual([]);
    expect(sharesOf([0, -5])).toEqual([0, 0]);
  });
});

describe('incomeWindow: 12 months by type', () => {
  const m = (month: string, gehalt: number, kap: number, extra?: number) =>
    monthIncomeOf(
      [
        fact({ month, cents: gehalt }),
        ...(kap
          ? [fact({ month, cents: kap, typeId: 'kap', typeName: 'Kap', kind: 'capital' as const })]
          : []),
        ...(extra
          ? [fact({ month, cents: extra, typeId: 'neben', typeName: 'Neben', sortOrder: 4 })]
          : []),
      ],
      month,
    );

  it('sums, averages and shares per type; Kapitalerträge are separate', () => {
    const w = incomeWindow([
      m('2026-06', 300_000, 0),
      m('2026-07', 300_000, 4_000, 100_000),
      m('2026-08', 300_000, 6_000),
    ]);
    const gehalt = w.rows.find((r) => r.name === 'Gehalt')!;
    expect(gehalt).toMatchObject({ sumCents: 900_000, averageCents: 300_000, monthCents: 300_000 });
    const neben = w.rows.find((r) => r.name === 'Neben')!;
    expect(neben).toMatchObject({ sumCents: 100_000, monthCents: 0, averageCents: 33_333 });
    expect(w.rows.reduce((a, r) => a + r.sharePercent, 0)).toBe(100);
    expect(w.totalCents).toBe(1_000_000);
    expect(w.totalMonthCents).toBe(300_000);
    expect(w.capital).toEqual({
      monthCents: 6_000,
      perMonth: [0, 4_000, 6_000],
      sumCents: 10_000,
      averageCents: 3_333,
    });
  });

  it('works for a window without any income', () => {
    const w = incomeWindow([monthIncomeOf([], '2026-08')]);
    expect(w.rows).toEqual([]);
    expect(w.totalCents).toBe(0);
  });
});

describe('expected income against received', () => {
  const base = { paymentId: 'p', name: 'Gehalt', sub: 'Arbeitgeber', typeId: 'gehalt' };

  it('maps the occurrence state and the due date to a status', () => {
    expect(incomeLineStatus({ status: 'received', dueDate: '2026-09-30' }, '2026-09-17')).toBe(
      'ok',
    );
    expect(incomeLineStatus({ status: 'deviating', dueDate: '2026-09-01' }, '2026-09-17')).toBe(
      'diff',
    );
    expect(incomeLineStatus({ status: 'missed', dueDate: '2026-09-01' }, '2026-09-17')).toBe(
      'missing',
    );
    expect(incomeLineStatus({ status: 'expected', dueDate: '2026-09-30' }, '2026-09-17')).toBe(
      'pending',
    );
    expect(incomeLineStatus({ status: 'expected', dueDate: '2026-09-17' }, '2026-09-17')).toBe(
      'overdue',
    );
  });

  it('counts what is still ahead and shows income without an expected payment', () => {
    const r = expectedIncome({
      today: '2026-09-17',
      expected: [
        {
          ...base,
          dueDate: '2026-09-30',
          status: 'expected',
          expectedCents: 300_000,
          receivedCents: 0,
        },
        {
          ...base,
          paymentId: 'b',
          name: 'Beitrag',
          typeId: 'beitrag',
          dueDate: '2026-09-01',
          status: 'received',
          expectedCents: 80_000,
          receivedCents: 80_000,
        },
      ],
      booked: [
        { typeId: 'beitrag', name: 'Beiträge', cents: 80_000 },
        { typeId: 'neben', name: 'Nebeneinkünfte', cents: 25_000 },
      ],
    });
    expect(r.pendingCount).toBe(1);
    expect(r.pendingCents).toBe(300_000);
    expect(r.missingCount).toBe(0);
    expect(r.unlinkedCount).toBe(0);
    expect(r.lines.map((l) => [l.name, l.status])).toEqual([
      ['Beitrag', 'ok'],
      ['Gehalt', 'pending'],
      ['Nebeneinkünfte', 'unplanned'],
    ]);
  });

  it('a deviating payment carries its difference; a gap counts as missing', () => {
    const r = expectedIncome({
      today: '2026-09-17',
      expected: [
        {
          ...base,
          dueDate: '2026-09-05',
          status: 'deviating',
          expectedCents: 100_000,
          receivedCents: 98_000,
        },
        {
          ...base,
          paymentId: 'x',
          name: 'Miete',
          dueDate: '2026-09-02',
          status: 'missed',
          expectedCents: 50_000,
          receivedCents: 0,
        },
      ],
      booked: [{ typeId: 'gehalt', name: 'Gehalt', cents: 98_000 }],
    });
    const diff = r.lines.find((l) => l.status === 'diff')!;
    expect(diff.differenceCents).toBe(-2_000);
    expect(r.missingCount).toBe(1);
    expect(r.lines.some((l) => l.status === 'unplanned')).toBe(false);
  });

  it('leaves expected Kapitalerträge and refunds out of the table', () => {
    const r = expectedIncome({
      today: '2026-09-17',
      expected: [
        {
          ...base,
          paymentId: 'k',
          name: 'Ausschüttung',
          typeId: 'kap',
          dueDate: '2026-09-15',
          status: 'received',
          expectedCents: 5_000,
          receivedCents: 5_000,
        },
      ],
      booked: [],
      excludedTypeIds: new Set(['kap', 'erst']),
    });
    expect(r.lines).toEqual([]);
  });
});

describe('expected income without a match', () => {
  it('an unlinked due payment is counted and keeps the booked income of its type from being unplanned', () => {
    const r = expectedIncome({
      today: '2026-09-17',
      expected: [
        {
          paymentId: 'p',
          name: 'Beitrag',
          sub: '',
          typeId: 'beitrag',
          dueDate: '2026-09-01',
          status: 'unlinked',
          expectedCents: 80_000,
          receivedCents: 0,
        },
      ],
      booked: [{ typeId: 'beitrag', name: 'Beiträge', cents: 80_000 }],
    });
    expect(r.unlinkedCount).toBe(1);
    expect(r.missingCount).toBe(0);
    expect(r.lines.map((l) => l.status)).toEqual(['unlinked']);
  });
});

describe('monthResult', () => {
  it('Gespart, Übrig and the savings rate of household income', () => {
    const r = monthResult({
      earnedCents: 400_000,
      consumptionCents: 250_000,
      futureCents: 100_000,
    });
    expect(r).toMatchObject({ savedCents: 150_000, restCents: 50_000, savingsRateBp: 3_750 });
  });
  it('a month that spends more than it earns has a negative rest and rate', () => {
    const r = monthResult({ earnedCents: 200_000, consumptionCents: 250_000, futureCents: 0 });
    expect(r).toMatchObject({ savedCents: -50_000, restCents: -50_000, savingsRateBp: -2_500 });
  });
  it('has no rate without income', () => {
    expect(
      monthResult({ earnedCents: 0, consumptionCents: 100, futureCents: 0 }).savingsRateBp,
    ).toBeNull();
  });
});

describe('topSpending and planSummary', () => {
  const f = (
    id: string,
    cents: number,
    previousCents: number,
    cls: 'need' | 'want' | 'future' = 'need',
  ) => ({
    id,
    name: id.toUpperCase(),
    class: cls,
    kind: 'variable',
    cents,
    previousCents,
  });
  it('ranks Bedarf and Wunsch by amount and leaves Zukunft out', () => {
    const rows = topSpending(
      [f('a', 100, 150), f('b', 900, 400, 'want'), f('c', 5_000, 0, 'future'), f('d', 0, 10)],
      2,
    );
    expect(rows.map((r) => [r.id, r.deltaCents])).toEqual([
      ['b', 500],
      ['a', -50],
    ]);
  });
  it('lists the overspent categories, the largest first', () => {
    const s = planSummary([
      { id: 'a', name: 'A', budgetedCents: 1_000, spentCents: 900, overspentCents: 0 },
      { id: 'b', name: 'B', budgetedCents: 500, spentCents: 800, overspentCents: 300 },
      { id: 'c', name: 'C', budgetedCents: 0, spentCents: 50, overspentCents: 50 },
      { id: 'd', name: 'D', budgetedCents: 0, spentCents: 0, overspentCents: 0 },
    ]);
    expect(s.total).toBe(3);
    expect(s.over.map((x) => x.id)).toEqual(['b', 'c']);
  });
});

describe('monthFindings', () => {
  const money = (c: number) => `${c / 100} €`;
  const none = {
    money,
    open: null,
    specialIncomeCents: 0,
    salaryChangeCents: null,
    priceChanges: [],
    periodicPaid: [],
    jump: null,
    overPlan: null,
  };
  it('a quiet month has no findings', () => {
    expect(monthFindings(none)).toEqual([]);
  });
  it('orders and limits the findings', () => {
    const f = monthFindings({
      ...none,
      open: { day: '17.09.', pendingCents: 380_000, pendingCount: 2 },
      specialIncomeCents: 200_000,
      salaryChangeCents: 15_000,
      priceChanges: [
        {
          name: 'Strom',
          oldYearlyCents: 120_000,
          newYearlyCents: 132_000,
          oldMonthlyCents: 10_000,
          newMonthlyCents: 11_000,
        },
      ],
      periodicPaid: [{ name: 'Versicherung', cents: 40_000 }],
      jump: { name: 'Essen', deltaCents: 6_000, previousMonthName: 'August' },
      overPlan: { count: 2, topName: 'Freizeit', topCents: 3_000 },
    });
    expect(f).toHaveLength(5);
    expect(f[0]).toMatchObject({ rule: 'R04', cents: 380_000 });
    expect(f[3]).toMatchObject({
      text: 'Strom teurer: 100 € → 110 € je Monat',
      cents: 12_000,
      suffix: 'p. a.',
    });
    expect(f[4]).toMatchObject({
      text: 'Versicherung fällig, aus der Rücklage bezahlt',
      cents: -40_000,
    });
  });
  it('ignores a small jump', () => {
    expect(
      monthFindings({
        ...none,
        jump: { name: 'Essen', deltaCents: 3_999, previousMonthName: 'August' },
      }),
    ).toEqual([]);
  });
});

describe('moneyFlow', () => {
  const income = [
    { typeId: 'g', name: 'Gehalt', cents: 380_000 },
    { typeId: 'b', name: 'Beiträge von Kontakten', cents: 80_000 },
    { typeId: 'x', name: 'Geschenke', cents: 3_000 },
  ];
  const classes = [
    {
      class: 'need' as const,
      groups: [
        { name: 'Wohnen', cents: 150_000 },
        { name: 'Lebensmittel', cents: 60_000 },
        { name: 'Kleinkram', cents: 4_000 },
      ],
    },
    { class: 'want' as const, groups: [{ name: 'Freizeit', cents: 80_000 }] },
    { class: 'future' as const, groups: [{ name: 'Investieren', cents: 100_000 }] },
  ];

  it('Einnahmen + Kapitalerträge − Klassen = Übrig, and every column adds up', () => {
    const f = moneyFlow({ income, capitalCents: 6_000, classes });
    expect(f.earnedCents).toBe(463_000);
    expect(f.totalCents).toBe(469_000);
    expect(f.spentCents).toBe(394_000);
    expect(f.restCents).toBe(75_000);
    const sum = (n: { cents: number }[]) => n.reduce((a, x) => a + x.cents, 0);
    expect(sum(f.columns.income)).toBe(f.totalCents);
    expect(sum(f.columns.pool)).toBe(f.totalCents);
    expect(sum(f.columns.classes)).toBe(f.totalCents);
    const chain = f.chain;
    expect(chain.map((c) => c.label)).toEqual([
      'Einnahmen',
      'Kapitalerträge',
      'Bedarf',
      'Wunsch',
      'Zukunft',
      'Übrig',
    ]);
    expect(
      chain.reduce(
        (a, c, i) => (i === chain.length - 1 ? a : a + (c.op === '-' ? -c.cents : c.cents)),
        0,
      ),
    ).toBe(chain[chain.length - 1]!.cents);
  });

  it('keeps Kapitalerträge as a labelled node of its own, even when tiny', () => {
    const f = moneyFlow({ income, capitalCents: 100, classes });
    expect(f.columns.income.find((n) => n.id === 'i:kapital')).toMatchObject({
      name: 'Kapitalerträge',
      tone: 'cap',
      cents: 100,
    });
  });

  it('folds slivers of income and of groups into labelled nodes', () => {
    const f = moneyFlow({ income, capitalCents: 0, classes });
    expect(f.columns.income.map((n) => n.name)).toEqual([
      'Gehalt',
      'Beiträge von Kontakten',
      'Geschenke',
    ]);
    const tiny = moneyFlow({
      income: [...income, { typeId: 'y', name: 'Sonstiges', cents: 2_000 }],
      capitalCents: 0,
      classes,
    });
    expect(tiny.columns.income.map((n) => n.name)).toContain('Weitere Einnahmen');
    expect(f.columns.groups.map((n) => n.name)).toContain('Weiterer Bedarf');
    expect(f.columns.groups.find((n) => n.name === 'Weiterer Bedarf')!.cents).toBe(4_000);
    const total = (cls: string) =>
      f.columns.groups.filter((n) => n.tone === cls).reduce((a, n) => a + n.cents, 0);
    expect(total('need')).toBe(214_000);
  });

  it('spending above income comes from savings: Aus Guthaben and a Verfügbar pool', () => {
    const f = moneyFlow({
      income: [{ typeId: 'g', name: 'Gehalt', cents: 100_000 }],
      capitalCents: 0,
      classes: [{ class: 'need', groups: [{ name: 'Wohnen', cents: 130_000 }] }],
    });
    expect(f.restCents).toBe(-30_000);
    expect(f.columns.income.at(-1)).toMatchObject({ name: 'Aus Guthaben', cents: 30_000 });
    expect(f.columns.pool[0]).toMatchObject({ name: 'Verfügbar', cents: 130_000 });
    expect(f.columns.classes.map((n) => n.name)).toEqual(['Bedarf']);
    expect(f.chain.at(-1)).toMatchObject({ label: 'Aus Guthaben', cents: -30_000 });
  });

  it('the parts list shares add up to 100 and end with Übrig', () => {
    const f = moneyFlow({ income, capitalCents: 6_000, classes });
    expect(f.table.reduce((a, r) => a + r.sharePercent, 0)).toBe(100);
    expect(f.table.at(-1)).toMatchObject({ class: 'rest', name: 'Übrig' });
    expect(f.table[0]).toMatchObject({ class: 'need', name: 'Wohnen' });
  });

  it('an empty month has no nodes', () => {
    const f = moneyFlow({ income: [], capitalCents: 0, classes: [] });
    expect(f.columns.pool).toEqual([]);
    expect(f.columns.income).toEqual([]);
    expect(f.links).toEqual([]);
    expect(f.table).toEqual([]);
  });
});
