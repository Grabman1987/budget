// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { GlobalSearch } from './global-search';
const navigate = vi.fn();
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNavigate: () => navigate,
  useRouter: () => ({
    state: { location: { pathname: '/plan/monat', href: '/plan/monat?monat=2026-08' } },
  }),
  useLocation: () => ({ pathname: '/plan/monat', href: '/plan/monat?monat=2026-08' }),
}));
beforeEach(() => {
  navigate.mockReset();
  navigate.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
it('opens the search page through Ctrl K and the header with the source month', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({ to: '/suche', search: { von: '/plan/monat?monat=2026-08' } }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Suchen' }));
  expect(navigate).toHaveBeenCalledTimes(2);
});
