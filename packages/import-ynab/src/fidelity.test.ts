import { budgetMonths } from '@budget/domain';
import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  budgetInputOf,
  buildModel,
  identityMapping,
  mappingSchema,
  reconcile,
  ynabMonths,
  type MappingInput,
  type PlanRow,
  type RegisterRow,
} from './index';

/**
 * Synthetic regression for the import fidelity (owner report 02.10.2026): a rule that moves a
 * booking into a new category must move the assigned money with it, so Zu verteilen stays YNAB's
 * Ready to Assign; tracking accounts keep YNAB's value adjustments; scheduled rows become
 * expected payments; a declared recurring payment (the salary) is planned from its latest row.
 */

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
const cells: [string, string, number, number, number][] = [
  // month, category, assigned, activity, available
  ['2026-01', 'Essen', 50000, -20000, 30000],
  ['2026-01', 'Hobby', 10000, -10000, 0],
  ['2026-01', 'Miete [€ 800,- am 01.]', 0, 0, 0],
  ['2026-01', 'Versicherung [€ 120,- am 15.01.]', 0, 0, 0],
  ['2026-02', 'Essen', 0, -40000, -10000],
  ['2026-02', 'Hobby', 10000, -10000, 0],
  ['2026-02', 'Miete [€ 800,- am 01.]', 0, 0, 0],
  ['2026-02', 'Versicherung [€ 120,- am 15.01.]', 0, 0, 0],
];
const plan: PlanRow[] = cells.map(([month, category, assigned, activity, available]) => ({
  line: ++line,
  month,
  group: 'G',
  category,
  assignedCents: assigned,
  activityCents: activity,
  availableCents: available,
}));
const register: RegisterRow[] = [
  r('Giro', '2026-01-01', 'Arbeitgeber', 300000, 'Ready to Assign'),
  r('Giro', '2026-01-05', 'Markt', -15000, 'Essen'),
  r('Giro', '2026-01-06', 'Buchladen', -5000, 'Essen'),
  r('Giro', '2026-01-07', 'Transfer : P2P', -10000, 'Hobby'),
  r('P2P', '2026-01-07', 'Transfer : Giro', 10000),
  r('P2P', '2026-01-31', 'Reconciliation Balance Adjustment', -300),
  r('Kredit', '2026-01-01', 'Starting Balance', -1000000),
  r('Giro', '2026-02-07', 'Transfer : P2P', -10000, 'Hobby'),
  r('P2P', '2026-02-07', 'Transfer : Giro', 10000),
  r('Giro', '2026-02-10', 'Markt', -40000, 'Essen'),
  r('Giro', '2026-02-13', 'Arbeitgeber', 290000, 'Ready to Assign'),
  r('P2P', '2026-02-20', 'Reconciliation Balance Adjustment', 512),
  // Scheduled (after the "as of" day 2026-02-20).
  r('Giro', '2026-03-01', 'Vermieter', -80000, 'Miete [€ 800,- am 01.]'),
  r('Giro', '2026-03-05', 'Zahnarzt', -30000, 'Essen'),
  r('Giro', '2026-03-07', 'Transfer : P2P', -10000, 'Hobby'),
  r('P2P', '2026-03-07', 'Transfer : Giro', 10000),
  r('Giro', '2027-01-15', 'Versicherung', -12000, 'Versicherung [€ 120,- am 15.01.]'),
];
const raw = buildModel(register, plan, { asOf: '2026-02-20' });

const mapping = () => {
  const m: MappingInput = structuredClone(identityMapping(raw, '2026-01'));
  m.rulesFrom = '2026-01';
  m.accounts['P2P'] = { id: 'p2p', name: 'P2P', type: 'p2p', onBudget: false };
  m.accounts['Kredit'] = {
    id: 'kredit',
    name: 'Kredit',
    type: 'loan',
    onBudget: false,
    adjustments: [{ date: '2026-02-15', amountCents: -2000, memo: 'Zinsen' }],
  };
  m.targets['buecher'] = { name: 'Bücher', group: 'G', kind: 'variable' };
  m.rules = [
    { id: 'buch', match: { payee: 'Buchladen' }, set: { category: 'buecher' } },
    {
      id: 'ertrag',
      match: { account: 'P2P', payee: 'Reconciliation Balance Adjustment', minCents: 1 },
      set: { payee: 'P2P', incomeType: 'Kapitalerträge' },
    },
    { id: 'gehalt', match: { payee: 'Arbeitgeber' }, set: { incomeType: 'Gehalt' } },
  ];
  m.expectedPayments = {
    recurring: [
      {
        name: 'Gehalt',
        payee: 'Arbeitgeber',
        incomeType: 'Gehalt',
        dueDay: 15,
        dateShift: 'before',
      },
    ],
  };
  return mappingSchema.parse(m);
};

