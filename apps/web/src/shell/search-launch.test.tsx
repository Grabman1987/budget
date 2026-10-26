// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  useSearch: () => ({}),
}));
beforeEach(() => {
  navigate.mockReset();
  navigate.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ results: [] }))),
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
it('returns focus to the field that opened the palette through the shortcut', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <input aria-label="Quellfeld" />
      <GlobalSearch />
    </QueryClientProvider>,
  );
  const source = screen.getByRole('textbox', { name: 'Quellfeld' });
  source.focus();
  fireEvent.keyDown(source, { key: 'k', ctrlKey: true });
  const input = screen.getByRole('combobox', { name: 'Suchen' });
  await waitFor(() => expect(document.activeElement).toBe(input));
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(source));
});
it('opens an overlay without navigation, limits the empty state and returns focus on Escape', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  const trigger = screen.getByRole('button', {
    name: 'Suchen: Seiten, Reports, Buchungen, Aktionen',
  });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const dialog = screen.getByRole('dialog', { name: 'Suchen' });
  const input = within(dialog).getByRole('combobox', { name: 'Suchen' });
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(navigate).not.toHaveBeenCalled();
  expect(within(dialog).getAllByRole('option')).toHaveLength(4);
  expect(within(dialog).queryByRole('group', { name: 'Seiten' })).toBeNull();
  fireEvent.change(input, { target: { value: 'Neue Buchung' } });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(screen.queryByRole('dialog', { name: 'Suchen' })).toBeNull();
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(navigate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      to: '/plan/monat',
      search: { monat: '2026-08', panel: 'buchung' },
    }),
  );
});
