// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { planYearMonths } from '@budget/domain';
import { YearOverview } from './plan-year-page';
import { validatePlanYearSearch } from './plan-year-search';
import type { BudgetMonthView } from './budget-api';

const state = vi.hoisted(() => ({
  enabled: true,
  search: { kennzahl: 'availableCents' },
  navigate: vi.fn(),
}));
vi.mock('../shell/redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return state.enabled;
  },
}));
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => state.search,
  useNavigate: () => state.navigate,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
afterEach(() => {
  cleanup();
  state.navigate.mockClear();
  state.enabled = true;
});
const months = planYearMonths(2026);
const views = months.map((month, i) => ({
  summary: {
    month,
    envelopes: [
      {
        categoryId: 'category',
        assignedCents: i === 0 ? 10_001 : i === 1 ? 5_000 : 0,
        activityCents: 0,
        availableCents: i === 0 ? 10_001 : 15_001,
      },
    ],
  },
  categories: [
    { id: 'category', name: 'Synthetic category', groupId: 'group', sortOrder: 0, hiddenAt: null },
  ],
  groups: [{ id: 'group', name: 'Synthetic group', sortOrder: 0 }],
})) as BudgetMonthView[];
const mount = (onMonth = vi.fn()) =>
  render(
    <YearOverview
      year={2026}
      selectedMonth="2026-02"
      months={months}
      views={views}
      onMonth={onMonth}
    />,
  );

it('ON restores the URL metric/month, shows category groups and retains exact year-end cents', () => {
  const changeMonth = vi.fn();
  mount(changeMonth);
  expect(
    screen.getByRole('button', { name: 'Verfügbar', exact: true }).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen
      .getAllByRole('button', { name: 'Synthetic group', exact: true })[0]!
      .getAttribute('aria-expanded'),
  ).toBe('true');
  expect(screen.getAllByText('150,01 €').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: 'Aktivität', exact: true }));
  const navigation = state.navigate.mock.calls[0]![0] as {
    search: (previous: Record<string, unknown>) => Record<string, unknown>;
  };
  expect(navigation.search({ monat: '2026-02', ereignis: 'neu' })).toEqual({
    monat: '2026-02',
    ereignis: 'neu',
    kennzahl: 'activityCents',
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Monat' }), {
    target: { value: '2026-03' },
  });
  expect(changeMonth).toHaveBeenCalledWith('2026-03');
});

it('OFF retains the assigned metric and collapsed groups without a URL write', () => {
  state.enabled = false;
  mount();
  expect(
    screen.getByRole('button', { name: 'Zugewiesen', exact: true }).getAttribute('aria-pressed'),
  ).toBe('true');
  expect(
    screen
      .getAllByRole('button', { name: 'Synthetic group', exact: true })[0]!
      .getAttribute('aria-expanded'),
  ).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Aktivität', exact: true }));
  expect(state.navigate).not.toHaveBeenCalled();
});

it('bounds the persisted metric and event return context', () => {
  expect(validatePlanYearSearch({ kennzahl: 'invented', ereignis: 'x'.repeat(65) })).toEqual({
    kennzahl: undefined,
    ereignis: undefined,
  });
});
