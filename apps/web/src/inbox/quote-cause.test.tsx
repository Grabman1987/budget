// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { setAmountsHidden } from '@budget/ui';
import { QuoteCause, type QuoteDiagnostics, type QuotePreview } from './quote-cause';
import { request } from '../api/http';

vi.mock('../api/http', () => ({ request: vi.fn() }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  setAmountsHidden(false);
});

const diagnostics: QuoteDiagnostics = {
  securityId: 'synthetic-coin',
  name: 'Synthetische Münze',
  currency: 'EUR',
  symbol: null,
  coingeckoId: 'synthetic-coin',
  hasQuoteUrl: false,
  asOf: '2026-09-17',
  latest: { date: '2026-09-16', priceMicro: 1234567, source: 'manual', currency: 'USD' },
  movements: [{ id: 'synthetic-movement', date: '2026-09-10', kind: 'buy' }],
};
const preview: QuotePreview = {
  securityId: diagnostics.securityId,
  currency: 'EUR',
  from: '2026-08-18',
  to: '2026-09-17',
  attempts: [
    {
      source: 'ariva',
      error: 'currency_mismatch',
      latest: null,
      currencyEvidence: { currency: 'USD', origin: 'response' },
    },
    { source: 'coingecko', error: null, latest: { date: '2026-09-17', priceMicro: 2345678 } },
  ],
};

function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <QuoteCause
        securityId={diagnostics.securityId}
        createdAt="2026-09-15T12:00:00Z"
        detail="Fehlerklasse: currency_mismatch"
      />
    </QueryClientProvider>,
  );
}

it('separates historic missing evidence from current mapping and previews each source without offering acknowledgement', async () => {
  vi.mocked(request).mockResolvedValueOnce(diagnostics).mockResolvedValueOnce(preview);
  mount();
  expect(await screen.findByText(/1,234567/)).toBeTruthy();
  expect(screen.getByText(/1,234567 USD/)).toBeTruthy();
  expect(screen.getByText('Automatischer Kurs in EUR')).toBeTruthy();
  expect(screen.getByText(/damalige Quellwert/)).toBeTruthy();
  expect(screen.getByText(/manueller Kurs repariert/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Als erledigt markieren' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }));
  expect(await screen.findByText(/ariva: Die Quelle liefert eine andere Kurswährung/)).toBeTruthy();
  expect(screen.getByText(/coingecko: 2,345678/)).toBeTruthy();
  expect(screen.getByText(/Erwartet: EUR · Von der Quelle gemeldet: USD/)).toBeTruthy();
  expect(screen.getByText(/Keine Kurse gespeichert, Warnung bleibt offen/)).toBeTruthy();
  expect(vi.mocked(request).mock.calls[1]).toEqual([
    'POST',
    '/api/securities/synthetic-coin/quote-preview',
    {},
  ]);
  expect(screen.getByText(/synthetic-movement/)).toBeTruthy();
});

it('hides both stored and preview price amounts', async () => {
  setAmountsHidden(true);
  vi.mocked(request).mockResolvedValueOnce(diagnostics).mockResolvedValueOnce(preview);
  const { container } = mount();
  await screen.findByText(/manueller Kurs repariert/);
  fireEvent.click(screen.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }));
  await screen.findByRole('status');
  expect(container.textContent).not.toContain('1,234567');
  expect(container.textContent).not.toContain('2,345678');
});

it('distinguishes a configured source currency from a returned currency and missing evidence', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce(diagnostics)
    .mockResolvedValueOnce({
      ...preview,
      attempts: [
        {
          source: 'cryptocalc',
          error: 'currency_mismatch',
          latest: null,
          currencyEvidence: { currency: 'USD', origin: 'mapping' },
        },
        { source: 'ariva', error: 'currency_mismatch', latest: null },
      ],
    });
  mount();
  await screen.findByText(/manueller Kurs repariert/);
  fireEvent.click(screen.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }));
  expect(await screen.findByText(/Erwartet: EUR · In der Quellzuordnung: USD/)).toBeTruthy();
  expect(
    screen.getByText(/cryptocalc: Die Quellzuordnung verwendet eine andere Kurswährung/),
  ).toBeTruthy();
  expect(screen.getByText(/Tatsächliche Kurswährung nicht verfügbar/)).toBeTruthy();
  expect(screen.queryByText(/Von der Quelle gemeldet/)).toBeNull();
});
