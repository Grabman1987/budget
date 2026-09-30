import { describe, expect, it } from 'vitest';
import { nextMonth } from '../date';
import {
  budgetMonths,
  splitEffect,
  toBeAssignedFlow,
  type BudgetInput,
  type LedgerAccount,
  type LedgerCategory,
  type LedgerSplit,
} from './budget';

const eur = (v: number) => Math.round(v * 100);
const month = (input: BudgetInput, m: string) => {
  const found = budgetMonths(input).find((b) => b.month === m);
  if (!found) throw new Error(`no month ${m}`);
  return found;
};

describe('September 2026 of the prototype (design/prototype/plan.js)', () => {
  // [carry, assigned, activity] in euros, copied from plan.js `SEP.rows`; kind per CATS.
  const rows: Record<string, [number, number, number, string]> = {
    miete: [0, 890, -890, 'fixed'],
    strom: [0, 105, 0, 'fixed'],
    internet: [0, 60, -60, 'fixed'],
    kreditrate: [0, 412, -412, 'debt'],
    kfzvers: [0, 48, -48, 'fixed'],
    mobilfunk: [0, 25, 0, 'fixed'],
    streaming: [0, 17.99, 0, 'fixed'],
    lebensmittel: [28, 572, -388, 'variable'],
    treibstoff: [0, 140, -152.4, 'variable'],
    oeffis: [0, 45, 0, 'variable'],
    haushalt: [0, 120, -35.5, 'variable'],
    gesundheit: [80, 40, 0, 'variable'],
    kleidung: [200, 50, -30, 'variable'],
    lieferdienste: [0, 80, -62, 'variable'],
    freizeit: [0, 120, -56, 'variable'],
    essen: [0, 150, -121, 'variable'],
    hobby: [46.59, 50, 0, 'variable'],
    puffer: [1100, 300, 0, 'periodic'],
    hhvers: [283.5, 40.5, 0, 'periodic'],
    kfzservice: [250, 50, 0, 'periodic'],
    weihnachten: [200, 50, 0, 'periodic'],
    reisen: [100, 150, 0, 'periodic'],
    geschenke: [17.01, 20, 0, 'periodic'],
    notgroschen: [6300, 500, 0, 'saving'],
    sondertilgung: [0, 300, 0, 'debt'],
    fahrrad: [400, 100, 0, 'saving'],
    notgroschenziel: [0, 0, 0, 'saving'],
    etf: [0, 176.51, -176.51, 'invest'],
  };
  const ids = Object.keys(rows);
  const carryTotal = ids.reduce((a, id) => a + eur(rows[id]![0]), 0);
  const input: BudgetInput = {
    // The current account holds exactly the carried envelopes on 01.09.
    accounts: [
      { id: 'giro', onBudget: true, openingBalanceCents: carryTotal, openingDate: '2026-09-01' },
    ],
    categories: ids.map((id) => ({ id, kind: rows[id]![3] })),
    splits: [
      { accountId: 'giro', date: '2026-09-01', amountCents: eur(3812), categoryId: null },
      { accountId: 'giro', date: '2026-09-01', amountCents: eur(800), categoryId: null },
      ...ids
        .filter((id) => rows[id]![2] !== 0)
        .map((id) => ({
          accountId: 'giro',
          date: '2026-09-10',
          amountCents: eur(rows[id]![2]),
          categoryId: id,
        })),
      { accountId: 'giro', date: '2026-10-01', amountCents: eur(3812), categoryId: null },
      { accountId: 'giro', date: '2026-10-01', amountCents: eur(800), categoryId: null },
    ],
    months: ['2026-09', '2026-10'],
    assigned: { '2026-09': Object.fromEntries(ids.map((id) => [id, eur(rows[id]![1])])) },
    openingCarry: Object.fromEntries(ids.map((id) => [id, eur(rows[id]![0])])),
  };

  it('available = carry + assigned + activity for every row', () => {
    const sep = month(input, '2026-09');
    for (const id of ids)
      expect(sep.envelopes[id]?.availableCents, id).toBe(
        eur(rows[id]![0] + rows[id]![1] + rows[id]![2]),
      );
    expect(sep.envelopes['lebensmittel']?.availableCents).toBe(21200);
    expect(sep.envelopes['treibstoff']?.availableCents).toBe(-1240);
  });

  it('"Zu verteilen" is income minus assigned, as in the prototype (carryIn 0)', () => {
    const sep = month(input, '2026-09');
    const assigned = ids.reduce((a, id) => a + eur(rows[id]![1]), 0);
    expect(sep.toBeAssignedCents).toBe(eur(3812 + 800) - assigned);
  });

  it('October: positive envelopes carry over, the 12,40 € overspending reduces "Zu verteilen"', () => {
    const [sep, oct] = budgetMonths(input);
    expect(oct!.envelopes['lebensmittel']?.carryCents).toBe(21200);
    expect(oct!.envelopes['hobby']?.carryCents).toBe(9659);
    expect(oct!.envelopes['treibstoff']?.carryCents).toBe(0);
    expect(oct!.uncoveredCents).toBe(1240);
    expect(oct!.toBeAssignedCents).toBe(sep!.toBeAssignedCents + eur(3812 + 800) - 1240);
    // Deviation from plan.js: the prototype resets fixed/invest/debt envelopes to 0 at month end;
    // concept §5.3 (and YNAB) carry every positive balance, e.g. the unpaid electricity bill.
    expect(oct!.envelopes['strom']?.carryCents).toBe(10500);
  });
});

