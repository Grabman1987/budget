// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import {
  CategoryDrilldownRow,
  categoryMonthFilter,
  categoryMonthSearch,
} from './category-drilldown';
import { overflowsHorizontally, ScrollHint } from './scroll-hint';

const api = vi.hoisted(() => ({ fetchBookings: vi.fn() }));
vi.mock('../ledger/api', () => api);
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, search, children }: { to: string; search: object; children: string }) => (
    <a href={`${to}?${new URLSearchParams(search as Record<string, string>)}`}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  api.fetchBookings.mockReset();
  act(() => setAmountsHidden(false));
});

const page = {
  items: [
    {
      id: 'b1',
      date: '2026-08-03',
      payeeName: 'Synthetic Shop',
      memo: 'weekly',
      amountCents: -1200,
      categorySpendingCents: 1200,
    },
    {
      id: 'b2',
      date: '2026-08-20',
      payeeName: null,
      memo: null,
      amountCents: -300,
      categorySpendingCents: 300,
    },
  ],
  nextCursor: null,
  total: 2,
  sumCents: -1500,
  categorySpendingCents: 1500,
};
function view() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <table>
        <tbody>
          <CategoryDrilldownRow
            id="cat-1"
            name="Haushalt"
            month="2026-08"
            columns={4}
            cells={['15,00 €', '0,00 €', '15,00 €']}
          />
        </tbody>
      </table>
    </QueryClientProvider>,
  );
}

it('loads nothing until expanded, then lists bookings with total and link, and collapses again', async () => {
  api.fetchBookings.mockResolvedValue(page);
  view();
  const toggle = screen.getByRole('button', { name: /Haushalt/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(api.fetchBookings).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(await screen.findByText('Synthetic Shop')).toBeTruthy();
  expect(api.fetchBookings).toHaveBeenCalledWith(
    expect.objectContaining({
      categoryId: 'cat-1',
      basis: 'category-spending',
      from: '2026-08-01',
      to: '2026-08-31',
      sort: 'date',
      direction: 'asc',
    }),
    undefined,
    200,
  );
  expect(screen.getByText('03.08.')).toBeTruthy();
  expect(screen.getByText('12,00 €')).toBeTruthy();
  expect(screen.getByText('Summe').parentElement?.textContent).toContain('15,00 €');
  const link = screen.getByRole('link', { name: 'Alle in Buchungen öffnen' });
  const params = new URL(link.getAttribute('href')!, 'http://x').searchParams;
  expect(link.getAttribute('href')).toMatch(/^\/konten\/buchungen\?/);
  expect(params.get('kategorie')).toBe('cat-1');
  expect(params.get('von')).toBe('2026-08-01');
  expect(params.get('bis')).toBe('2026-08-31');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
});

it('masks booking amounts and memos when amounts are hidden', async () => {
  api.fetchBookings.mockResolvedValue(page);
  view();
  act(() => setAmountsHidden(true));
  fireEvent.click(screen.getByRole('button', { name: /Haushalt/ }));
  await screen.findByText('Synthetic Shop');
  expect(document.body.textContent).not.toContain('12,00');
  expect(document.body.textContent).not.toContain('15,00 €Alle');
});

it('builds filter and search params of the month', () => {
  expect(categoryMonthFilter('c', '2026-02')).toMatchObject({
    from: '2026-02-01',
    to: '2026-02-28',
  });
  expect(categoryMonthSearch('c', '2026-02')).toEqual({
    kategorie: 'c',
    basis: 'category-spending',
    von: '2026-02-01',
    bis: '2026-02-28',
  });
});

it('overflow detection and the hint follow the real scroll width', () => {
  expect(overflowsHorizontally({ scrollWidth: 400, clientWidth: 390 })).toBe(true);
  expect(overflowsHorizontally({ scrollWidth: 390, clientWidth: 390 })).toBe(false);
  expect(overflowsHorizontally({ scrollWidth: 391, clientWidth: 390 })).toBe(false);
  let measure: () => void = () => undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        measure = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  const { container } = render(
    <div>
      <ScrollHint />
    </div>,
  );
  const hint = screen.getByText('Seitlich wischen für weitere Spalten');
  expect(hint.hidden).toBe(true);
  const box = container.firstElementChild as HTMLElement;
  Object.defineProperty(box, 'scrollWidth', { configurable: true, value: 600 });
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: 390 });
  act(() => measure());
  expect(hint.hidden).toBe(false);
  vi.unstubAllGlobals();
});
