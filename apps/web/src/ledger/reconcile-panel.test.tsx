// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@budget/ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReconcileFlow } from './reconcile-panel';
import type { AccountRow } from './types';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => (
    <a href="/konten/buchungen">{children}</a>
  ),
}));
const account = {
  id: 'a',
  name: 'Giro Muster',
  type: 'checking',
  currency: 'EUR',
  openingDate: '2026-01-01',
  bankBalance: {
    amountCents: -1234,
    date: '2026-09-30',
    effectiveDate: '2026-09-30',
    fetchedAt: '2026-10-01T10:00:00Z',
    reconciledThrough: null,
    canLock: true,
  },
} as AccountRow;
const sends: Array<Record<string, unknown>> = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  sends.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      let result: unknown = {};
      if (url.includes('/lookups'))
        result = {
          categories: [
            {
              id: 'c',
              name: 'Kategorie Muster',
              groupId: 'g',
              kind: 'variable',
              class: 'need',
              sortOrder: 0,
            },
            ...(['fixed', 'income', 'advance', 'debt', 'invest', 'saving'] as const).map(
              (kind, i) => ({
                id: `k-${kind}`,
                name: `Art ${kind}`,
                groupId: 'g',
                kind,
                class: null,
                sortOrder: i + 1,
              }),
            ),
          ],
          groups: [{ id: 'g', name: 'Gruppe Muster', sortOrder: 0 }],
        };
      if (url.endsWith('/reconciliation/preview')) {
        const input = JSON.parse(options!.body as string);
        result = {
          preview: {
            accountId: 'a',
            ...input,
            bookedBalanceCents: 0,
            pendingCents: 0,
            differenceCents: input.statementBalanceCents,
            toReconcileCount: 0,
            duplicates: [],
            pendingMatches: [],
            missing: { kind: 'expense', amountCents: 1234 },
          },
        };
      } else if (url.endsWith('/reconciliation')) {
        sends.push(JSON.parse(options!.body as string));
        result = {
          result: {
            groupId: 'synthetic',
            differenceCents: -1234,
            adjustmentBookingId: 'adjustment',
          },
        };
      }
      return new Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
function show(over: Partial<AccountRow> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReconcileFlow account={{ ...account, ...over }} onDone={() => undefined} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
it('takes signed bank cents and date without booking, then sends the chosen adjustment date/category only on click', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  expect((screen.getByLabelText('Stichtag') as HTMLInputElement).value).toBe('30.09.2026');
  expect((screen.getByLabelText('Saldo laut Bank') as HTMLInputElement).value).toBe('−12,34');
  await screen.findByRole('button', { name: 'Fehlende Buchung erfassen' });
  fireEvent.change(screen.getByLabelText('Ausgleichsdatum'), { target: { value: '2026-09-25' } });
  fireEvent.change(screen.getByLabelText('Kategorie für den Ausgleich'), {
    target: { value: 'c' },
  });
  expect(sends).toEqual([]);
  expect(screen.getByText(/Eine echte Buchung.*25.09.2026.*Kategorie Muster/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Differenz ausgleichen/ }));
  await waitFor(() =>
    expect(sends).toEqual([
      {
        date: '2026-09-30',
        statementBalanceCents: -1234,
        adjust: true,
        adjustDate: '2026-09-25',
        categoryId: 'c',
      },
    ]),
  );
});
it('uses the Vienna fetch day when the balance has no date', () => {
  // The server computes the effective day (Vienna day of the fetch) and sends it along.
  show({
    bankBalance: {
      ...account.bankBalance!,
      date: null,
      effectiveDate: '2026-10-01',
      fetchedAt: '2026-09-30T23:30:00Z',
    },
  });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  expect((screen.getByLabelText('Stichtag') as HTMLInputElement).value).toBe('01.10.2026');
});
it('blocks an adjustment outside the opening/statement interval or with an invalid date', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  await screen.findByRole('button', { name: /Differenz ausgleichen/ });
  for (const date of ['2025-12-31', '2026-10-01', '2026-02-30']) {
    fireEvent.change(screen.getByLabelText('Ausgleichsdatum'), { target: { value: date } });
    expect(
      (screen.getByRole('button', { name: /Differenz ausgleichen/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  }
  expect(sends).toEqual([]);
});
it.each(['credit_card', 'loan'] as const)('explains the debt sign for %s', (type) => {
  show({ type });
  expect(screen.getByText('Schuld als Minus eingeben')).toBeTruthy();
});
it.each(['brokerage', 'crypto'] as const)('labels %s as cash only', (type) => {
  show({ type });
  expect(screen.getByLabelText('Bargeld-Saldo (ohne Wertpapiere)')).toBeTruthy();
});
it.each([
  ['negative', '-12,34'],
  ['positive', '12,34'],
])('offers only plain spending categories for a %s difference', async (_name, amount) => {
  show();
  fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: amount } });
  const select = (await screen.findByLabelText('Kategorie für den Ausgleich')) as HTMLSelectElement;
  expect([...select.options].map((o) => o.value).filter(Boolean)).toEqual([
    'c',
    'k-fixed',
    'k-saving',
  ]);
});
it('needs an explicit tick before an adjustment dated in an already checked period', async () => {
  show({ lastReconciledOn: '2026-09-20' });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  const button = async () =>
    (await screen.findByRole('button', {
      name: /Differenz ausgleichen/,
    })) as HTMLButtonElement;
  expect((await button()).disabled).toBe(false);
  expect(screen.queryByLabelText('Geprüften Zeitraum trotzdem ändern')).toBeNull();
  fireEvent.change(screen.getByLabelText('Ausgleichsdatum'), { target: { value: '2026-09-20' } });
  expect(
    screen.getByText(
      'Dieses Datum liegt in einem bereits geprüften Zeitraum (bis 20.09.2026). Der Ausgleich ändert diesen Zeitraum.',
    ),
  ).toBeTruthy();
  expect((await button()).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText('Geprüften Zeitraum trotzdem ändern'));
  expect((await button()).disabled).toBe(false);
  fireEvent.click(await button());
  await waitFor(() =>
    expect(sends).toEqual([
      {
        date: '2026-09-30',
        statementBalanceCents: -1234,
        adjust: true,
        adjustDate: '2026-09-20',
        unlockReconciled: true,
      },
    ]),
  );
});
it('does not send the unlock flag for a date after the last check', async () => {
  show({ lastReconciledOn: '2026-09-20' });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  fireEvent.change(await screen.findByLabelText('Ausgleichsdatum'), {
    target: { value: '2026-09-21' },
  });
  expect(screen.queryByLabelText('Geprüften Zeitraum trotzdem ändern')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Differenz ausgleichen/ }));
  await waitFor(() =>
    expect(sends).toEqual([
      { date: '2026-09-30', statementBalanceCents: -1234, adjust: true, adjustDate: '2026-09-21' },
    ]),
  );
});
