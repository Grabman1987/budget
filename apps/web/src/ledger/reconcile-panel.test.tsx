// @vitest-environment jsdom
import { todayInVienna } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
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
let bookedBalanceCents = 0;
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  localStorage.removeItem('budget-reconcile-category:a');
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  sends.length = 0;
  bookedBalanceCents = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      let result: unknown = {};
      if (url.includes('/lookups'))
        result = {
          categories: [
            {
              id: 'archived',
              name: 'Archived synthetic category',
              groupId: 'g',
              kind: 'variable',
              class: 'need',
              sortOrder: 9,
              hiddenAt: '2026-01-01',
            },
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
            bookedBalanceCents,
            pendingCents: 0,
            differenceCents: input.statementBalanceCents - bookedBalanceCents,
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
function show(
  over: Partial<AccountRow> = {},
  initialDate?: string,
  monthClose?: Parameters<typeof ReconcileFlow>[0]['monthClose'],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ReconcileFlow
          account={{ ...account, ...over }}
          {...(initialDate === undefined ? {} : { initialDate })}
          {...(monthClose === undefined ? {} : { monthClose })}
          onDone={() => undefined}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
it.each([1234, -1234, 0])(
  'shows booked cents %s only as a placeholder and requires typed confirmation',
  async (balance) => {
    bookedBalanceCents = balance;
    show({ clearedCents: balance, unclearedCents: 5000, balanceCents: balance + 5000 });
    const amount = screen.getByLabelText('Saldo laut Bank') as HTMLInputElement;
    expect(amount.value).toBe('');
    expect(amount.placeholder).toBe(balance === 0 ? '0,00' : balance < 0 ? '−12,34' : '12,34');
    expect(screen.queryByRole('button', { name: 'Kontostand stimmt' })).toBeNull();
    expect(sends).toEqual([]);
    fireEvent.change(amount, { target: { value: amount.placeholder } });
    fireEvent.click(await screen.findByRole('button', { name: 'Kontostand stimmt' }));
    await waitFor(() =>
      expect(sends).toEqual([{ date: expect.any(String), statementBalanceCents: balance }]),
    );
  },
);

it('does not confirm a typed stale balance when the server preview differs', async () => {
  bookedBalanceCents = 1200;
  show({ clearedCents: 1234, balanceCents: 1234 });
  fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: '12,34' } });
  await screen.findByRole('button', { name: 'Differenz ausgleichen' });
  expect(screen.queryByRole('button', { name: 'Kontostand stimmt' })).toBeNull();
  expect(sends).toEqual([]);
  fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: '12,00' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Kontostand stimmt' }));
  await waitFor(() =>
    expect(sends).toEqual([{ date: todayInVienna(), statementBalanceCents: 1200 }]),
  );
});

it.each(['EUR', 'USD'])('keeps the %s unit beside the empty balance field', (currency) => {
  show({ currency, clearedCents: 1234 });
  const input = screen.getByLabelText(
    currency === 'EUR' ? 'Saldo laut Bank' : `Saldo laut Bank · ${currency}`,
  ) as HTMLInputElement;
  expect(input.value).toBe('');
  expect(input.placeholder).toBe('12,34');
  expect(input.parentElement?.querySelector('.amount-cur')?.textContent).toBe(
    currency === 'EUR' ? '€' : currency,
  );
  expect(sends).toEqual([]);
});

it('does not suggest today’s balance or bypass the month-close confirmation context', () => {
  const confirm = vi.fn();
  show({ clearedCents: 1234, balanceCents: 1234 }, undefined, {
    asOf: '2026-09-30',
    confirm,
    onReload: vi.fn(),
    onBusy: vi.fn(),
  });
  expect((screen.getByLabelText('Saldo laut Bank') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('button', { name: 'Kontostand stimmt' })).toBeNull();
  expect(confirm).not.toHaveBeenCalled();
  expect(sends).toEqual([]);
});

it('takes a historical bank amount but checks and adjusts on today without date inputs', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  expect(screen.queryByLabelText('Stichtag')).toBeNull();
  expect((screen.getByLabelText('Saldo laut Bank') as HTMLInputElement).value).toBe('−12,34');
  await screen.findByRole('button', { name: 'Differenz ausgleichen' });
  expect(screen.queryByLabelText('Ausgleichsdatum')).toBeNull();
  expect(sends).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'Differenz ausgleichen' }));
  await waitFor(() =>
    expect(sends).toEqual([{ date: todayInVienna(), statementBalanceCents: -1234, adjust: true }]),
  );
});

