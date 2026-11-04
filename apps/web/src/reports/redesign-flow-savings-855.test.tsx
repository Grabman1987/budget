// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { moneyFlow } from '@budget/domain';
import type { ReportTables } from './table-reports-api';
import { flowCalculation, savingsPresentation } from './flow-savings-presentation';
import { SavingsChart } from './table-charts';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
afterEach(cleanup);

const facts: ReportTables = {
  asOf: '2026-09-17',
  currentMonth: '2026-09',
  firstMonth: '2026-08',
  lastFullMonth: '2026-08',
  categories: [
    {
      id: 'n',
      name: 'Synthetic need',
      class: 'need',
      kind: 'variable',
      groupId: 'g',
      groupName: 'Synthetic',
    },
    {
      id: 'f',
      name: 'Synthetic future',
      class: 'future',
      kind: 'saving',
      groupId: 'g',
      groupName: 'Synthetic',
    },
  ],
  incomeTypes: [
    { id: 'salary', name: 'Synthetic earned', role: 'income' },
    { id: 'capital', name: 'Synthetic capital', role: 'capital' },
    { id: 'refund', name: 'Synthetic refund', role: 'refund' },
  ],
  months: [
    {
      month: '2026-08',
      income: { salary: 10001, capital: 777, refund: 555 },
      spending: { n: 12001, f: 5000 },
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
    {
      month: '2026-09',
      income: { salary: -100 },
      spending: {},
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: 0,
    },
  ],
  targets: { savingsRateBp: 1500, moneyAgeDays: 25 },
  payees: {},
  netWorth: 'omitted',
};
it('ON flow uses the original pool, labelled capital and negative rest without a second model', () => {
  const flow = moneyFlow({
    income: [{ typeId: 'salary', name: 'Synthetic earned', cents: 10001 }],
    capitalCents: 777,
    classes: [
      { class: 'need', groups: [{ name: 'Synthetic need', cents: 9000 }] },
      { class: 'future', groups: [{ name: 'Synthetic future', cents: 5000 }] },
    ],
  });
  const calc = flowCalculation(flow);
  expect(calc.result.value).toBe(-3222);
  expect(calc.result.label).toBe('Aus Guthaben · nach Zukunft');
  expect(calc.terms.map((t) => [t.label, t.value])).toEqual([
    ['Einnahmen', 10001],
    ['Kapitalerträge', 777],
    ['Ausgaben inkl. Zukunft', 14000],
  ]);
  expect(flow.columns.pool).toHaveLength(1);
});
it('ON savings keeps household, signed consumption, missing rate and independent zero-day age distinct', () => {
  const model = savingsPresentation(facts, '1M');
  expect(model.window).toEqual(['2026-08']);
  expect(model.calculation.result.value).toBe(-2000);
  expect(model.calculation.terms.map((t) => t.value)).toEqual([-2000, 10001]);
  expect(model.overview.moneyAge).toEqual([
    { month: '2026-08', days: null },
    { month: '2026-09', days: 0 },
  ]);
  expect(savingsPresentation(facts, '2026-09..2026-09').calculation.result.value).toBeNull();
  expect(
    savingsPresentation({ ...facts, firstMonth: null, lastFullMonth: null, months: [] }, '1M')
      .calculation.result.value,
  ).toBeNull();
});
it('compact ON chart height retains signed percentages, null cells and the actual configured target', () => {
  const { container } = render(
    <SavingsChart
      table
      height={140}
      points={[
        { month: '2026-08', rateBp: -2000, rollingBp: null },
        { month: '2026-09', rateBp: null, rollingBp: null },
      ]}
      targetBp={1500}
      label="Synthetic compact savings"
    />,
  );
  expect(container.querySelector('svg[data-testid="savings-chart"]')?.getAttribute('height')).toBe(
    '140',
  );
  fireEvent.click(container.querySelector('.chart-data-table > summary')!);
  expect(screen.getByRole('table').textContent).toContain('−20,00 %');
  expect(screen.getByRole('table').textContent).toContain('15,00 %');
  expect(screen.getByRole('table').textContent).toContain('–');
});
