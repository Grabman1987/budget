// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { InstrumentHistory } from '@budget/db';
import { eachDay } from '@budget/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PriceHistory, useInstrumentHistory } from './price-history';

let requests: string[];
let unexpected: string[];
beforeEach(() => {
  requests = [];
  unexpected = [];
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const size = { inlineSize: 640, blockSize: 280 };
      this.callback([{
        target,
        contentRect: new DOMRectReadOnly(0, 0, 640, 280),
        borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size],
      }], this);
    }
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  expect(unexpected).toEqual([]);
});
const prices = [
  { date: '2024-09-17', priceMicro: 500000 },
  { date: '2025-09-17', priceMicro: 1000000 },
  { date: '2026-03-17', priceMicro: 2000000 },
  { date: '2026-08-17', priceMicro: 3000000 },
  { date: '2026-09-17', priceMicro: 4123456 },
].map((p) => ({ ...p, securityId: 'synthetic', currency: 'USD', source: 'manual' }));

function PriceFixture() {
  const controller = useInstrumentHistory('synthetic', '2026-09-17', 'Alles');
  return <PriceHistory securityId="synthetic" controller={controller} />;
}

async function page(status = 200, series = prices) {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
    requests.push(key);
    const isGet = (init?.method ?? 'GET') === 'GET';
    if (isGet && url.pathname === '/api/securities/synthetic/prices' && !url.search) {
      return Response.json(status === 200
        ? { securityId: 'synthetic', currency: 'USD', prices: series }
        : { error: 'unavailable' }, { status });
    }
    const from = url.searchParams.get('from');
    if (isGet && url.pathname === '/api/securities/synthetic/history' &&
      url.searchParams.get('to') === '2026-09-17' &&
      [null, '2026-08-17', '2026-03-17', '2025-09-17'].includes(from) &&
      url.searchParams.getAll('to').length === 1 && url.searchParams.getAll('from').length <= 1 &&
      [...url.searchParams.keys()].every((key) => key === 'from' || key === 'to')) {
      const historyFrom = from ?? '2026-09-17';
      const history = {
        securityId: 'synthetic', from: historyFrom, to: '2026-09-17',
        unit: 'EUR', position: null, costMethod: 'average',
        points: eachDay(historyFrom, '2026-09-17').map((date) => ({
          date, unitsE8: 0, valueCents: 0, quality: 'exact', missing: null, observations: [],
        })),
        events: [], unavailable: null,
      } satisfies InstrumentHistory;
      return Response.json({ history });
    }
    unexpected.push(key);
    return Response.json({ error: 'unexpected_test_request' }, { status: 500 });
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PriceFixture />
    </QueryClientProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Kurs' }));
  expect(requests).toContain('GET /api/securities/synthetic/prices');
  expect(requests).toContain('GET /api/securities/synthetic/history?to=2026-09-17');
}

it('filters stored quotes inclusively for 1M, 6M, 1J and Max and inspects exact native prices', async () => {
  await page();
  const chart = await screen.findByTestId('price-history-chart');
  await userEvent.click(screen.getByText('Tabelle anzeigen'));
  const table = screen.getByRole('table');
  expect(table.querySelectorAll('tbody tr')).toHaveLength(5);
  for (const [range, count] of [
    ['1M', 2],
    ['6M', 3],
    ['1J', 4],
    ['Max', 5],
  ] as const) {
    await userEvent.click(screen.getByRole('button', { name: range }));
    expect(table.querySelectorAll('tbody tr')).toHaveLength(count);
  }
  await userEvent.tab();
  chart.parentElement!.focus();
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
  const tooltip = screen.getByRole('status');
  expect(tooltip.textContent).toContain('4,123456 USD');
  expect(tooltip.textContent).toContain('17.09.2026');
});

it('shows an empty state for no stored quotes', async () => {
  await page(200, []);
  expect(await screen.findByText('Keine gespeicherten Kurse im Zeitraum.')).toBeTruthy();
  expect(screen.queryByTestId('price-history-chart')).toBeNull();
});

it('shows a retry action when price history is unavailable', async () => {
  await page(503);
  expect(await screen.findByRole('button', { name: 'Erneut versuchen' })).toBeTruthy();
  expect(screen.queryByTestId('price-history-chart')).toBeNull();
});
