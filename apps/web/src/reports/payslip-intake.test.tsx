// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayslipSourceSection } from './payslip-intake';

const account = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  type: 'checking',
  onBudget: true,
  sortOrder: 1,
  closedAt: null,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        accounts: [
          account('depot', 'Depot Muster', { type: 'brokerage', onBudget: false, sortOrder: 1 }),
          account('card', 'Karte Muster', { type: 'credit_card', sortOrder: 2 }),
          account('b', 'Giro B', { sortOrder: 2 }),
          account('a', 'Giro A', { sortOrder: 3 }),
          account('old', 'Altes Konto', { closedAt: '2026-05-01T00:00:00.000Z' }),
        ],
        passwordSet: false,
        passwordSource: null,
        passwordRememberAvailable: false,
        dropboxConnected: false,
        dropboxConfigured: false,
        dropboxWrite: false,
        lastScanAt: null,
        filesFound: 0,
        errors: 0,
        errorCode: null,
        config: { salaryAccountId: null, wageTypes: {} },
      }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Gehaltskonto', () => {
  it('shows account groups in order, by sort order, without closed accounts', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <PayslipSourceSection />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const select = await screen.findByLabelText('Gehaltskonto');
    const groups = [...select.querySelectorAll('optgroup')];
    expect(groups.map((g) => g.label)).toEqual(['Budget-Konten', 'Kreditkarten', 'Investments']);
    expect([...groups[0]!.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Giro B',
      'Giro A',
    ]);
    expect(screen.queryByRole('option', { name: 'Altes Konto' })).toBeNull();
  });
});
