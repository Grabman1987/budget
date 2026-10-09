// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SplitBand } from './plan-page';
import type { BudgetMonthView } from './budget-api';
import type { PlanRow } from './plan-model';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to, search }: { children: ReactNode; to: string; search: unknown }) => (
    <a href={to} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const rows = [{ cls: 'need', assignedCents: 51_290 }] as PlanRow[];
const data = (month: string, incomeCents: number) =>
  ({ summary: { month, incomeCents } }) as BudgetMonthView;

it('labels the actual denominator and withholds a full-month verdict on tiny running income', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));
  render(<SplitBand data={data('2026-09', 1_000)} rows={rows} />);
  expect(screen.getByText(/Ist-Einnahmen.*10,00 €/)).toBeTruthy();
  expect(screen.getByText('Eingeschränkte Vergleichsbasis')).toBeTruthy();
  expect(screen.queryByText('Bedarf über 50 %')).toBeNull();
  expect(screen.getByRole('img').getAttribute('aria-label')).toContain('5129 %');
  const link = screen.getByRole('link', { name: 'Abgeschlossenen Monat August 2026 vergleichen' });
  expect(link.getAttribute('href')).toBe('/reports/onepager');
  expect(link.getAttribute('data-search')).toBe('{"monat":"2026-08"}');
});

it('retains the existing comparison for a completed month and distinguishes zero income', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));
  const view = render(<SplitBand data={data('2026-08', 100_000)} rows={rows} />);
  expect(screen.getByText('Bedarf über 50 %')).toBeTruthy();
  view.rerender(<SplitBand data={data('2026-09', 0)} rows={rows} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText(/Ist-Einnahmen.*0,00 €/)).toBeTruthy();
});
