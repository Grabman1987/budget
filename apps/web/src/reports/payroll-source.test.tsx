// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { payrollSource, type SalaryPayslip } from '@budget/domain';
import { PayrollSource } from './payroll-source';
afterEach(cleanup);
it('shows exact original positions and unknown net as information, with no invented split action', () => {
  const slip: SalaryPayslip = {
    id: 'synthetic',
    month: '2026-11',
    kind: 'regular',
    specialType: null,
    grossCents: 800000,
    svCents: 120000,
    taxCents: 100000,
    netCents: 590000,
    bookingId: null,
    receiptId: null,
    employerContactId: null,
    lines: [{ section: 'reimbursement', label: 'Synthetic expenses', amountCents: 10000 }],
    wage: {
      lineCheck: 'ok',
      split: null,
      lines: [
        {
          code: '100',
          label: 'Synthetic base',
          section: 'earning',
          referenceMonth: null,
          amountCents: 400000,
        },
        {
          code: '200',
          label: 'Synthetic special',
          section: 'earning',
          referenceMonth: null,
          amountCents: 400000,
        },
        {
          code: '300',
          label: 'Synthetic expenses',
          section: 'reimbursement',
          referenceMonth: null,
          amountCents: 10000,
        },
      ],
    },
  };
  const view = render(<PayrollSource source={payrollSource(slip, [])} />);
  expect(screen.getByRole('heading', { name: 'Bestandteile laut Quelle', level: 2 })).toBeTruthy();
  expect(screen.getByText(/Nettoaufteilung aus der Quelle nicht bestimmbar/).className).toBe(
    'vnote',
  );
  expect(view.container.querySelectorAll('.pp-warning')[1]?.textContent).toContain('200');
  expect(view.container.querySelectorAll('.pp-warning')[1]?.textContent).toContain(
    'Synthetic special',
  );
  expect(screen.getByRole('row', { name: /Steuerfreie/ }).textContent).toContain('100,00');
  expect(screen.queryByRole('button')).toBeNull();
  view.rerender(<PayrollSource source={payrollSource(slip, [])} level="h4" />);
  expect(screen.getByRole('heading', { name: 'Bestandteile laut Quelle', level: 4 })).toBeTruthy();
});
