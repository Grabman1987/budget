// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { afterEach, expect, it, vi } from 'vitest';
import { request } from '../api/http';
import { InstrumentForm } from './instrument-form';
import type { SecurityRecord } from './portfolio-api';

vi.mock('../api/http', () => ({ request: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const security = {
  id: 'synthetic-security',
  name: 'Synthetischer Fonds',
  kind: 'etf',
  currency: 'EUR',
  quoteUrl: null,
  terBp: 0,
  leverageFactor: 10,
} as SecurityRecord;

function mount(record = security) {
  const saved = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <InstrumentForm
          security={record}
          onDirty={vi.fn()}
          onBusy={vi.fn()}
          onSaved={saved}
          onSelect={vi.fn()}
          effectiveDay="2026-09-17"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return saved;
}

it('shows source failures in the edit panel, validates an Ariva link and saves it through the security route', async () => {
  vi.mocked(request).mockImplementation(async (method, path) => {
    if (path === '/api/asset-classes') return { assetClasses: [] };
    if (method === 'PATCH')
      return {
        security: {
          ...security,
          quoteUrl: 'https://ariva.de/etf/synthetic/kurse/historische-kurse',
        },
        groupId: 'synthetic-group',
      };
    return { currency: 'EUR', attempts: [{ outcome: 'http' }] };
  });
  const saved = mount();
  expect(await screen.findByText('Die Quelle war nicht erreichbar')).toBeTruthy();
  expect(screen.getByText('Kein Kurs-Link hinterlegt')).toBeTruthy();
  const input = screen.getByLabelText('Ariva-Link · Historische Kurse');
  fireEvent.change(input, { target: { value: 'https://example.org/kurse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Stammdaten speichern' }));
  expect(await screen.findByText(/Bitte den HTTPS-Link/)).toBeTruthy();
  expect(vi.mocked(request).mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  const value = 'https://ariva.de/etf/synthetic/kurse/historische-kurse';
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Stammdaten speichern' }));
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      'PATCH',
      '/api/securities/synthetic-security',
      expect.objectContaining({ quoteUrl: value }),
    ),
  );
  await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
});

it('shows both known currencies when testing a source from the edit panel', async () => {
  vi.mocked(request).mockImplementation(async (method, path) => {
    if (path === '/api/asset-classes') return { assetClasses: [] };
    if (method === 'POST')
      return {
        currency: 'EUR',
        attempts: [
          {
            source: 'ariva',
            error: 'currency_mismatch',
            latest: null,
            currencyEvidence: { currency: 'USD', origin: 'response' },
          },
        ],
      };
    return { currency: 'EUR', attempts: [] };
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Quelle testen (Vorschau)' }));
  expect(
    await screen.findByText('ariva: Die Quelle liefert USD, das Wertpapier wird in EUR geführt'),
  ).toBeTruthy();
  expect(screen.getByText('Vorschau: Keine Kurse gespeichert.')).toBeTruthy();
});

it('preserves an unchanged legacy crypto quote URL on an unrelated edit', async () => {
  const record = {
    ...security,
    kind: 'crypto' as const,
    quoteUrl: 'https://cryptocalc.cc/bitpanda-kurse/?currency=SYN&fiat=EUR',
  };
  vi.mocked(request).mockImplementation(async (method, path) => {
    if (path === '/api/asset-classes') return { assetClasses: [] };
    if (method === 'PATCH') return { security: record, groupId: 'synthetic-group' };
    return { currency: 'EUR', attempts: [] };
  });
  mount(record);
  expect(screen.queryByLabelText('Ariva-Link \u00b7 Historische Kurse')).toBeNull();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Synthetic renamed coin' } });
  await vi.waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Stammdaten speichern' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stammdaten speichern' }));
  await vi.waitFor(() =>
    expect(vi.mocked(request).mock.calls.some(([method]) => method === 'PATCH')).toBe(true),
  );
  const payload = vi.mocked(request).mock.calls.find(([method]) => method === 'PATCH')?.[2];
  expect(payload).not.toHaveProperty('quoteUrl');
});