it('uses the existing grouped category picker for an explicit correction override', async () => {
  show({ onBudget: true });
  fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: '12,34' } });
  const picker = await screen.findByRole('combobox', { name: 'Kategorie für den Ausgleich' });
  expect((picker as HTMLInputElement).value).toBe('Zu verteilen');
  fireEvent.focus(picker);
  expect(await screen.findByText('Gruppe Muster')).toBeTruthy();
  expect(screen.queryByRole('option', { name: 'Archived synthetic category' })).toBeNull();
  fireEvent.click(screen.getByRole('option', { name: 'Kategorie Muster' }));
  fireEvent.click(screen.getByRole('button', { name: 'Differenz ausgleichen' }));
  await waitFor(() =>
    expect(sends).toEqual([
      { date: todayInVienna(), statementBalanceCents: 1234, adjust: true, categoryId: 'c' },
    ]),
  );
});

it.each(['credit_card', 'loan'] as const)('explains the debt sign for %s', (type) => {
  show({ type });
  expect(screen.getByText('Schuld als Minus eingeben')).toBeTruthy();
});
it.each(['brokerage', 'crypto'] as const)('labels %s as cash only', (type) => {
  show({ type });
  expect(screen.getByLabelText('Bargeld-Saldo (ohne Wertpapiere)')).toBeTruthy();
});
it.each(['-12,34', '12,34'])(
  'uses Zu verteilen for a budget account difference %s',
  async (amount) => {
    localStorage.setItem('budget-reconcile-category:a', 'c');
    show({ onBudget: true });
    fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: amount } });
    await screen.findByRole('button', { name: 'Differenz ausgleichen' });
    expect((screen.getByLabelText('Kategorie für den Ausgleich') as HTMLInputElement).value).toBe(
      'Zu verteilen',
    );
    expect(screen.getByText(/Eine echte Buchung.*Zu verteilen/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'In Buchungen suchen' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Differenz ausgleichen' }));
    await waitFor(() =>
      expect(sends).toEqual([
        {
          date: expect.any(String),
          statementBalanceCents: amount.startsWith('-') ? -1234 : 1234,
          adjust: true,
        },
      ]),
    );
  },
);
it('needs an explicit tick before an adjustment dated in an already checked period', async () => {
  show({ lastReconciledOn: '2026-09-20' }, '2026-09-30', {
    asOf: '2026-09-30',
    confirm: async (input) => {
      sends.push({ ...input });
      return {
        result: {
          groupId: 'synthetic',
          differenceCents: -1234,
          adjustmentBookingId: 'adjustment',
        } as never,
      };
    },
    onReload: vi.fn(),
    onBusy: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  const button = async () =>
    (await screen.findByRole('button', {
      name: /Differenz ausgleichen/,
    })) as HTMLButtonElement;
  fireEvent.change(await screen.findByLabelText('Grund für den Ausgleich'), {
    target: { value: 'Synthetic reason' },
  });
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
  fireEvent.change(await screen.findByLabelText('Grund für den Ausgleich'), {
    target: { value: 'Synthetic reason' },
  });
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
        note: 'Synthetic reason',
      },
    ]),
  );
});
it('does not send the unlock flag for a date after the last check', async () => {
  show({ lastReconciledOn: '2026-09-20' }, '2026-09-30', {
    asOf: '2026-09-30',
    confirm: async (input) => {
      sends.push({ ...input });
      return {
        result: {
          groupId: 'synthetic',
          differenceCents: -1234,
          adjustmentBookingId: 'adjustment',
        } as never,
      };
    },
    onReload: vi.fn(),
    onBusy: vi.fn(),
  });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  fireEvent.change(await screen.findByLabelText('Ausgleichsdatum'), {
    target: { value: '2026-09-21' },
  });
  expect(screen.queryByLabelText('Geprüften Zeitraum trotzdem ändern')).toBeNull();
  fireEvent.change(await screen.findByLabelText('Grund für den Ausgleich'), {
    target: { value: 'Synthetic reason' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Differenz ausgleichen/ }));
  await waitFor(() =>
    expect(sends).toEqual([
      {
        date: '2026-09-30',
        statementBalanceCents: -1234,
        adjust: true,
        adjustDate: '2026-09-21',
        note: 'Synthetic reason',
      },
    ]),
  );
});

