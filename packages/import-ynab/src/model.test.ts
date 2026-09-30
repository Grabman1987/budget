import { describe, expect, it } from 'vitest';
import { buildModel, parseNote, stripNote } from './model';
import type { PlanRow, RegisterRow } from './parse';

let line = 1;
const r = (
  account: string,
  date: string,
  payee: string,
  cents: number,
  category = '',
  memo = '',
): RegisterRow => ({
  line: ++line,
  account,
  flag: '',
  date,
  payee,
  group: category === 'Ready to Assign' ? 'Inflow' : category ? 'G' : '',
  category,
  memo,
  amountCents: cents,
  cleared: 'Cleared',
});
const p = (month: string, group: string, category: string, available = 0): PlanRow => ({
  line: ++line,
  month,
  group,
  category,
  assignedCents: 0,
  activityCents: 0,
  availableCents: available,
});
const codes = (m: ReturnType<typeof buildModel>) =>
  m.problems.filter((x) => x.severity === 'error').map((x) => [x.code, x.lines]);

describe('model builder', () => {
  it('groups consecutive Split (i/n) rows into one booking with n splits', () => {
    line = 1;
    const m = buildModel(
      [
        r('A', '2024-01-02', 'Markt', -3000, 'Food', 'Split (1/2) Wocheneinkauf'),
        r('A', '2024-01-02', 'Markt', -500, 'Soap', 'Split (2/2) Seife'),
        r('A', '2024-01-03', 'Bäcker', -200, 'Food'),
      ],
      [],
    );
    expect(codes(m)).toEqual([]);
    expect(m.bookings).toHaveLength(2);
    expect(m.bookings[0]).toMatchObject({ amountCents: -3500, payee: 'Markt', memo: '' });
    expect(m.bookings[0]?.splits.map((s) => [s.categoryKey, s.memo, s.line])).toEqual([
      ['G: Food', 'Wocheneinkauf', 2],
      ['G: Soap', 'Seife', 3],
    ]);
  });

  it('rejects incomplete, out-of-order and mixed-account splits with their lines', () => {
    line = 1;
    const m = buildModel(
      [
        r('A', '2024-01-02', 'M', -1, 'X', 'Split (1/3) a'),
        r('A', '2024-01-02', 'M', -1, 'X', 'Split (2/3) b'),
        r('A', '2024-01-02', 'M', -1, 'X', 'Plain'),
        r('A', '2024-01-02', 'M', -1, 'X', 'Split (2/2) c'),
        r('A', '2024-01-05', 'M', -1, 'X', 'Split (1/2) d'),
        r('B', '2024-01-05', 'M', -1, 'X', 'Split (2/2) e'),
      ],
      [],
    );
    expect(codes(m)).toEqual([
      ['split.incomplete', [2, 3]],
      ['split.sequence', [5]],
      ['split.incomplete', [6]],
      ['split.sequence', [7]],
    ]);
  });

  it('pairs transfer legs by account pair, date and opposite amount, split legs included', () => {
    line = 1;
    const m = buildModel(
      [
        r('A', '2024-01-02', 'Transfer : B', -1000),
        r('A', '2024-01-02', 'Transfer : B', -1000),
        r('A', '2024-01-03', 'Markt', -400, 'Food', 'Split (1/2) x'),
        r('A', '2024-01-03', 'Transfer : B', -600, '', 'Split (2/2) y'),
        r('B', '2024-01-02', 'Transfer : A', 1000),
        r('B', '2024-01-02', 'Transfer : A', 1000),
        r('B', '2024-01-03', 'Transfer : A', 600),
        r('B', '2024-01-04', 'Transfer : A', 50),
        r('B', '2024-01-04', 'Transfer : C', 50),
      ],
      [],
    );
    const legs = m.bookings.flatMap((b) => b.splits).filter((s) => s.transferAccount);
    expect(legs.map((s) => s.transferId)).toEqual([
      't2-6',
      't3-7',
      't5-8',
      't2-6',
      't3-7',
      't5-8',
      null,
      null,
    ]);
    expect(codes(m)).toEqual([
      ['transfer.unknown_account', [10]],
      ['transfer.unpaired', [9]],
    ]);
  });

  it('proposes on/off budget, credit card and closed; reads hidden and card categories', () => {
    line = 1;
    const m = buildModel(
      [
        r('Giro', '2023-01-01', 'Starting Balance', 5000, 'Ready to Assign'),
        r('Giro', '2023-01-02', 'Transfer : Depot', -2000, 'Sparen'),
        r('Giro', '2023-01-02', 'Transfer : Karte', -100),
        r('Karte', '2023-01-02', 'Transfer : Giro', 100),
        r('Karte', '2023-01-05', 'Shop', -100, 'Sparen'),
        r('Depot', '2023-01-02', 'Transfer : Giro', 2000),
        r('Depot', '2023-12-31', 'Manual Balance Adjustment', 100),
        r('Alt', '2023-01-01', 'Starting Balance', 300, 'Ready to Assign'),
        r('Alt', '2023-02-01', 'Gebühr', -300, 'Sparen'),
      ],
      [
        p('2023-01', 'Credit Card Payments', 'Karte'),
        p('2023-01', 'Hidden Categories', 'Alt ', 700),
      ],
    );
    const proposal = Object.fromEntries(m.accounts.map((a) => [a.name, a.proposal]));
    expect(proposal).toEqual({
      Giro: { onBudget: true, creditCard: false, type: 'checking', closedAt: null },
      Karte: { onBudget: true, creditCard: true, type: 'credit_card', closedAt: '2023-01-05' },
      Depot: { onBudget: false, creditCard: false, type: 'other_asset', closedAt: null },
      Alt: { onBudget: true, creditCard: false, type: 'checking', closedAt: '2023-02-01' },
    });
    expect(m.accounts[0]?.startingBalance).toEqual({ date: '2023-01-01', amountCents: 5000 });
    expect(m.categories.map((c) => [c.key, c.hidden, c.cardAccount])).toEqual([
      ['Credit Card Payments: Karte', false, 'Karte'],
      ['Hidden Categories: Alt', true, null],
      ['G: Sparen', false, null],
    ]);
    expect(m.plan['2023-01']?.['Hidden Categories: Alt']?.availableCents).toBe(700);
    // Categories used in the register but missing in the plan are kept, with a warning.
    expect(m.problems.map((x) => x.code)).toEqual(['category.not_in_plan']);
  });

  it('rejects gaps and duplicates in the plan', () => {
    line = 1;
    const m = buildModel(
      [],
      [p('2023-01', 'G', 'A'), p('2023-03', 'G', 'A'), p('2023-03', 'G', 'A')],
    );
    expect(m.problems.map((x) => x.code)).toEqual(['plan.duplicate', 'plan.gap']);
  });

  it('reads bracketed notes: monthly with a day, yearly with day and month', () => {
    expect(parseNote('Streaming - [€ 7,49 am 03.]')).toEqual({
      amountCents: 749,
      day: 3,
      month: null,
    });
    expect(parseNote('Kfz-Versicherung - [€ 980 - am 01.11.]')).toEqual({
      amountCents: 98000,
      day: 1,
      month: 11,
    });
    expect(parseNote('Miete [€ 1.050,5 am 1.]')).toEqual({
      amountCents: 105050,
      day: 1,
      month: null,
    });
    expect(parseNote('Urlaub [irgendwann]')).toBeNull();
    expect(parseNote('Kaputt [€ 5 am 32.]')).toBeNull();
    expect(stripNote('Strom - [€ 85 am 05.]')).toBe('Strom');
    expect(stripNote('Miete')).toBe('Miete');
  });
});
