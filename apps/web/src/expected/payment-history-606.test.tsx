// @vitest-environment jsdom
import type { ReactNode } from 'react';
import type * as BudgetDomain from '@budget/domain';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  expectedQuery,
  occurrencesQuery,
  versionsQuery,
  type ExpectedPayment,
  type PaymentDetail,
  type PaymentDetailRow,
} from './api';
import { PaymentPanel } from './payment-panel';

vi.mock('@budget/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof BudgetDomain>()),
  todayInVienna: () => '2026-09-17',
}));

const clients: QueryClient[] = [];
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, search }: { children: ReactNode; search: { buchung: string } }) => (
    <a href={`/konten/buchungen?buchung=${search.buchung}`}>{children}</a>
  ),
}));

beforeEach(() => {
  setAmountsHidden(false);
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

function show(rows: PaymentDetailRow[] = nextThree(), errorStatus?: number) {
  const payment = {
    id: 'synthetic-monthly-606',
    name: 'Synthetic monthly payment',
    kind: 'outflow',
    accountId: null,
    payeeId: null,
    contactId: null,
    categoryId: null,
    incomeTypeId: null,
    contactShareBp: 0,
    amountToleranceCents: 0,
    dateWindowDays: 3,
    rhythm: 'monthly',
    intervalWeeks: null,
    dueDay: 20,
    dueMonth: null,
    dateShift: 'none',
    startDate: '2024-01-01',
    endDate: null,
    note: null,
    deletedAt: null,
    version: {
      id: 'synthetic-version-606',
      validFrom: '2024-01-01',
      amountCents: 1234,
      amountMaxCents: null,
      currency: 'EUR',
    },
    amountCents: -1234,
    nextDueDate: '2026-09-20',
    monthlyEquivalentCents: -1234,
    yearlyEquivalentCents: -14808,
  } satisfies ExpectedPayment;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(expectedQuery().queryKey, [payment]);
  client.setQueryData(versionsQuery(payment.id).queryKey, [
    { ...payment.version, expectedPaymentId: payment.id, note: null },
  ]);
  // Matches the exact existing direct-detail request; the real SQLite/API control in
  // expected-detail-606.test.ts distinguishes its stale SELECT from a refresh write.
  client.setQueryData(occurrencesQuery('2025-09-01', '2027-09-28', true).queryKey, []);
  const detail: PaymentDetail = {
    paymentId: payment.id,
    asOf: '2026-09-17',
    history: [],
    sparseHistory: true,
    hasEarlierRecorded: false,
    future: rows,
    hasFurtherFuture: false,
  };
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    expect(input).toBe(`/api/expected/${payment.id}/detail`);
    expect(init?.method).toBe('GET');
    return new Response(JSON.stringify(errorStatus ? { error: 'server_error' } : detail), {
      status: errorStatus ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PaymentPanel state={{ mode: 'view', id: payment.id }} onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );

  return { fetch, detail };
}

function nextThree(): PaymentDetailRow[] {
  return ['2026-09-20', '2026-10-20', '2026-11-20'].map<PaymentDetailRow>((dueDate) => ({
    occurrenceId: null,
    dueDate,
    source: 'preview',
    status: 'expected',
    expectedAmountCents: -1234,
    currency: 'EUR',
    booking: null,
    actualComparableCents: null,
    deviationCents: null,
    unavailableReason: 'missing_booking',
  }));
}

it('shows the real next monthly dates instead of a false empty period on direct detail', async () => {
  const { fetch } = show();
  // Original RED literals retained; only the legitimate new GET transport is added.
  // Oct/Nov are not the headline's single next-due hint: they require actual detail rows.
  expect(await screen.findByText('20.10.2026')).toBeTruthy();
  expect(screen.getByText('20.11.2026')).toBeTruthy();
  expect(screen.getByText('20.09.2026')).toBeTruthy();
  expect(screen.queryByText('Keine Fälligkeiten im Zeitraum.')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Verknüpfen' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Streichen' })).toBeNull();
});

it('reveals the fourth future term without a write or changing the first three amounts', async () => {
  const rows = nextThree();
  rows.push({ ...rows[0]!, dueDate: '2026-12-20', expectedAmountCents: -5000 });
  const { fetch } = show(rows);
  await screen.findByText('20.10.2026');
  expect(screen.queryByText('20.12.2026')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Weitere Termine' }));
  expect(screen.getByText('20.12.2026')).toBeTruthy();
  expect(screen.getByText('−50,00 €')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Weniger Termine' }).getAttribute('aria-expanded'),
  ).toBe('true');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('explains incomparable currency while preserving actual booking link, units and status', async () => {
  const rows = nextThree();
  rows[0] = {
    ...rows[0]!,
    source: 'stored',
    occurrenceId: 'real-stored-id',
    currency: 'USD',
    expectedAmountCents: -1000,
    booking: { id: 'real-booking-id', date: '2026-09-20', amountCents: -935, currency: 'EUR' },
    status: 'deviating',
    unavailableReason: 'currency_mismatch',
  };
  show(rows);
  const link = await screen.findByRole('link', { name: 'Buchung 20.09.2026 · −9,35 €' });
  expect(link.getAttribute('href')).toBe('/konten/buchungen?buchung=real-booking-id');
  const row = link.closest('li')!;
  expect(row.querySelector('.xp-occ-actual')?.textContent).toBe('Ist –');
  expect(row.querySelector('.xp-occ-delta')?.textContent).toBe('Abweichung –');
  expect(row.textContent).toContain('Währung nicht vergleichbar; Originalbetrag fehlt.');
  expect(row.textContent).toContain('abweichend');
  expect(row.querySelector('.xp-occ-actual')?.textContent).not.toContain('0,00');
  expect(row.querySelector('.xp-occ-delta')?.textContent).not.toContain('0,00');
});

it('keeps all displayed financial channels under existing amount privacy', async () => {
  const rows = nextThree();
  rows[0] = {
    ...rows[0]!,
    source: 'stored',
    occurrenceId: 'real-id',
    booking: { id: 'real-booking', date: '2026-09-20', amountCents: -1334, currency: 'EUR' },
    actualComparableCents: -1334,
    deviationCents: -100,
  };
  setAmountsHidden(true);
  show(rows);
  await screen.findByText('20.10.2026');
  expect(document.body.textContent).not.toContain('12,34');
  expect(document.body.textContent).not.toContain('13,34');
  expect(document.body.textContent).not.toContain('1,00');
  expect(document.body.textContent).toContain('•••');
});

it('labels undocumented stored units without guessing EUR while keeping native booking money', async () => {
  const rows = nextThree();
  rows[0] = {
    ...rows[0]!,
    source: 'stored',
    occurrenceId: 'stored-unknown',
    currency: null,
    expectedAmountCents: -1000,
    booking: { id: 'known-native', date: '2026-09-20', amountCents: -1100, currency: 'EUR' },
    unavailableReason: 'missing_currency',
  };
  show(rows);
  const link = await screen.findByRole('link', { name: 'Buchung 20.09.2026 · −11,00 €' });
  const row = link.closest('li')!;
  expect(row.querySelector('.xp-occ-amt')?.textContent).toContain(
    '−10,00 (Währung nicht dokumentiert)',
  );
  expect(row.querySelector('.xp-occ-amt')?.textContent).not.toContain('€');
  expect(row.querySelector('.xp-occ-actual')?.textContent).toBe('Ist –');
  expect(row.querySelector('.xp-occ-delta')?.textContent).toBe('Abweichung –');
});

it('shows a failed read as an error rather than empty history or zero money', async () => {
  show([], 500);
  await screen.findByRole('button', { name: 'Erneut versuchen' });
  expect(screen.queryByText('Keine weiteren Termine nach aktueller Regel.')).toBeNull();
  expect(screen.queryByText('Keine Fälligkeiten im Zeitraum.')).toBeNull();
});
