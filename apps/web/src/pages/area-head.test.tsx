// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { AUTH_STATUS_KEY } from '../auth/status-query';
import { ACCOUNT_PAGE, PAGES } from '../nav/pages';
import { AreaHead } from './area-head';

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));
vi.mock('../shell/use-month', () => ({
  useMonth: () => ['2026-10'],
  currentMonth: () => '2026-10',
}));
vi.mock('../budget/month-span', () => ({ useMonthSpan: () => 1 }));

it('the settings profile header also names a recovery session', () => {
  const client = new QueryClient();
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery: true });
  render(
    <QueryClientProvider client={client}>
      <AreaHead meta={PAGES.find((p) => p.area === 'einstellungen')!} />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Wiederherstellungscode')).toBeTruthy();
  expect(screen.queryByText('Passkey · dieses Gerät')).toBeNull();
});

it('the account header uses the supplied source boundary rather than today and a fixed sync claim', () => {
  const client = new QueryClient();
  client.setQueryData(AUTH_STATUS_KEY, { authenticated: true, viaRecovery: false });
  render(
    <QueryClientProvider client={client}>
      <AreaHead
        meta={ACCOUNT_PAGE}
        accountFields={[
          { label: 'Bankstand vom', value: '08.10.2026' },
          { label: 'Bank-Sync', value: 'Abruf gespeichert' },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText('08.10.2026')).toBeTruthy();
  expect(screen.getByText('Abruf gespeichert')).toBeTruthy();
  expect(screen.queryByText('nicht eingerichtet')).toBeNull();
  expect(screen.queryByText('Stand')).toBeNull();
});
