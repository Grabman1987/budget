// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { setAmountsHidden } from '@budget/ui';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PriceHistory, useInstrumentHistory } from './price-history';

afterEach(() => {
  act(() => setAmountsHidden(false));
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const prices = [
  { date: '2024-09-17', priceMicro: 500000 },
  { date: '2025-09-17', priceMicro: 1000000 },
  { date: '2026-03-17', priceMicro: 2000000 },
  { date: '2026-08-17', priceMicro: 3000000 },
  { date: '2026-09-17', priceMicro: 4123456 },
].map((p) => ({ ...p, securityId: 'synthetic', currency: 'USD', source: 'manual' }));

function page(status = 200, series = prices) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 760,
    height: 280,
    top: 0,
    bottom: 280,
    left: 0,
    right: 760,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (input: RequestInfo | URL) =>
        new Response(
          JSON.stringify(
            String(input).includes('/history?')
              ? {
                  history: {
                    from: '2024-09-17',
                    to: '2026-09-17',
                    points: [],
                    events: [],
                    position: null,
                    unavailable: null,
                    costMethod: 'average',
                    unit: 'EUR',
                    securityId: 'synthetic',
                  },
                }
              : status === 200
                ? { securityId: 'synthetic', currency: 'USD', prices: series }
                : { error: 'unavailable' },
          ),
          { status: String(input).includes('/history?') ? 200 : status },
        ),
    ),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <History />
    </QueryClientProvider>,
  );
}
function History() {
  const controller = useInstrumentHistory('synthetic', '2026-09-17', 'Alles');
  return <PriceHistory securityId="synthetic" controller={controller} />;
}

it('mounts every exact instrument table row only while its native disclosure is open', async () => {
  page();
  await userEvent.click(screen.getByRole('button', { name: /^Kurs$/ }));
  await screen.findByTestId('price-history-chart');
  const summary = screen.getByText('Tabelle anzeigen');
  const disclosure = summary.closest('details')!;
  expect(disclosure.querySelectorAll('tbody tr')).toHaveLength(0);
  await userEvent.click(summary);
  const table = await screen.findByRole('table');
  expect(Array.from(table.querySelectorAll('tbody tr'), (row) =>
    Array.from(row.children, (cell) => cell.textContent),
  )).toEqual([
    ['17.09.2024', 'Kurs je Stück', '0,50 USD'],
    ['17.09.2025', 'Kurs je Stück', '1,00 USD'],
    ['17.03.2026', 'Kurs je Stück', '2,00 USD'],
    ['17.08.2026', 'Kurs je Stück', '3,00 USD'],
    ['17.09.2026', 'Kurs je Stück', '4,123456 USD'],
  ]);
  act(() => setAmountsHidden(true));
  expect(within(table).getAllByText('•••')).toHaveLength(5);
  expect(table.textContent).not.toContain('4,123456');
  expect(table.textContent).toContain('17.09.2026');
  await userEvent.click(summary);
  expect(disclosure.open).toBe(false);
  expect(disclosure.querySelectorAll('tbody tr')).toHaveLength(0);
});

it('filters stored quotes inclusively for 1M, 6M, 1J and Max and inspects exact native prices', async () => {
  page();
  await userEvent.click(screen.getByRole('button', { name: /^Kurs$/ }));
  const chart = await screen.findByTestId('price-history-chart');
  expect(chart.querySelectorAll('[data-chart-point]')).toHaveLength(5);
  for (const [range, count] of [
    ['1M', 2],
    ['6M', 3],
    ['1J', 4],
    ['Max', 5],
  ] as const) {
    await userEvent.click(screen.getByRole('button', { name: range }));
    expect(chart.querySelectorAll('[data-chart-point]')).toHaveLength(count);
  }
  await userEvent.tab();
  chart.parentElement!.focus();
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  const tooltip = screen.getByRole('status');
  expect(tooltip.textContent).toContain('4,123456 USD');
  expect(tooltip.textContent).toContain('17.09.2026');
});

it('shows an empty state for no stored quotes', async () => {
  page(200, []);
  await userEvent.click(screen.getByRole('button', { name: /^Kurs$/ }));
  expect(await screen.findByText('Keine gespeicherten Kurse im Zeitraum.')).toBeTruthy();
  expect(screen.queryByTestId('price-history-chart')).toBeNull();
});

it('shows a retry action when price history is unavailable', async () => {
  page(503);
  await userEvent.click(screen.getByRole('button', { name: /^Kurs$/ }));
  expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
  expect(screen.queryByTestId('price-history-chart')).toBeNull();
});
