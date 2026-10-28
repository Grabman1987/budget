// @vitest-environment jsdom
import { paymentsPreview, type PreviewPayment, type PaymentsPreview } from '@budget/domain';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { findReport } from '../nav/reports-catalog';
import { REPORTS_CATALOG } from '../nav/pages';
import { PaymentsPreviewReport, paymentsPreviewQuery } from './payments-preview-report';

vi.mock('../pages/placeholder-page', () => ({ PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@tanstack/react-router', () => ({ useLinkProps: ({ to }: { to: string }) => ({ href: to }) }));
vi.mock('../charts/use-element-width', () => ({ useElementWidth: () => [vi.fn(), 800] }));
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});
const payment: PreviewPayment = {
  id: 'synthetic', name: 'Testvertrag', kind: 'outflow', contactShareBp: 0,
  rhythm: 'monthly', dueDay: 1, dueMonth: null, dateShift: 'none',
  startDate: null, endDate: null, categoryName: 'Wohnen', categoryClass: 'need', categoryKind: 'fixed',
  versions: [
    { validFrom: '2026-11-01', amountCents: 10000, amountMaxCents: null, currency: 'EUR' },
    { validFrom: '2027-01-01', amountCents: 12000, amountMaxCents: null, currency: 'EUR' },
  ],
};
function mount(data: PaymentsPreview) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(paymentsPreviewQuery().queryKey, data);
  const rendered = render(<QueryClientProvider client={client}><ToastProvider><PaymentsPreviewReport report={findReport('vorschau')!} meta={REPORTS_CATALOG} /></ToastProvider></QueryClientProvider>);
  return { client, ...rendered };
}

it('retains literal twelve-month renderer amounts independently of the retired route', () => {
  const { container } = mount(paymentsPreview('2026-10-02', [payment, {
    ...payment, id: 'annual', name: 'Jahresvertrag', rhythm: 'yearly', dueMonth: 3, categoryKind: 'periodic',
    versions: [{ validFrom: '2026-11-01', amountCents: 30000, amountMaxCents: null, currency: 'EUR' }],
  }], []));
  expect(screen.getByTestId('preview-total').textContent).toBe('1.700,00 €');
  expect(screen.getByRole('heading', { name: 'November 2026 bis Oktober 2027' })).toBeDefined();
  expect(screen.getByText('Teuerster Monat: März 2027 · Basisbetrag')).toBeDefined();
  expect(screen.getByText('Ø je Monat: 141,67 €')).toBeDefined();
  expect(container.querySelectorAll('.preview-table thead th')).toHaveLength(14);
  const totals = container.querySelectorAll('.preview-sum td');
  expect(totals[0]?.textContent).toBe('100,00');
  expect(totals[2]?.textContent).toBe('120,00');
  expect(totals[4]?.textContent).toBe('420,00');
  expect(totals[totals.length - 1]?.textContent).toBe('1.700,00');
  const region = screen.getByRole('region', { name: 'Zahlungskalender, seitlich scrollbar', exact: true });
  region.focus();
  expect(document.activeElement).toBe(region);
  expect(container.querySelector('.preview-events')?.textContent).toContain('Erwartet · projiziert');
});

it('retains native ranges, booked currency uncertainty, exact large cents and error-to-empty retry', async () => {
  const foreign = paymentsPreview('2026-10-02', [{ ...payment,
    versions: [{ validFrom: '2026-11-01', amountCents: 10000, amountMaxCents: 15000, currency: 'USD' }],
  }], [{ paymentId: payment.id, dueDate: '2026-11-01', occurrenceId: 'occ', status: 'received',
    storedExpectedCents: -99999, bookingId: 'book', bookedAmountCents: -11000, bookedCurrency: 'EUR',
  }]);
  const { client, container } = mount(foreign);
  expect(screen.getByText('Gesamtsumme in EUR nicht verfügbar.', { exact: false })).toBeDefined();
  expect(container.querySelector('.preview-table tbody tr')?.textContent).toContain('100,00 bis 150,00');
  expect(container.querySelector('.preview-events')?.textContent).toContain('−110,00 €');
  expect(container.querySelector('.preview-events')?.textContent).toContain('Währung nicht sicher zuordenbar');
  expect(container.querySelector('.preview-events')?.textContent).not.toContain('999');
  const large = paymentsPreview('2026-10-02', [{ ...payment, rhythm: 'yearly', dueMonth: 3,
    versions: [{ validFrom: '2026-11-01', amountCents: 9_007_199_254_740_990, amountMaxCents: null, currency: 'USD' }],
  }], []);
  act(() => { client.setQueryData(paymentsPreviewQuery().queryKey, large); });
  await waitFor(() => expect(container.querySelector('.preview-table tbody tr')?.textContent).toContain('90.071.992.547.409,90'));
  expect(container.querySelector('.preview-events')?.textContent).toContain('90.071.992.547.409,90 USD');
  const fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    expect(init?.method).toBe('GET');
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
  });
  vi.stubGlobal('fetch', fetcher);
  await act(async () => { await client.invalidateQueries({ queryKey: paymentsPreviewQuery().queryKey }); });
  await screen.findByRole('alert');
  expect(screen.queryByTestId('preview-total')).toBeNull();
  fetcher.mockImplementation(async (_path, init) => {
    expect(init?.method).toBe('GET');
    return new Response(JSON.stringify(paymentsPreview('2026-10-02', [], [])));
  });
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen', exact: true }));
  await waitFor(() => expect(screen.getByTestId('preview-total').textContent).toBe('0,00 €'));
  expect(screen.getByText('Keine gespeicherten erwarteten Auszahlungen in diesen zwölf Monaten.')).toBeDefined();
});
