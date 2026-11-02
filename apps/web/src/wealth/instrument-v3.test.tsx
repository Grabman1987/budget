// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { InstrumentV3 } from './instrument-v3';
import type { SecurityRecord } from './portfolio-api';
import type { InstrumentHistoryController } from './price-history';
import { accountsQuery } from '../ledger/queries';
import { tradesQuery } from './trade-api';

vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [{ current: null }, 640] }));
vi.mock('./price-history', () => ({
  PriceHistory: () => null,
  InstrumentHistoryDrawing: () => null,
}));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(cleanup);
it('v3 instrument keeps zero distinct from missing basis and routes each action to its existing handler', () => {
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
  client.setQueryData(tradesQuery('synthetic').queryKey, { trades: [] });
  const edit = vi.fn(),
    quote = vi.fn(),
    trade = vi.fn();
  const history = {
    query: {
      data: { history: { from: '2026-09-01', to: '2026-09-17', points: [] } },
      isError: false,
      isPending: false,
    },
    range: null,
  } as unknown as InstrumentHistoryController;
  render(
    <QueryClientProvider client={client}>
      <InstrumentV3
        security={
          {
            id: 'synthetic',
            name: 'Synthetic instrument',
            kind: 'etf',
            currency: 'EUR',
            isin: null,
            symbol: null,
          } as SecurityRecord
        }
        position={{
          securityId: 'synthetic',
          name: 'Synthetic instrument',
          unitsE8: 0,
          valueCents: 0,
          costCents: null,
          gainCents: null,
          gainBp: null,
          shareBp: null,
          quote: null,
          accounts: [],
        }}
        state="ready"
        history={history}
        asOf="2026-09-17"
        period="YTD"
        heading={createRef()}
        saving={false}
        canQuote
        onEdit={edit}
        onQuote={quote}
        onTrade={trade}
        onRetry={vi.fn()}
      />
    </QueryClientProvider>,
  );
  for (const name of ['Wert und Einstand', 'Transaktionen', 'Stammdaten'])
    expect(screen.getByRole('heading', { name })).toBeTruthy();
  expect(screen.getByText('0,00 €')).toBeTruthy();
  expect(screen.getByText('Einstand nicht vollständig dokumentiert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Handel erfassen' }));
  expect(trade).toHaveBeenCalledWith('neu');
  fireEvent.click(screen.getByRole('button', { name: 'Kurs eintragen' }));
  expect(quote).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Stammdaten bearbeiten' }));
  expect(edit).toHaveBeenCalledOnce();
  client.clear();
});
