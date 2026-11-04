// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { payrollTotals } from '@budget/domain';
import { setAmountsHidden } from '@budget/ui';
import { payrollCalculation } from './payroll-presentation';
import { PayrollProjectChart } from './payroll-project-chart';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
afterEach(() => {
  cleanup();
  flags.REDESIGN_ENABLED = true;
  act(() => setAmountsHidden(false));
});
it('ON calculation keeps earnings, signed corrections, deductions and reimbursements in recorded cents', () => {
  const totals = payrollTotals([
    {
      month: '2026-08',
      kind: 'regular',
      specialType: null,
      grossCents: 10001,
      svCents: -5,
      taxCents: -4,
      netCents: 10012,
      bookingId: null,
      receiptId: null,
      lines: [
        { section: 'earning', label: 'Synthetic earning', amountCents: 1 },
        { section: 'deduction', label: 'Synthetic deduction', amountCents: 2 },
        { section: 'reimbursement', label: 'Synthetic reimbursement', amountCents: 3 },
      ],
    },
  ]);
  const model = payrollCalculation(totals);
  expect(model.result.value).toBe(10012);
  expect(model.terms.map((t) => [t.op, t.value])).toEqual([
    [undefined, 10002],
    ['+', 5],
    ['-', 0],
    ['+', 4],
    ['-', 2],
    ['+', 3],
  ]);
});
it('ON salary curve leaves missing slips open and exposes exact values; OFF chart defaults retain gross and size', () => {
  const props = { months: ['2026-08', '2026-09'], values: [2001, null], gross: [3001, null] };
  const view = render(<PayrollProjectChart {...props} focusSalary table height={176} />);
  expect(view.container.querySelectorAll('.pp-dot')).toHaveLength(1);
  expect(view.container.querySelector('.pp-gross')).toBeNull();
  fireEvent.click(view.container.querySelector('.chart-data-table > summary')!);
  expect(screen.getByRole('table').textContent).toContain('20,01 €');
  expect(screen.getByRole('table').textContent).toContain('–');
  expect(screen.getByRole('table').textContent).not.toContain('30,01');
  act(() => setAmountsHidden(true));
  expect(
    [...view.container.querySelectorAll('text[text-anchor="end"]')].every(
      (tick) => tick.textContent === '•••',
    ),
  ).toBe(true);
  act(() => setAmountsHidden(false));
  flags.REDESIGN_ENABLED = false;
  view.rerender(<PayrollProjectChart {...props} />);
  expect(view.container.querySelector('.pp-gross')).not.toBeNull();
  expect(view.container.querySelector('svg.pp-chart')?.getAttribute('height')).toBe('240');
  expect(view.container.querySelector('.chart-data-table')).toBeNull();
});
