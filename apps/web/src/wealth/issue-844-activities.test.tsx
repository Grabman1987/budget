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

it('ON positions render the twelve v3 columns and a whole instrument once across class splits', async () => {
  const { PositionsV3 } = await import('./positions-v3');
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(accountsQuery().queryKey, {
    asOf: '2026-09-17',
    accounts: [],
    netWorthEurCents: 0,
    missingFxCurrencies: [],
    missingPriceSecurityIds: [],
  });
  const position = {
    securityId: 'synthetic',
    name: 'Synthetic instrument',
    unitsE8: 200000000,
    quote: { priceMicro: 2000000, currency: 'EUR', date: '2026-09-17', source: 'manual' },
    valueCents: 400,
    costCents: 300,
    gainCents: 100,
    gainBp: 3333,
    shareBp: 10000,
    accounts: [],
  };
  render(
    <QueryClientProvider client={client}>
      <PositionsV3
        view={{
          asOf: '2026-09-17',
          costMethod: 'average',
          valueCents: 400,
          costCents: 300,
          gainCents: 100,
          chain: null,
          positions: [position],
          classes: ['a', 'b'].map((id) => ({
            id,
            name: id,
            valueCents: 200,
            shareBp: 5000,
            positions: [position],
          })),
        }}
        securities={[{ id: 'synthetic', kind: 'etf' } as never]}
        art="alle"
        period="YTD"
        activities={false}
        onMode={vi.fn()}
        onSelect={vi.fn()}
        onTrade={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const table = screen.getByRole('table', { name: 'Positionen nach Anlageart' });
  expect(within(table.querySelector('thead')!).getAllByRole('columnheader')).toHaveLength(12);
  expect(within(table).getAllByRole('button', { name: 'Synthetic instrument' })).toHaveLength(1);
  expect(within(table).getByText('1,50 €')).toBeTruthy();
  expect(within(table).getByText('a · b')).toBeTruthy();
  client.clear();
});