it('retains historical month-close adjustment interval validation', async () => {
  const confirm = vi.fn();
  show({}, '2026-09-30', { asOf: '2026-09-30', confirm, onReload: vi.fn(), onBusy: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  fireEvent.change(await screen.findByLabelText('Grund für den Ausgleich'), {
    target: { value: 'Synthetic reason' },
  });
  for (const date of ['2025-12-31', '2026-10-01', '2026-02-30']) {
    fireEvent.change(screen.getByLabelText('Ausgleichsdatum'), { target: { value: date } });
    expect(
      (screen.getByRole('button', { name: 'Differenz ausgleichen' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  }
  expect(confirm).not.toHaveBeenCalled();
  expect(sends).toEqual([]);
});

it('formats the typed amount on blur and preserves literal confirmation cents', async () => {
  bookedBalanceCents = 10000;
  show({ clearedCents: 10000, balanceCents: 10000 });
  const amount = screen.getByLabelText('Saldo laut Bank') as HTMLInputElement;
  fireEvent.change(amount, { target: { value: '100' } });
  fireEvent.blur(amount);
  expect(amount.value).toBe('100,00');
  fireEvent.click(await screen.findByRole('button', { name: 'Kontostand stimmt' }));
  await waitFor(() =>
    expect(sends).toEqual([{ date: todayInVienna(), statementBalanceCents: 10000 }]),
  );
});

it('masks typed and adopted amounts and the suggested balance in privacy mode', () => {
  setAmountsHidden(true);
  show({ clearedCents: 10000 });
  const amount = screen.getByLabelText('Saldo laut Bank') as HTMLInputElement;
  expect(amount.type).toBe('password');
  expect(amount.placeholder).toBe('');
  fireEvent.change(amount, { target: { value: '12,34' } });
  expect(amount.type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: /Bankstand übernehmen/ }));
  expect(amount.value).toBe('−12,34');
  expect(amount.type).toBe('password');
  expect(sends).toEqual([]);
});

it('reports invalid typed amounts and never offers confirmation', () => {
  show({ clearedCents: 10000 });
  const amount = screen.getByLabelText('Saldo laut Bank');
  fireEvent.change(amount, { target: { value: 'invalid' } });
  expect(amount.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Bitte einen gültigen Betrag eingeben.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Kontostand stimmt' })).toBeNull();
  expect(sends).toEqual([]);
});

it('refreshes the day and preview at Vienna midnight before committing an adjustment', async () => {
  vi.setSystemTime(new Date('2026-10-01T21:59:00Z'));
  show({ onBudget: true });
  fireEvent.change(screen.getByLabelText('Saldo laut Bank'), { target: { value: '-12,34' } });
  const button = await screen.findByRole('button', { name: 'Differenz ausgleichen' });
  vi.setSystemTime(new Date('2026-10-01T22:01:00Z'));
  fireEvent.click(button);
  expect(sends).toEqual([]);
  expect(screen.getByText(/Der Tag hat gewechselt/)).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Differenz ausgleichen' }));
  await waitFor(() =>
    expect(sends).toEqual([{ date: '2026-10-02', statementBalanceCents: -1234, adjust: true }]),
  );
});