describe('import fidelity (synthetic)', () => {
  const { target, problems } = applyMapping(raw, mapping());
  const report = reconcile(raw, target);
  const essen = 'G: Essen';

  it('Zu verteilen equals Ready to Assign in every month although a rule moved a booking', () => {
    expect(raw.problems).toEqual([]);
    expect(problems).toEqual([]);
    expect(report.differences).toEqual([]);
    expect(report.checked.to_be_assigned).toBe(2);
    const ynab = ynabMonths(raw);
    expect(report.budget.map((m) => m.toBeAssignedCents)).toEqual(
      ynab.map((m) => m.readyToAssignCents),
    );
    // The new category gets the money with the booking; the source keeps YNAB's Available.
    expect(target.shifts).toEqual([
      { month: '2026-01', categoryId: essen, cents: -5000 },
      { month: '2026-01', categoryId: 'buecher', cents: 5000 },
    ]);
    expect(report.budget.map((m) => m.envelopes['buecher']?.availableCents)).toEqual([0, 0]);
    expect(report.budget.map((m) => m.envelopes[essen]?.availableCents)).toEqual([30000, -10000]);
  });

  it('the reconciliation checks Zu verteilen in every month and reports a tampered assignment', () => {
    expect(report.checked.to_be_assigned).toBe(target.months.length);
    const assigned = structuredClone(target.assigned);
    const month = target.months[0] as string;
    (assigned[month] ??= {})[essen] = (assigned[month]?.[essen] ?? 0) + 7000;
    const tampered = reconcile(raw, { ...target, assigned });
    const tba = tampered.differences.filter((d) => d.check === 'to_be_assigned');
    // 70 € more assigned in the first month: Zu verteilen is 70 € lower than YNAB's from then on.
    expect(tba.map((d) => [d.month, d.actualCents - d.expectedCents])).toEqual(
      target.months.map((m) => [m, -7000]),
    );
  });

  it('without moving the assigned money the new category is overspent (the old behaviour)', () => {
    const assigned = structuredClone(target.assigned);
    for (const s of target.shifts) {
      const row = (assigned[s.month] ??= {});
      row[s.categoryId] = (row[s.categoryId] ?? 0) - s.cents;
    }
    const old = budgetMonths({ ...budgetInputOf(target), assigned });
    expect(old[0]?.envelopes['buecher']?.availableCents).toBe(-5000);
    // Uncovered in February: Zu verteilen 50 € lower than YNAB's.
    expect((old[1]?.toBeAssignedCents ?? 0) - (report.budget[1]?.toBeAssignedCents ?? 0)).toBe(
      -5000,
    );
  });

  it('tracking accounts keep value adjustments; a rule names a return; declared interest', () => {
    const p2p = target.bookings.filter((b) => b.accountId === 'p2p');
    expect(p2p.map((b) => [b.date, b.amountCents, b.payee, b.systemPayee])).toEqual([
      ['2026-01-07', 10000, 'Transfer : Giro', null],
      ['2026-01-31', -300, 'Reconciliation Balance Adjustment', 'reconciliation_adjustment'],
      ['2026-02-07', 10000, 'Transfer : Giro', null],
      ['2026-02-20', 512, 'P2P', null],
    ]);
    expect(p2p.at(-1)?.splits[0]?.incomeType).toBe('Kapitalerträge');
    const loan = target.bookings.filter((b) => b.accountId === 'kredit');
    expect(loan.map((b) => [b.amountCents, b.systemPayee, b.importKey ?? null])).toEqual([
      [-1000000, 'opening_balance', null],
      [-2000, 'manual_adjustment', 'mapping:kredit:2026-02-15:-2000:0'],
    ]);
    // Balances are checked for every account, tracking and loan included.
    const balances = report.checked.balance;
    expect(balances).toBe(target.accounts.length * 2);
  });

  it('scheduled rows become expected payments with a rhythm; the salary from its latest row', () => {
    expect(target.bookings.some((b) => b.date > '2026-02-20')).toBe(false);
    expect(
      target.expectedPayments.map((e) => [
        e.name,
        e.kind,
        e.amountCents,
        e.rhythm,
        e.dueDay,
        e.dueMonth,
        e.startDate,
        e.endDate,
        e.basis,
      ]),
    ).toEqual([
      ['Vermieter', 'outflow', 80000, 'monthly', 1, null, '2026-03-01', null, 'note_monthly'],
      ['Zahnarzt', 'outflow', 30000, 'monthly', 5, null, '2026-03-05', '2026-03-05', 'once'],
      ['Umbuchung an P2P', 'outflow', 10000, 'monthly', 7, null, '2026-03-07', null, 'recurring'],
      ['Versicherung', 'outflow', 12000, 'yearly', 15, 1, '2027-01-15', null, 'note_yearly'],
      ['Gehalt', 'inflow', 290000, 'monthly', 15, null, '2026-03-01', null, 'mapping'],
    ]);
    const salary = target.expectedPayments.at(-1);
    expect(salary).toMatchObject({ incomeType: 'Gehalt', categoryId: null, dateShift: 'before' });
    expect(target.expectedPayments[2]?.categoryId).toBe('G: Hobby');
  });
});
