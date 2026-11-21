// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { adjacentReports, ReportNavigation } from './report-navigation';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({ darstellung: 'finanzcheck' }),
  useLocation: () => ({ hash: '' }),
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search: (prev: Record<string, unknown>) => Record<string, unknown>;
    children: React.ReactNode;
  }) => {
    const params = search({ monat: '2026-08', zeitraum: '3M', period: 'month', jahr: '2025' });
    return (
      <a
        href={`${to}?${new URLSearchParams(
          Object.entries(params)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, String(value)]),
        )}`}
        {...props}
      >
        {children}
      </a>
    );
  },
}));
it('offers nested monthly and yearly views in one menu, preserving explicit period context', () => {
  render(<ReportNavigation id="onepager" />);
  const summary = screen.getByLabelText('Bericht wechseln');
  fireEvent.click(summary);
  expect(screen.queryByRole('button', { name: /Bericht/ })).toBeNull();
  const history = screen.getByRole('link', { name: 'Finanz-Check-Verlauf' });
  expect(history.closest('ul')?.className).toBe('report-switcher-children');
  expect(history.getAttribute('aria-current')).toBe('page');
  expect(history.getAttribute('href')).toBe(
    '/reports/onepager?monat=2026-08&zeitraum=3M&period=month&jahr=2025&darstellung=finanzcheck',
  );
  expect(
    screen.getByRole('link', { name: '1. Monatsbericht' }).getAttribute('aria-current'),
  ).toBeNull();
  expect(screen.getByRole('link', { name: 'A4 Druckblatt · Jahr' }).getAttribute('href')).toContain(
    '/reports/jahresreport?',
  );
  const search = screen.getByRole('searchbox');
  fireEvent.change(search, { target: { value: 'Druckblatt' } });
  expect(screen.getByRole('link', { name: 'A4 Druckblatt · Monat' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'A4 Druckblatt · Jahr' })).toBeTruthy();
  fireEvent.change(search, { target: { value: 'Finanz-Check' } });
  expect(screen.getByRole('link', { name: 'Finanz-Check-Verlauf' })).toBeTruthy();
  search.focus();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(summary.closest('details')?.open).toBe(false);
  expect(document.activeElement).toBe(summary);
});
it('lists Projekte and Empfänger as indented sub-reports of their parents (#1150)', () => {
  render(<ReportNavigation id="ausgaben" />);
  fireEvent.click(screen.getByLabelText('Bericht wechseln'));
  const payees = screen.getByRole('link', { name: 'Empfänger' });
  expect(payees.closest('ul')?.className).toBe('report-switcher-children');
  expect(payees.getAttribute('href')).toContain('/reports/ausgaben?');
  expect(payees.getAttribute('href')).toContain('darstellung=empfaenger');
  const projects = screen.getByRole('link', { name: 'Projekte und Nebeneinkünfte' });
  expect(projects.closest('ul')?.className).toBe('report-switcher-children');
  expect(projects.getAttribute('href')).toContain('/reports/einnahmen-ausgaben?');
});

it('offers the category view of Ausgaben and the wealth and portfolio views as indented entries', () => {
  render(<ReportNavigation id="ausgaben" />);
  fireEvent.click(screen.getByLabelText('Bericht wechseln'));
  expect(
    screen.getByRole('link', { name: 'Kategorien und Verlauf' }).getAttribute('href'),
  ).toContain('darstellung=kategorien');
  expect(screen.getByRole('link', { name: 'Vermögensverlauf' }).getAttribute('href')).toContain(
    '/reports/vermoegen-schulden?',
  );
  expect(screen.getByRole('link', { name: 'Rendite & Risiko' }).getAttribute('href')).toContain(
    '/reports/pallocation?',
  );
  expect(screen.getByRole('link', { name: 'Kosten gesamt' }).getAttribute('href')).toContain(
    '/reports/psteuern?',
  );
});

it('normalizes the old kosten destination to the Portfolio cost report', () => {
  expect(adjacentReports('kosten')).toEqual(adjacentReports('psteuern'));
  expect(adjacentReports('kosten')).not.toEqual(adjacentReports('abos'));
});
