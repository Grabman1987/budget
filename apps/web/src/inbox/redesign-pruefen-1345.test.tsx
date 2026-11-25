// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { InboxStored } from './api';
import { AccountReviewRows } from './account-review-rows';
import { LinkProposalAction } from './link-proposal';
import { TaskSourceSummary } from './task-source-summary';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('../shell/app-link', () => ({
  AppLink: ({ to, search, children, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} data-search={JSON.stringify(search)} {...rest}>
      {children as never}
    </a>
  ),
}));

let client: QueryClient;
afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});
const wrap = (node: React.ReactNode) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{node}</ToastProvider>
    </QueryClientProvider>,
  );
};

it('renders sources without open items as plain muted rows and unfolds under its own row', () => {
  const select = vi.fn();
  const counts = { accounts: 2, plan: 0, receipts: 0, payslips: 0, other: 0 };
  const { rerender } = render(
    <TaskSourceSummary counts={counts} selected={undefined} onSelect={select} />,
  );
  expect(screen.getAllByRole('row')).toHaveLength(6);
  expect(screen.queryByRole('button', { name: /Belege ohne Buchung/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Plan/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Prüfen · Konten prüfen' })).toBeTruthy();
  rerender(
    <TaskSourceSummary
      counts={counts}
      selected="accounts"
      onSelect={select}
      renderDetail={(source) => <p>Detail {source}</p>}
    />,
  );
  const rows = screen.getAllByRole('row');
  const own = rows.findIndex((row) => within(row).queryByText('Konten prüfen'));
  expect(rows[own + 1]?.textContent).toBe('Detail accounts');
  expect(rows[own + 2]?.textContent).toContain('Plan');
});

it('shows the balance and confirms it with "Passt" through the reconciliation write', async () => {
  const writes: Array<{ path: string; body: unknown }> = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST') {
      writes.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json({ result: { groupId: 'g1' }, account: {} });
    }
    if (path === '/api/accounts')
      return Response.json({
        accounts: [
          { id: 'a1', name: 'Muster', currency: 'EUR', clearedCents: 123456, unclearedCents: 0 },
        ],
      });
    return Response.json({});
  });
  wrap(
    <AccountReviewRows
      items={[{ accountId: 'a1', accountName: 'Muster', days: 20, action: 'reconcile' }]}
    />,
  );
  expect((await screen.findByTestId('account-review-balance')).textContent).toContain('1.234,56');
  expect(screen.getByRole('link', { name: 'Konto öffnen' }).getAttribute('href')).toBe(
    '/konten/a1',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Kontostand passt: Muster' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]?.path).toBe('/api/accounts/a1/reconciliation');
  expect(writes[0]?.body).toMatchObject({ statementBalanceCents: 123456 });
});

it('offers Bestätigen and Buchung öffnen for a proposed booking', () => {
  const open = vi.fn();
  wrap(
    <LinkProposalAction
      item={{ linkProposal: { occurrenceId: 'o1', bookingId: 'b1' } } as unknown as InboxStored}
      disabled={false}
      onOpenBooking={open}
    />,
  );
  expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Buchung öffnen' }));
  expect(open).toHaveBeenCalledWith('b1');
});
