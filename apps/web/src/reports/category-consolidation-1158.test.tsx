// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReportTables } from '@budget/db';
import type * as Router from '@tanstack/react-router';
import { setAmountsHidden } from '@budget/ui';
import { CategoryBody, categoryPeriodOverview } from './category-report';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  useSearch: () => ({ kategorien: [] }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 0] }));
afterEach(() => {
  cleanup();
  act(() => setAmountsHidden(false));
});

const data: ReportTables = {
  asOf: '2026-09-17',
  currentMonth: '2026-09',
  firstMonth: '2026-07',
  lastFullMonth: '2026-08',
  categories: ['a', 'b', 'c'].map((id) => ({
    id,
    name: `Synthetic ${id}`,
    class: 'need',
    kind: 'variable',
    groupId: 'g',
    groupName: 'Synthetic group',
  })),
  incomeTypes: [],
  payees: {},
  targets: { savingsRateBp: 2000, moneyAgeDays: 30 },
  netWorth: 'omitted',
  months: [
    {
      month: '2026-07',
      spending: { a: 10000, b: 9000, c: 500 },
      income: {},
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
    {
      month: '2026-08',
      spending: { a: 10001, b: 2000, c: 7500 },
      income: {},
      assigned: {},
      netWorthCents: null,
      moneyAgeDays: null,
    },
  ],
};
it('uses the complete selected monthly window for the consolidated header and body', () => {
  const overview = categoryPeriodOverview(data, '3M');
  expect(overview.window).toEqual(['2026-07', '2026-08']);
  expect(overview.consumptionCents).toBe(39001);
});
it('orders category changes by magnitude with deterministic ties, without mutating the facts or changing the legacy order', () => {
  const original = JSON.stringify(data);
  const view = render(<CategoryBody data={data} period="1M" sortByChange />);
  const order = () =>
    [...view.container.querySelectorAll('.rc-row')].map((row) => row.getAttribute('data-category'));
  expect(order()).toEqual(['b', 'c', 'a']);
  expect(JSON.stringify(data)).toBe(original);
  expect(view.container.textContent).toContain('100');
  act(() => setAmountsHidden(true));
  expect(view.container.textContent).not.toContain('100,01');
  expect(view.container.textContent).toContain('•••');
  view.rerender(<CategoryBody data={data} period="1M" />);
  expect(order()).toEqual(['a', 'c', 'b']);
});

it('keeps missing prior periods unavailable and orders them deterministically', () => {
  const view = render(<CategoryBody data={data} period="Alles" sortByChange />);
  expect(
    [...view.container.querySelectorAll('.rc-row')].map((row) => row.getAttribute('data-category')),
  ).toEqual(['a', 'b', 'c']);
  for (const row of view.container.querySelectorAll('.rc-row'))
    expect(row.querySelectorAll('td')[3]?.textContent).toBe('–');
});
