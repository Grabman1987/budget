// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AUTH_STATUS_KEY } from '../auth/status-query';
import { PAGES } from '../nav/pages';
import { AreaHead } from './area-head';

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));
vi.mock('../shell/use-month', () => ({
  useMonth: () => ['2026-10'],
  currentMonth: () => '2026-10',
}));
vi.mock('../budget/month-span', () => ({ useMonthSpan: () => 1 }));
afterEach(cleanup);
it('leaves bank status to the real Prüfen block while preserving Stand, other account headers and supplied account fields', () => {
  const client = new QueryClient();
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery: false });
  const review = PAGES.find((page) => page.path === '/konten/pruefen')!;
  const bookings = PAGES.find((page) => page.path === '/konten/buchungen')!;
  const show = (meta = review, accountFields?: { label: string; value: string }[]) => (
    <QueryClientProvider client={client}>
      <AreaHead meta={meta} accountFields={accountFields} />
    </QueryClientProvider>
  );
  const { rerender } = render(show());
  expect(screen.getByText('Stand')).toBeTruthy();
  expect(screen.queryByText('Bank-Sync')).toBeNull();
  expect(screen.queryByText('nicht eingerichtet')).toBeNull();
  rerender(show(bookings));
  expect(screen.getByText('Stand')).toBeTruthy();
  expect(screen.getByText('Bank-Sync')).toBeTruthy();
  expect(screen.getByText('nicht eingerichtet')).toBeTruthy();
  rerender(
    show(review, [
      { label: 'Bankstand vom', value: '08.10.2026' },
      { label: 'Bank-Sync', value: 'Abruf gespeichert' },
    ]),
  );
  expect(screen.getByText('08.10.2026')).toBeTruthy();
  expect(screen.getByText('Abruf gespeichert')).toBeTruthy();
  expect(screen.queryByText('nicht eingerichtet')).toBeNull();
  client.clear();
});