describe('a YNAB-style month: card spending, a card payment, investing from the budget', () => {
  const accounts: LedgerAccount[] = [
    { id: 'giro', onBudget: true, openingBalanceCents: 100000, openingDate: '2026-04-30' },
    { id: 'karte', onBudget: true, openingBalanceCents: 0, openingDate: '2026-04-30' },
    { id: 'depot', onBudget: false, openingBalanceCents: 0, openingDate: '2026-04-30' },
  ];
  const categories: LedgerCategory[] = [
    { id: 'lebensmittel', kind: 'variable' },
    { id: 'tanken', kind: 'variable' },
    { id: 'investieren', kind: 'invest' },
    { id: 'kartenzahlung', kind: 'card_payment', cardAccountId: 'karte' },
  ];
  const split = (
    accountId: string,
    cents: number,
    categoryId: string | null,
    transferAccountId?: string,
  ): LedgerSplit => ({
    accountId,
    date: '2026-05-10',
    amountCents: cents,
    categoryId,
    transferAccountId: transferAccountId ?? null,
  });
  const input = (held: Record<string, number> = {}): BudgetInput => ({
    accounts,
    categories,
    months: ['2026-05', '2026-06'],
    held,
    assigned: { '2026-05': { lebensmittel: 40000, tanken: 10000, investieren: 50000 } },
    splits: [
      split('giro', 300000, null), // salary → Zu verteilen
      split('karte', -25000, 'lebensmittel'), // card spend moves 250 € to Kartenzahlung
      split('karte', -13000, 'tanken'), // overspent by 30 € at month end
      split('giro', -10000, 'lebensmittel'),
      split('giro', -50000, 'investieren', 'depot'), // on-budget → tracking: category on the budget leg
      split('depot', 50000, null, 'giro'),
      split('giro', -20000, null, 'karte'), // card payment: neutral between budget accounts
      split('karte', 20000, null, 'giro'),
    ],
  });

  it('computes envelopes, the card envelope and "Zu verteilen"', () => {
    const [may, june] = budgetMonths(input());
    expect(may!.envelopes['lebensmittel']?.availableCents).toBe(5000);
    expect(may!.envelopes['tanken']?.availableCents).toBe(-3000);
    expect(may!.envelopes['investieren']?.availableCents).toBe(0);
    // 250 + 130 moved in, 200 paid: exactly the card debt of 180 € is covered.
    expect(may!.envelopes['kartenzahlung']?.availableCents).toBe(18000);
    expect(may!.cashCents).toBe(320000); // the card is covered by its envelope, not in the cash
    expect(may!.toBeAssignedCents).toBe(100000 + 300000 - 100000);
    // June: the uncovered 30 € of fuel reduce "Zu verteilen".
    expect(june!.envelopes['tanken']?.carryCents).toBe(0);
    expect(june!.toBeAssignedCents).toBe(may!.toBeAssignedCents - 3000);
  });

  it('money held for next month is not to be distributed this month, but comes back', () => {
    const [may, june] = budgetMonths(input({ '2026-05': 10000 }));
    expect(may!.toBeAssignedCents).toBe(290000);
    expect(june!.toBeAssignedCents).toBe(297000);
  });

  it('classifies splits by the on-budget status of both legs', () => {
    const onBudget = new Map(accounts.map((a) => [a.id, a.onBudget]));
    const live = new Set(categories.map((c) => c.id));
    expect(splitEffect(split('giro', -1, 'investieren', 'depot'), onBudget, live)).toEqual({
      kind: 'activity',
      categoryId: 'investieren',
    });
    expect(splitEffect(split('giro', -1, 'lebensmittel', 'karte'), onBudget, live)).toEqual({
      kind: 'neutral',
    });
    expect(splitEffect(split('depot', 1, 'investieren', 'giro'), onBudget, live)).toEqual({
      kind: 'none',
    });
    expect(splitEffect(split('giro', 1, null, 'depot'), onBudget, live)).toEqual({
      kind: 'income',
    });
    // A deleted category counts as uncategorised (its envelope no longer exists).
    expect(splitEffect(split('giro', -1, 'weg'), onBudget, live)).toEqual({ kind: 'income' });
  });

  it('a category with rolloverOverspending carries the negative amount instead', () => {
    const rollover = {
      ...input(),
      categories: categories.map((c) =>
        c.id === 'tanken' ? { ...c, rolloverOverspending: true } : c,
      ),
    };
    const [may, june] = budgetMonths(rollover);
    expect(june!.envelopes['tanken']?.carryCents).toBe(-3000);
    expect(june!.toBeAssignedCents).toBe(may!.toBeAssignedCents);
  });
});

