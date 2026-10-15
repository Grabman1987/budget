// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayslipIntakeDetail, PayslipSourceSection, PayslipUpload } from './payslip-intake';
import type { ReactNode } from 'react';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

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

it('accepts a dropped PDF without the native chooser and rejects ambiguous or non-PDF drops', async () => {
  const fetch = vi.fn(async () => Response.json({ duplicate: false }));
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayslipUpload />
    </QueryClientProvider>,
  );
  const drop = screen.getByRole('region', { name: 'Gehaltszettel-PDF ablegen' });
  const pdf = new File(['%PDF-1.7 synthetic'], 'synthetic.pdf', { type: 'application/pdf' });
  fireEvent.drop(drop, { dataTransfer: { files: [pdf, pdf] } });
  expect(screen.getByRole('alert').textContent).toContain('genau eine PDF');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.drop(drop, {
    dataTransfer: { files: [new File(['synthetic'], 'synthetic.txt', { type: 'text/plain' })] },
  });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.drop(drop, { dataTransfer: { files: [pdf] } });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await screen.findByRole('status');
});

describe('Gehaltskonto', () => {
  it('suggests the configured payout account and confirms the changed account explicitly', async () => {
    const writes: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (init.method === 'POST') {
          writes.push(JSON.parse(init.body as string));
          return Response.json({ groupId: 'synthetic-payout-group' });
        }
        const selected = new URL(url, 'http://localhost').searchParams.get('accountId') ?? 'b';
        return Response.json({
          id: 'intake',
          receiptId: 'receipt',
          status: 'pending',
          matches: [],
          payoutAccountId: selected,
          accounts: [account('a', 'Giro A'), account('b', 'Giro B')],
          parsed: {
            documentType: 'payslip',
            periodSource: 'content',
            differenceCents: 0,
            warnings: [],
            draft: {
              month: '2026-09',
              kind: 'regular',
              grossCents: 400000,
              svCents: 70000,
              taxCents: 50000,
              netCents: 280000,
              lines: [],
            },
          },
        });
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <PayslipIntakeDetail id="intake" />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Gehaltszettel prüfen'));
    const suggested = await screen.findByLabelText('Auszahlungskonto');
    expect((suggested as HTMLSelectElement).value).toBe('b');
    fireEvent.change(suggested, { target: { value: 'a' } });
    await waitFor(() =>
      expect((screen.getByLabelText('Auszahlungskonto') as HTMLSelectElement).value).toBe('a'),
    );
    expect(screen.getByRole('option', { name: 'Neue Auszahlung vormerken' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    await waitFor(() =>
      expect(writes).toEqual([{ action: 'confirm', bookingId: null, accountId: 'a' }]),
    );
  });

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
