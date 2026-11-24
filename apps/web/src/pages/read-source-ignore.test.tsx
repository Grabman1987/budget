// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoReadSourceSection } from './read-source';

vi.mock('../inbox/inbox-page', () => ({ InboxWorkflow: () => null }));
const calls: Array<{ method: string; path: string; body: unknown }> = [];
let ignored: string[] = [];
vi.mock('../api/http', async () => ({
  ...(await vi.importActual('../api/http')),
  request: async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === 'PUT' && path.endsWith('/ignore')) {
      const input = body as { key: string; ignored: boolean };
      ignored = input.ignored ? [input.key] : [];
      return { groupId: 'g' };
    }
    return {
      configured: true,
      running: false,
      lastSuccess: null,
      lastAttempt: null,
      status: 'ok',
      balances: [
        {
          key: 'currency:usd',
          currency: 'USD',
          label: 'Wallet USD',
          amount: { value: '0', assetId: null, currencyId: 'usd', cents: 0 },
        },
        {
          key: 'currency:eur',
          currency: 'EUR',
          amount: { value: '1', assetId: null, currencyId: 'eur', cents: 100 },
        },
      ],
      mappings: [],
      ignored,
      since: null,
      match: { matched: 0, missing: 0, unmapped: 0, informational: 0 },
      accounts: [
        {
          id: 'cash',
          name: 'Verrechnung Muster',
          currency: 'EUR',
          type: 'checking',
          onBudget: false,
          sortOrder: 1,
          closedAt: null,
        },
      ],
      securities: [],
    };
  },
}));
beforeEach(() => {
  calls.length = 0;
  ignored = [];
});
afterEach(cleanup);

describe('Nicht abbilden', () => {
  it('explains a wallet without account, ignores it and maps it again', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CryptoReadSourceSection />
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText('Kein Konto in USD. Diese Wallet kann nicht abgebildet werden.'),
    ).toBeTruthy();
    // The EUR wallet has an account, so no hint, but the secondary action is still offered.
    expect(screen.getAllByRole('button', { name: 'Nicht abbilden' })).toHaveLength(2);
    expect(screen.getAllByText(/Kein Konto in/)).toHaveLength(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Nicht abbilden' })[0]!);
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      path: '/api/sources/crypto/ignore',
      body: { key: 'currency:usd', ignored: true },
    });
    expect(await screen.findByText('Bewusst nicht abgebildet')).toBeTruthy();
    // An ignored key is not waiting for a mapping.
    expect(document.querySelectorAll('[data-source-mapping]')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Wieder abbilden' }));
    await waitFor(() => expect(screen.queryByText('Bewusst nicht abgebildet')).toBeNull());
    expect(document.querySelectorAll('[data-source-mapping]')).toHaveLength(2);
  });
});