describe('stock formula = flow formula (property test)', () => {
  function random(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  it('holds for 200 random ledgers over 8 months', () => {
    const months = [
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ];
    for (let run = 0; run < 200; run++) {
      const r = random(run + 1);
      const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
      const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)] as T;
      const date = () => `${pick(months)}-${String(int(1, 28)).padStart(2, '0')}`;
      const accounts: LedgerAccount[] = [
        { id: 'a', onBudget: true, openingBalanceCents: int(0, 500000), openingDate: '2025-10-15' },
        { id: 'b', onBudget: true, openingBalanceCents: int(-50000, 50000), openingDate: date() },
        {
          id: 'card',
          onBudget: true,
          openingBalanceCents: -int(0, 30000),
          openingDate: '2025-10-01',
        },
        {
          id: 'off',
          onBudget: false,
          openingBalanceCents: int(0, 100000),
          openingDate: '2025-10-01',
        },
      ];
      const categories: LedgerCategory[] = [
        { id: 'c1', kind: 'variable' },
        { id: 'c2', kind: 'fixed', rolloverOverspending: r() < 0.5 },
        { id: 'c3', kind: 'saving' },
        { id: 'cp', kind: 'card_payment', cardAccountId: 'card' },
      ];
      const cats = [null, 'c1', 'c2', 'c3', 'gone'];
      const ids = accounts.map((a) => a.id);
      const splits: LedgerSplit[] = [];
      for (let i = 0; i < 60; i++) {
        const accountId = pick(ids);
        const d = date();
        const cents = int(-40000, 30000);
        const other = pick(ids.filter((x) => x !== accountId));
        const opened = (id: string) => d >= (accounts.find((a) => a.id === id)?.openingDate ?? '');
        // Transfers happen between accounts that both exist on the day.
        if (r() < 0.3 && opened(accountId) && opened(other)) {
          splits.push({
            accountId,
            date: d,
            amountCents: -cents,
            categoryId: pick(cats),
            transferAccountId: other,
          });
          splits.push({
            accountId: other,
            date: d,
            amountCents: cents,
            categoryId: pick(cats),
            transferAccountId: accountId,
          });
        } else splits.push({ accountId, date: d, amountCents: cents, categoryId: pick(cats) });
      }
      const assigned = Object.fromEntries(
        months.map((m) => [
          m,
          { c1: int(0, 50000), c2: int(0, 50000), c3: int(-5000, 20000), cp: int(0, 10000) },
        ]),
      );
      const held = Object.fromEntries(months.map((m) => [m, r() < 0.3 ? int(0, 20000) : 0]));
      const result = budgetMonths({
        accounts,
        categories,
        splits,
        months,
        assigned,
        held,
        openingCarry: { c1: int(-1000, 5000) },
      });
      for (let i = 1; i < result.length; i++) {
        const [prev, cur] = [result[i - 1]!, result[i]!];
        expect(
          toBeAssignedFlow({
            previousCents: prev.toBeAssignedCents,
            incomeCents: cur.incomeCents,
            assignedCents: cur.assignedCents,
            uncoveredCents: cur.uncoveredCents,
            heldPreviousCents: prev.heldCents,
            heldCents: cur.heldCents,
          }),
          `run ${run}, ${cur.month}`,
        ).toBe(cur.toBeAssignedCents);
      }
    }
  });

  it('refuses gaps between months', () => {
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(() =>
      budgetMonths({ accounts: [], categories: [], splits: [], months: ['2026-01', '2026-03'] }),
    ).toThrow(/consecutive/);
  });
});
