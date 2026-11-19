// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { registerOccurrencesQuery } from '../expected/api';
import { accountsQuery, futureBookingsQuery } from './queries';
import { useUpcomingRegister } from './upcoming-register';

vi.mock('@budget/ui', async (original) => ({
  ...(await original<object>()),
  useIsPhone: () => false,
}));

afterEach(() => vi.unstubAllGlobals());

it('marks the retained upcoming balance pending while its separate account read refreshes', async () => {
  const today = '2026-10-19';
  const filter = { accountId: 'synthetic-account' };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const accountKey = [...accountsQuery().queryKey, today];
  const accounts = (balanceCents: number) => ({
    accounts: [{ id: filter.accountId, currency: 'EUR', balanceCents }],
  });
  client.setQueryData(accountKey, accounts(10_000));
  client.setQueryData(futureBookingsQuery(filter, today).queryKey, []);
  client.setQueryData(registerOccurrencesQuery(today).queryKey, []);
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetch = vi.fn().mockReturnValueOnce(pending);
  vi.stubGlobal('fetch', fetch);
  function Register() {
    const { model, notes } = useUpcomingRegister(filter, today, 'account');
    return (
      <>
        {notes}
        <output>{model?.balanceLabel}</output>
      </>
    );
  }
  const register = render(
    <QueryClientProvider client={client}>
      <Register />
    </QueryClientProvider>,
  );
  try {
    expect(screen.getByText('100,00 €')).toBeTruthy();
    act(() => {
      void client.refetchQueries({ queryKey: accountKey, exact: true });
    });
    await screen.findByText('Kommende Buchungen werden geladen …');
    expect(screen.getByText('100,00 €')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => release(Response.json(accounts(9_000))));
    await waitFor(() =>
      expect(screen.queryByText('Kommende Buchungen werden geladen …')).toBeNull(),
    );
    expect(screen.getByText('90,00 €')).toBeTruthy();
    expect(screen.queryByText('100,00 €')).toBeNull();
  } finally {
    release(Response.json(accounts(9_000)));
    register.unmount();
    client.clear();
  }
});
