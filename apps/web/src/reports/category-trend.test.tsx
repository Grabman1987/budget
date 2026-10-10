// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { CategoryTrend } from './category-trend';
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 320] }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({
    search,
    children,
    ...props
  }: {
    search: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a {...props} href={`/konten/buchungen?${new URLSearchParams(search)}`}>
      {children}
    </a>
  ),
}));
afterEach(() => setAmountsHidden(false));

it('links exact month values and keeps a missing previous year distinct from zero in the chart and table', () => {
  const { container, rerender } = render(
    <CategoryTrend
      series={[
        {
          category: { id: 'food', name: 'Essen' },
          points: [
            { month: '2024-02', spentCents: 10001, assignedCents: 0, previousCents: null },
            { month: '2024-03', spentCents: 0, assignedCents: 0, previousCents: 0 },
          ],
        },
      ]}
      previous
    />,
  );
  const link = screen
    .getAllByRole('link', { name: 'Essen · Februar 2024 · 100,01 €' })
    .find((node) => node.tagName === 'A')!;
  expect(link.getAttribute('href')).toContain('bis=2024-02-29');
  expect(link.getAttribute('href')).toContain('basis=category-spending');
  expect(container.querySelector('tbody td div')?.textContent).toBe('–');
  expect(container.querySelector('tbody td div')?.querySelector('a')).toBeNull();
  expect(container.querySelector('.l-prev')?.getAttribute('d')).not.toContain('NaN');
  fireEvent.focus(screen.getAllByRole('group', { name: 'Kategorietrend' })[0]!);
  expect(screen.getByRole('status').textContent).toContain('Vorjahresmonat–');
  setAmountsHidden(true);
  rerender(
    <CategoryTrend
      series={[
        {
          category: { id: 'food', name: 'Essen' },
          points: [{ month: '2024-02', spentCents: 10001, assignedCents: 0, previousCents: null }],
        },
      ]}
      previous
    />,
  );
  expect(container.textContent).not.toContain('100,01');
  expect(screen.queryByRole('link', { name: /100,01/ })).toBeNull();
});
