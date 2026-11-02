// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { WealthActivities } from './redesign-positions';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { instrumentsQuery } from './portfolio-api';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
it('filters activities by asset kind and opens the existing trade with its identity and fees', () => {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const seed = (key: readonly unknown[], value: unknown) => client.setQueryData(key, value);
  seed(instrumentsQuery().queryKey, {
    securities: [
      { id: 'crypto', kind: 'crypto', name: 'Synthetic crypto' },
      { id: 'equity', kind: 'etf', name: 'Synthetic equity' },
    ],
  });
  seed(accountsQuery().queryKey, {
    accounts: [{ id: 'depot', name: 'Synthetic depot', currency: 'EUR' }],
  });
  seed([...LEDGER_KEY, 'wealth-activities', '2026-09-01', '2026-09-17'], {
    trades: [
      ...['crypto', 'equity'].map((securityId) => ({
        id: `trade-${securityId}`,
        securityId,
        accountId: 'depot',
        kind: 'buy',
        date: '2026-09-10',
        unitsE8: 100000000,
        amountCents: 10000,
        feeCents: 123,
        taxCents: 45,
      })),
      {
        id: 'signed-split',
        securityId: 'crypto',
        accountId: 'depot',
        kind: 'split',
        date: '2026-09-11',
        unitsE8: -50000000,
        amountCents: 0,
        feeCents: 0,
        taxCents: 0,
      },
    ],
  });
  const edit = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <WealthActivities art="krypto" from="2026-09-01" to="2026-09-17" onEdit={edit} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/Kauf · Synthetic crypto/)).toBeTruthy();
  expect(screen.queryByText(/Synthetic equity/)).toBeNull();
  expect(screen.getByRole('region', { name: 'Aktivitäten' }).textContent).toContain(
    'Gebühren 1,23 € · Steuer 0,45 €',
  );
  expect(screen.getByRole('region', { name: 'Aktivitäten' }).textContent).toContain('−0,5 Stück');
  fireEvent.click(
    within(screen.getByText('Kauf · Synthetic crypto').closest('li')!).getByRole('button', {
      name: 'Bearbeiten',
    }),
  );
  expect(edit).toHaveBeenCalledExactlyOnceWith('trade-crypto', 'crypto');
  client.clear();
});
