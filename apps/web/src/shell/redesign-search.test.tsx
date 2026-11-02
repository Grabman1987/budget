// @vitest-environment jsdom
import { setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SearchResults } from './global-search';

const state = vi.hoisted(() => ({
  enabled: true,
  source: '/plan/monat?monat=2026-09&kategorie=synthetic-food&panel=buchung',
}));
const navigate = vi.fn();
vi.mock('./redesign-flag', () => ({
  get REDESIGN_ENABLED() {
    return state.enabled;
  },
}));
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useNavigate: () => navigate,
  useRouter: () => ({ history: { back() {} } }),
  useLocation: ({ select }: { select: (location: unknown) => unknown }) =>
    select({ state: { searchOpenedInApp: false } }),
  useSearch: () => ({ von: state.source }),
}));
const clients: QueryClient[] = [];
beforeEach(() => {
  state.enabled = true;
  state.source = '/plan/monat?monat=2026-09&kategorie=synthetic-food&panel=buchung';
  navigate.mockReset();
  setAmountsHidden(false);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async () => Response.json({ results: [] }));
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});
function search(term: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <SearchResults />
    </QueryClientProvider>,
  );
  const input = screen.getByRole('combobox', { name: 'Suchen' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: term } });
}

it.each([
  ['Wiederkehrende Zahlungen', 'Plan · Zahlungen', '/plan/erwartet'],
  ['Alle Buchungen', 'Konten · Buchungen', '/konten/buchungen'],
  ['Jahresplan', 'Plan · Jahr', '/plan/jahr'],
])('keeps the former name %s discoverable at its working destination', (term, label, to) => {
  search(term!);
  fireEvent.click(screen.getByRole('option', { name: new RegExp(label!) }));
  expect(navigate.mock.calls.at(-1)?.[0].to).toBe(to);
});

it('ON takes the selected month to a Plan page without a stale panel or foreign entity filter', () => {
  search('Zahlungen');
  fireEvent.click(screen.getByRole('option', { name: /Plan · Zahlungen/ }));
  expect(navigate).toHaveBeenLastCalledWith({ to: '/plan/erwartet', search: { monat: '2026-09' } });
});

it.each(['1J', '2025-01..2025-12'])(
  'ON takes report period %s and trend, without a source panel or category identity',
  (period) => {
    state.source = `/vermoegen/portfolio?zeitraum=${period}&trend=true&panel=buchung&kategorie=synthetic-food`;
    search('Gebühren');
    fireEvent.click(screen.getByRole('option', { name: /Bank- und Zinskosten/ }));
    expect(navigate).toHaveBeenLastCalledWith({
      to: '/reports/kosten',
      search: { zeitraum: period, trend: true },
    });
  },
);

it('ON does not carry an invalid wealth period into a report bookmark', () => {
  state.source = '/vermoegen/portfolio?zeitraum=invalid-period';
  search('Gebühren');
  fireEvent.click(screen.getByRole('option', { name: /Bank- und Zinskosten/ }));
  expect(navigate).toHaveBeenLastCalledWith({ to: '/reports/kosten', search: {} });
});

it('OFF preserves the existing search destination contract', () => {
  state.enabled = false;
  search('Gebühren');
  fireEvent.click(screen.getByRole('option', { name: /Bank- und Zinskosten/ }));
  expect(navigate).toHaveBeenLastCalledWith({ to: '/reports/kosten', search: {} });
});

it('OFF does not activate the additional redesign search terms', () => {
  state.enabled = false;
  search('Wiederkehrende Zahlungen');
  expect(screen.queryByRole('option', { name: /Plan · Zahlungen/ })).toBeNull();
});
