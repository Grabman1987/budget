// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
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
      <ToastProvider>
        <QuoteCause
          securityId={diagnostics.securityId}
          createdAt="2026-09-15T12:00:00Z"
          detail="Fehlerklasse: currency_mismatch"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('separates historic missing evidence from current mapping and previews each source without offering acknowledgement', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({
      ...diagnostics,
      attempts: [
        {
          source: 'coingecko',
          attemptedAt: '2026-09-16T12:00:00Z',
          outcome: 'timeout',
          httpStatus: null,
          detail: null,
        },
      ],
    })
    .mockResolvedValueOnce(preview);
  mount();
  expect(await screen.findByText(/1,234567/)).toBeTruthy();
  expect(screen.getByText(/1,234567 USD/)).toBeTruthy();
  expect(screen.getByText('Automatischer Kurs in EUR')).toBeTruthy();
  const warning = within(screen.getByRole('region', { name: 'Gespeicherte Warnung' }));
  expect(warning.getByText(/damalige Quellwert/)).toBeTruthy();
  expect(warning.getByText('Die Quelle liefert eine andere Kurswährung')).toBeTruthy();
  expect(warning.queryByText(/coingecko.*nicht rechtzeitig/)).toBeNull();
  expect(screen.getByText(/coingecko.*nicht rechtzeitig/)).toBeTruthy();
  expect(screen.getByText(/manueller Kurs repariert/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Als erledigt markieren' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }));
  expect(
    await screen.findByText(/ariva: Die Quelle liefert USD, das Wertpapier wird in EUR geführt/),
  ).toBeTruthy();
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

it('#1203 records a reasoned "Nur manuelle Kurse" decision and offers the abort only without holding', async () => {
  vi.mocked(request).mockImplementation(async (method: string, url: string) => {
    if (method === 'GET')
      return {
        ...diagnostics,
        quoteExchange: 'XETRA',
        pricesEnabled: true,
        held: false,
        lastRun: { finishedAt: '2026-09-17T00:30:00Z', status: 'partial', errorClasses: 'http' },
        lastSuccessRun: null,
      };
    return { resolved: 1, groupId: 'g', url };
  });
  mount();
  expect(await screen.findByText('XETRA')).toBeTruthy();
  expect(screen.getByText('Historischer Bestand: aktuell keine Stücke')).toBeTruthy();
  const manual = screen.getByRole('button', { name: 'Nur manuelle Kurse' }) as HTMLButtonElement;
  expect(manual.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Grund'), { target: { value: 'Quelle liefert USD' } });
  fireEvent.click(manual);
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'POST',
      '/api/securities/synthetic-coin/quote-source-decision',
      { mode: 'manual_only', reason: 'Quelle liefert USD' },
    ),
  );
  expect(screen.getByRole('button', { name: /Abruf abschalten/ })).toBeTruthy();
});

it('shows the attempt history and offers the ECB conversion for a foreign quote currency (#1203)', async () => {
  vi.mocked(request)
    .mockResolvedValueOnce({
      ...diagnostics,
      attempts: [
        {
          source: 'ariva',
          attemptedAt: '2026-09-17T01:00:00Z',
          outcome: 'http',
          httpStatus: 503,
          detail: null,
        },
        {
          source: 'ariva',
          attemptedAt: '2026-09-16T01:00:00Z',
          outcome: 'ok',
          httpStatus: null,
          detail: '3 Zeilen',
        },
      ],
    })
    .mockResolvedValueOnce(preview)
    .mockResolvedValueOnce({ quoteFxCurrency: 'USD' })
    .mockResolvedValue(diagnostics);
  mount();
  expect((await screen.findAllByText(/HTTP 503/)).length).toBeGreaterThan(0);
  expect(screen.getByText('Letzter Erfolg')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Quelle erneut testen (Vorschau)' }));
  fireEvent.click(
    await screen.findByRole('button', { name: /Mit EZB-Kurs umrechnen \(USD → EUR\)/ }),
  );
  await screen.findByText(/Umrechnung mit EZB-Kurs gespeichert \(USD\)/);
  expect(vi.mocked(request).mock.calls[2]).toEqual([
    'POST',
    '/api/securities/synthetic-coin/quote-fx-currency',
    { currency: 'USD' },
  ]);
});

it('repairs a missing quote link in place and rejects invalid links without a request', async () => {
  let saved = false;
  vi.mocked(request).mockImplementation(async (method) => {
    if (method === 'PATCH') {
      saved = true;
      return { groupId: 'synthetic-group' };
    }
    return { ...diagnostics, coingeckoId: null, hasQuoteUrl: saved };
  });
  mount();
  expect(await screen.findByText('Kein Kurs-Link hinterlegt')).toBeTruthy();
  const input = screen.getByLabelText('Ariva-Link · Historische Kurse');
  for (const value of [
    'https://example.org/kurse',
    'http://ariva.de/etf/test/kurse/historische-kurse',
  ]) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Kurs-Link speichern' }));
    expect(await screen.findByText(/Bitte den HTTPS-Link/)).toBeTruthy();
  }
  expect(vi.mocked(request).mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  const value = 'https://www.ariva.de/etf/synthetic/kurse/historische-kurse';
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Kurs-Link speichern' }));
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith('PATCH', '/api/securities/synthetic-coin', {
      quoteUrl: value,
    }),
  );
  await vi.waitFor(() => expect(screen.queryByText('Kein Kurs-Link hinterlegt')).toBeNull());
});
