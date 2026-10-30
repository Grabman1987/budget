// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { expectedQuery } from '../expected/api';
import { liquidityQuery, type LiquidityReportView } from '../reports/liquidity-api';
import { CompactForecastCard } from './compact-forecast-card';
import { forecast35dFixture } from './forecast.test-fixture';
import type { HeuteForecast35d } from './api';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/redesign-flag', () => flags);
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 360] }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({
    to,
    search,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string;
    search: Record<string, string>;
    children: ReactNode;
  }) => (
    <a href={`${to}?${new URLSearchParams(search)}`} {...props}>
      {children}
    </a>
  ),
}));

let client: QueryClient;
const ready = { isPending: false, isFetching: false, isError: false };

beforeEach(() => {
  flags.REDESIGN_ENABLED = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const report = forecast35dFixture().report;
  const wrongLow = { day: '2026-03-18', index: 0, cents: 777_777 };
  const oldQuery: LiquidityReportView = {
    asOf: '2026-03-18',
    available: true,
    report: {
      ...report,
      startCents: 777_777,
      points: report.points.map((point) => ({
        ...point,
        balanceCents: 777_777,
        bufferCents: 777_777,
        plainCents: 777_777,
      })),
      low: wrongLow,
      lowBuffer: wrongLow,
      lowPlain: wrongLow,
      verdictDays: 184,
      verdictEnd: '2026-09-18',
      verdict: { status: 'ok', day: null, month: null, shortfallCents: 0 },
      months: [],
      movements: [],
      levers: [],
    },
    events: [],
    incomePauses: [],
    overdraftLimitCents: 0,
    budgetAccounts: [{ id: 'synthetic', name: 'Synthetic budget account' }],
  };
  client.setQueryData(liquidityQuery('35d', []).queryKey, oldQuery);
  client.setQueryData(expectedQuery().queryKey, []);
});
afterEach(() => {
  cleanup();
  client.clear();
});

function mount(forecast35d: HeuteForecast35d | undefined, read = ready) {
  const data = { ...(forecast35d && { forecast35d }), balance: { low: { cents: 777_777 } } };
  return render(
    <QueryClientProvider client={client}>
      <CompactForecastCard data={data} read={read} />
    </QueryClientProvider>,
  );
}
const low = () => document.querySelector('.heute-forecast-low');

it('ON renders the response-owned path and low, ignoring a different cached canonical query', () => {
  mount(forecast35dFixture());
  expect(low()?.getAttribute('data-cents')).toBe('87500');
  expect(low()?.getAttribute('data-day')).toBe('2026-04-22');
  expect(screen.getByTestId('liquidity-lowpoint').getAttribute('data-cents')).toBe('87500');
  expect(screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' }).textContent).not.toContain(
    '7.777,77',
  );
});
it('OFF retains the existing independent canonical query rather than selecting the new response field', () => {
  flags.REDESIGN_ENABLED = false;
  mount(forecast35dFixture());
  expect(low()?.getAttribute('data-cents')).toBe('777777');
  expect(low()?.getAttribute('data-day')).toBe('2026-03-18');
});
it('ON withholds supplied stale data during an aggregate refetch', () => {
  mount(forecast35dFixture(), { ...ready, isFetching: true });
  expect(low()).toBeNull();
  expect(screen.queryByTestId('liquidity-chart')).toBeNull();
  expect(
    screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' }).getAttribute('aria-busy'),
  ).toBe('true');
});
it('ON falls back to the same independent 35-day query only when the aggregate failed', () => {
  mount(forecast35dFixture(), { ...ready, isError: true });
  expect(low()?.getAttribute('data-cents')).toBe('777777');
});
it('ON treats an older response without the field as unavailable instead of using another low', () => {
  mount(undefined);
  expect(screen.getByText('Die gespeicherte 35-Tage-Prognose ist nicht verfügbar.')).toBeTruthy();
  expect(low()).toBeNull();
});
it('ON preserves a real zero and its earliest date', () => {
  const fixture = forecast35dFixture();
  fixture.report.startCents = 0;
  fixture.report.points = fixture.report.points.map((point) => ({
    ...point,
    balanceCents: 0,
    bufferCents: 0,
    plainCents: 0,
  }));
  fixture.report.low = { day: '2026-03-18', index: 0, cents: 0 };
  mount(fixture);
  expect(low()?.getAttribute('data-cents')).toBe('0');
  expect(low()?.getAttribute('data-day')).toBe('2026-03-18');
});
it.each([
  { asOf: '2026-03-18', horizon: '35d', levers: [], available: false, report: null },
  {
    asOf: '2026-03-18',
    horizon: '35d',
    levers: [],
    unavailable: {
      reason: 'missing_fx',
      asOf: '2026-03-18',
      message: 'Ein benötigter Wechselkurs fehlt.',
    },
  },
] satisfies HeuteForecast35d[])(
  'ON does not turn an unavailable source into a low or zero',
  (fixture) => {
    mount(fixture);
    expect(low()).toBeNull();
    expect(screen.queryByTestId('liquidity-chart')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Kontoprognose · 35 Tage' }).textContent,
    ).not.toContain('7.777,77');
  },
);
