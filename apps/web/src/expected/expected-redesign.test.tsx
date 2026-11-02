// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { paymentsPreview } from '@budget/domain';
import { ToastProvider } from '@budget/ui';
import { ExpectedPage } from './expected-page';
import { validateExpectedSearch } from './search';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: ({ select }: { select: (value: object) => unknown }) =>
    select({ state: {}, search: { ansicht: 'kalender' } }),
}));
vi.mock('../shell/use-month', () => ({ useMonth: () => ['2026-10'] }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 800] }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('ON opens the full twelve-month calendar from URL state without an occurrence-refresh POST', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const methods: string[] = [];
  vi.stubGlobal('fetch', async (input: string, options?: RequestInit) => {
    methods.push(options?.method ?? 'GET');
    const path = new URL(input, 'http://localhost').pathname;
    if (path === '/api/expected/year-preview')
      return Response.json(paymentsPreview('2026-10-15', [], []));
    if (path === '/api/expected') return Response.json({ payments: [] });
    if (path === '/api/expected/income')
      return Response.json({ expectedCents: 0, receivedCents: 0, byPayment: [], byIncomeType: [] });
    if (path === '/api/lookups')
      return Response.json({
        accounts: [],
        categories: [],
        groups: [],
        payees: [],
        contacts: [],
        incomeTypes: [],
      });
    return Response.json({ error: 'unexpected' }, { status: 404 });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ExpectedPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('heading', { name: 'Zahlungskalender' });
  expect(container.querySelectorAll('.preview-table thead th')).toHaveLength(14);
  expect(screen.getByRole('button', { name: 'Kalender' }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(methods.every((method) => method === 'GET')).toBe(true);
  client.clear();
});
it('bounds calendar/list URL state and restores the existing horizons', () => {
  expect(validateExpectedSearch({ ansicht: 'kalender', tage: '90', art: 'inflow' })).toEqual({
    ansicht: 'kalender',
    tage: 90,
    art: 'inflow',
  });
  expect(validateExpectedSearch({ ansicht: 'invented', tage: -1 })).toEqual({
    ansicht: undefined,
    tage: 35,
    art: 'all',
  });
});
