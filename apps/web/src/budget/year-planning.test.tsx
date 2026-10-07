// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { YearPlanning } from './year-planning';
import type { BudgetMonthView } from './budget-api';
import { plannedEventsQuery, type PlannedEventView } from '../reports/liquidity-api';

vi.mock('@tanstack/react-router', () => ({ useSearch: () => ({}), useNavigate: () => vi.fn() }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
afterEach(cleanup);
function show(events: PlannedEventView[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(plannedEventsQuery().queryKey, {
    events,
    asOf: '2026-10-06',
    budgetAccounts: [],
  });
  return render(
    <QueryClientProvider client={client}>
      <YearPlanning
        year={2026}
        selectedMonth="2026-11"
        views={Array.from(
          { length: 12 },
          (_, i) =>
            ({
              summary: {
                month: `2026-${String(i + 1).padStart(2, '0')}`,
                toBeAssignedCents: 10000,
                carryInCents: 10000,
                incomeCents: 0,
                uncoveredCents: 0,
                heldCents: 0,
                assignedCents: 0,
                activityCents: 0,
                availableCents: 0,
                creditOverspentCents: 0,
                cashOverspentCents: 0,
                envelopes: [],
                cards: [],
              },
              categories: [],
              groups: [],
            }) satisfies BudgetMonthView,
        )}
      />
    </QueryClientProvider>,
  );
}
it('shows only the base amount and planning action without events', () => {
  const { container } = show();
  expect(screen.getByRole('button', { name: 'Ereignis planen' })).toBeTruthy();
  expect(screen.getByText(/Noch keine Ereignisse geplant/)).toBeTruthy();
  expect(container.querySelectorAll('.event-grid tfoot tr')).toHaveLength(1);
  expect(container.querySelector('.event-grid tfoot')?.textContent).toContain('Zu verteilen');
  expect(container.textContent).not.toContain('Ereigniseffekt');
  expect(container.querySelector('.year-phone dl')?.children).toHaveLength(1);
});
it('explains each scenario row on keyboard focus when events exist', () => {
  show([
    {
      id: 'synthetic-event',
      name: 'Geplante Ausgabe',
      date: '2026-11-15',
      amountCents: -10000,
      recurrence: 'once',
      recurrenceMonths: [],
      recurrenceUntil: null,
      enabled: true,
      categoryId: null,
      categoryName: null,
      accountId: null,
      accountName: null,
      note: null,
      status: 'in_horizon',
    } satisfies PlannedEventView,
  ]);
  const help = screen.getAllByRole('button', {
    name: 'Geplante Ereignisse in diesem Monat erklären',
  })[0]!;
  fireEvent.focus(help);
  expect(screen.getByRole('tooltip').textContent).toContain('geplanten Beträge');
  fireEvent.click(help);
  expect(screen.getByRole('tooltip').textContent).toContain('geplanten Beträge');
  fireEvent.keyDown(help, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(
    screen.getAllByRole('button', { name: 'Ereignisse bis dahin zusammen erklären' }),
  ).toHaveLength(2);
  expect(
    screen.getAllByRole('button', { name: 'Zu verteilen mit Ereignissen erklären' }),
  ).toHaveLength(2);
});
