// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import type { ExpectedIncomeLine, IncomeLineStatus } from '@budget/domain';
import { IncomeExpectations } from './income-report';
import type { IncomeReportData } from './month-api';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

const statuses: IncomeLineStatus[] = [
  'pending',
  'missing',
  'overdue',
  'unlinked',
  'diff',
  'ok',
  'unplanned',
];
const lines: ExpectedIncomeLine[] = statuses.map((status) => ({
  key: status,
  name: `Synthetic ${status}`,
  sub: 'Synthetic payment',
  typeId: null,
  dueDate: '2026-08-15',
  status,
  expectedCents: 10001,
  receivedCents: 7001,
  differenceCents: -3000,
}));
// Only the existing expectation fields are consumed by this presentation component.
const data = {
  expected: { lines, pendingCount: 1, pendingCents: 10001, missingCount: 2, unlinkedCount: 1 },
  expectedMaterialised: true,
  foreignCurrencyCount: 0,
} satisfies Pick<IncomeReportData, 'expected' | 'expectedMaterialised' | 'foreignCurrencyCount'>;

afterEach(() => {
  cleanup();
  localStorage.clear();
  flags.REDESIGN_ENABLED = true;
  act(() => setAmountsHidden(false));
  vi.unstubAllGlobals();
});

it('keeps every unresolved status visible and received/unplanned income collapsed', () => {
  render(<IncomeExpectations data={data} />);
  const tables = screen.getAllByRole('table', { hidden: true });
  expect(tables).toHaveLength(2);
  expect(
    [...tables[0]!.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-status')),
  ).toEqual(['pending', 'missing', 'overdue', 'unlinked', 'diff']);
  const details = tables[1]!.closest('details')!;
  expect(details.open).toBe(false);
  fireEvent.click(screen.getByText('Eingegangene und ungeplante Einnahmen · 2'));
  expect(details.open).toBe(true);
  expect(tables[1]!.textContent).toContain('Synthetic ok');
  expect(tables[1]!.textContent).toContain('Synthetic unplanned');
  act(() => setAmountsHidden(true));
  for (const table of tables) {
    expect(table.textContent).not.toContain('100,01');
    expect(table.textContent).not.toContain('70,01');
    expect(table.textContent).not.toContain('30,00');
    expect(table.textContent).toContain('••• €');
  }
});

it('preserves the complete OFF table', () => {
  flags.REDESIGN_ENABLED = false;
  render(<IncomeExpectations data={data} />);
  expect(screen.getAllByRole('table')).toHaveLength(1);
  expect(screen.getByRole('table').querySelectorAll('tbody tr')).toHaveLength(7);
});

it('distinguishes no open payments, no expectations and unavailable project expectations', () => {
  const view = render(
    <IncomeExpectations data={{ ...data, expected: { ...data.expected!, lines: [lines[5]!] } }} />,
  );
  expect(screen.getByText('Keine offenen erwarteten Einnahmen.')).toBeTruthy();
  view.rerender(
    <IncomeExpectations data={{ ...data, expected: { ...data.expected!, lines: [] } }} />,
  );
  expect(screen.getByText('Für diesen Monat sind keine Einnahmen erwartet.')).toBeTruthy();
  view.rerender(<IncomeExpectations data={{ ...data, expected: null }} />);
  expect(screen.getByText(/Erwartete Zahlungen sind keinem Projekt zugeordnet/)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});
