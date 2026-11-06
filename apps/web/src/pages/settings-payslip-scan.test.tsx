// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { SettingsConnections } from './settings-connections';
const state = vi.hoisted(() => ({
  code: 'dropbox_path' as string | null,
  date: '2026-11-05T13:10:00Z' as string | null,
}));
vi.mock('../reports/payslip-intake', () => ({ PayslipSourceSection: () => null }));
vi.mock('./read-source', () => ({ CryptoReadSourceSection: () => null }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('../api/http', () => ({
  request: async (_method: string, path: string) =>
    path === '/api/payslip-intake/status'
      ? {
          dropboxConfigured: true,
          dropboxConnected: state.code === null || state.code === 'document_warning',
          lastScanAt: state.date,
          filesFound: 0,
          errors: state.code ? 1 : 0,
          errorCode: state.code,
        }
      : path === '/api/bank-sync'
        ? { configured: false, connections: [] }
        : path === '/api/market/status'
          ? { lastRun: null, lastSuccess: null }
          : path.startsWith('/api/sources/spritmonitor')
            ? { configured: false, running: false, rows: [], lastResult: null, state: null }
            : { reference: null },
}));
afterEach(cleanup);
it('calls a failed payslip scan an attempt and does not label its timestamp as success', async () => {
  state.code = 'dropbox_path';
  state.date = '2026-11-05T13:10:00Z';
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <SettingsConnections bankConfiguration={null} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const card = within(screen.getByRole('region', { name: 'Gehaltszettel' }));
  expect(await card.findByText('Abruf fehlgeschlagen')).toBeTruthy();
  expect(card.getByText(/Letzter Scanversuch:/)).toBeTruthy();
  expect(card.getByText(/0 Dateien bis zum Fehler/)).toBeTruthy();
  expect(card.queryByText(/Letzter Erfolg:/)).toBeNull();
  expect(
    within(screen.getByRole('region', { name: 'Bank' })).getByText(/Letzter Erfolg:/),
  ).toBeTruthy();
});
it('distinguishes no scan from no successful scan', async () => {
  state.code = null;
  state.date = null;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <SettingsConnections bankConfiguration={null} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(
    await within(screen.getByRole('region', { name: 'Gehaltszettel' })).findByText(
      /Letzter Scanversuch: Noch kein Scanversuch/,
    ),
  ).toBeTruthy();
});
