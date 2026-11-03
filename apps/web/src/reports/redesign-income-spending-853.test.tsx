// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createTestDatabase, createBooking, INCOME_TYPES, incomeExpenseReport } from '@budget/db';
import { setAmountsHidden } from '@budget/ui';
import type { ReactNode } from 'react';
import { incomeOverviewModel, IncomeExpenseSummary } from './income-expense-summary';
import { ReportViewControl } from './report-view-control';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 0] }));
vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}) }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: ReactNode }) => <a href="#details">{children}</a>,
}));
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
  flags.REDESIGN_ENABLED = true;
});
it('ON uses the same table totals: capital and uncategorized refunds stay separate, categorized refunds net spending, Zukunft remains an expense', () => {
  const db = createTestDatabase();
  try {
    db.sqlite.exec(
      "INSERT INTO account(id,name,type,role,on_budget,opening_date) VALUES ('r8','Synthetic R8','checking','budget',1,'2026-08-01'); INSERT INTO category_group(id,name) VALUES ('g','Synthetic'); INSERT INTO category(id,group_id,name,class,kind) VALUES ('n','g','Synthetic need','need','variable'),('f','g','Synthetic future','future','saving');",
    );
    for (const [amount, split] of [
      [10001, { incomeTypeId: INCOME_TYPES.salary.id }],
      [777, { incomeTypeId: INCOME_TYPES.capital.id }],
      [555, { incomeTypeId: INCOME_TYPES.refund.id }],
      [-7002, { categoryId: 'n' }],
      [2, { categoryId: 'n' }],
      [-1000, { categoryId: 'f' }],
    ] as const)
      createBooking(
        db.db,
        {
          accountId: 'r8',
          date: '2026-08-31',
          amountCents: amount,
          splits: [{ ...split, amountCents: amount }],
        },
        { actor: 'synthetic-r8' },
      );
    const data = incomeExpenseReport(db.db, '2026-09-17');
    const model = incomeOverviewModel(data, ['2026-08']);
    expect([model.income, model.expenses, model.net]).toEqual([10001, 8000, 2001]);
    expect(model.calculation?.result.value).toBe(2001);
    render(<IncomeExpenseSummary data={data} months={['2026-08']} />);
    expect(screen.getByRole('table').textContent).toContain('20,01 €');
    act(() => setAmountsHidden(true));
    expect(screen.getByRole('table').textContent).not.toContain('20,01');
    expect(screen.getByRole('table').textContent).toContain('••• €');
  } finally {
    db.close();
  }
});
it('ON uses a native view selector while OFF retains its existing segmented control', () => {
  const onChange = vi.fn();
  const props = {
    label: 'Synthetic view',
    options: [
      { value: 'overview', label: 'Overview' },
      { value: 'cashflow', label: 'Cashflow' },
    ],
    value: 'overview',
    onChange,
  };
  const view = render(<ReportViewControl {...props} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cashflow' } });
  expect(onChange).toHaveBeenCalledWith('cashflow');
  flags.REDESIGN_ENABLED = false;
  view.rerender(<ReportViewControl {...props} />);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getByRole('group', { name: 'Synthetic view' })).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(2);
});
