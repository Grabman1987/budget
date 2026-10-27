// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { BudgetMonthView } from './budget-api';
import {
  MonthOverviewInspector,
  MonthStatement,
  NextMonthCoverage,
  PLAN_OVERVIEW_KEY,
} from './plan-overview';

beforeEach(() => localStorage.removeItem(PLAN_OVERVIEW_KEY));
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});
function inspector() {
  return render(
    <MonthOverviewInspector
      month="2026-09"
      overview={<p>Geladene Monatszahlen</p>}
      next={<p>Ziele Oktober</p>}
      split={<p>Geladene Anteile</p>}
      income={<p>Geladenes Einkommen</p>}
      money={
        <details className="inspector-section plan-budget-money">
          <summary>Geld auf Budget-Konten</summary>
          <p>Geladene Konten</p>
        </details>
      }
      rail={<p>Geladene Stufen</p>}
    />,
  );
}
function disclosure(name: string) {
  return screen.getByText(name, { selector: 'summary' }).closest('details')!;
}

it('defaults month and 50/30/20 open, remembering all sections and the whole collapse across remounts', async () => {
  const first = inspector();
  expect(screen.getByRole('heading', { name: 'Monatsüberblick September 2026' })).toBeTruthy();
  expect(disclosure('Monatsaufstellung').open).toBe(true);
  expect(disclosure('50/30/20').open).toBe(true);
  for (const name of [
    'Erwartetes Einkommen vs. Monatsziele',
    'Geld auf Budget-Konten',
    'Wasserfall-Stufen',
  ]) {
    expect(disclosure(name).open).toBe(false);
    await userEvent.click(screen.getByText(name, { selector: 'summary' }));
    await waitFor(() => expect(disclosure(name).open).toBe(true));
  }
  await userEvent.click(screen.getByText('50/30/20', { selector: 'summary' }));
  await userEvent.click(screen.getByRole('button', { name: 'Monatsüberblick einklappen' }));
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(PLAN_OVERVIEW_KEY)!)).toMatchObject({
      collapsed: true,
      split: false,
      income: true,
      money: true,
      rail: true,
    }),
  );
  first.unmount();
  inspector();
  const expand = screen.getByRole('button', { name: 'Monatsüberblick ausklappen' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById(expand.getAttribute('aria-controls')!)!.hidden).toBe(true);
  await userEvent.click(expand);
  expect(disclosure('Monatsaufstellung').open).toBe(true);
  expect(disclosure('50/30/20').open).toBe(false);
  for (const name of [
    'Erwartetes Einkommen vs. Monatsziele',
    'Geld auf Budget-Konten',
    'Wasserfall-Stufen',
  ])
    expect(disclosure(name).open).toBe(true);
});

it('ignores malformed or untyped saved preferences', () => {
  localStorage.setItem(PLAN_OVERVIEW_KEY, '{"collapsed":"false","split":null,"income":"true"}');
  inspector();
  expect(screen.getByRole('button', { name: 'Monatsüberblick einklappen' })).toBeTruthy();
  expect(disclosure('50/30/20').open).toBe(true);
  expect(disclosure('Erwartetes Einkommen vs. Monatsziele').open).toBe(false);
});

it('renders literal monthly terms and masks all displayed money', () => {
  const data = {
    summary: {
      envelopes: [
        { carryCents: 1600, assignedCents: 4600, activityCents: -2100, availableCents: 4100 },
      ],
    },
  } as BudgetMonthView;
  render(<MonthStatement data={data} />);
  for (const [key, value] of [
    ['carryCents', '16,00 €'],
    ['assignedCents', '46,00 €'],
    ['activityCents', '−21,00 €'],
    ['availableCents', '41,00 €'],
  ])
    expect(screen.getByTestId(`month-statement-${key}`).textContent).toBe(value);
  act(() => setAmountsHidden(true));
  expect(screen.getByTestId('month-statement').textContent).not.toMatch(/16,00|46,00|21,00|41,00/);
});

function coverage(assigned: number, goal: number, need: number) {
  const view = {
    summary: {
      month: '2026-10',
      envelopes: [
        { assignedCents: assigned, goalCents: goal, needCents: need, target: { kind: 'monthly' } },
      ],
    },
  } as BudgetMonthView;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextMonthCoverage month="2026-10" view={view} />
    </QueryClientProvider>,
  );
}
it.each([
  [5000, 5000, '50 % vorbereitet', 'fehlt 50,00 €'],
  [10000, 0, '100 % vorbereitet', 'Ziele vollständig vorbereitet.'],
  [12500, 0, '100 % vorbereitet', '+25,00 € über Ziel'],
] as const)(
  'shows canonical under/equal/over target wording for %i cents',
  (assigned, need, percent, difference) => {
    coverage(assigned, 10000, need);
    expect(screen.getByText(percent)).toBeTruthy();
    expect(screen.getByTestId('next-month-difference').textContent).toBe(difference);
  },
);

it('shows the last missing cent rather than rounding incomplete preparation to 100%', () => {
  coverage(99999, 100000, 1);
  expect(screen.getByText('99 % vorbereitet')).toBeTruthy();
  expect(screen.getByTestId('next-month-difference').textContent).toBe('fehlt 0,01 €');
  act(() => setAmountsHidden(true));
  expect(screen.getByText('••• % vorbereitet')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByTestId('next-month-difference').textContent).toBe('fehlt ••• €');
});

it('does not claim no assignment is needed when a zero-goal target has canonical missing cents', () => {
  coverage(-1, 0, 1);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Keine prozentuale Zieldeckung verfügbar.')).toBeTruthy();
  expect(screen.getByTestId('next-month-difference').textContent).toBe('fehlt 0,01 €');
  expect(screen.queryByText('Keine neue Zuweisung nötig.')).toBeNull();
});
