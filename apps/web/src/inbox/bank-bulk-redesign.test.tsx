// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BankBulkActions, planBulk, safeBankRows } from './bank-bulk-actions';
import type { InboxStored } from './api';
import type { PreparedBankSuggestion } from './bank-candidate';

const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);
let client: QueryClient;
const candidate = (id: string): InboxStored => ({
  type: 'stored',
  id,
  kind: 'import',
  title: 'Synthetic movement',
  detail: null,
  refType: 'bank-sync-candidate',
  refId: id,
  urgent: false,
  createdAt: '2026-09-17T12:00:00Z',
  bankCandidate: {
    date: '2026-09-17',
    amountCents: -1201,
    currency: 'EUR',
    memo: 'Synthetic shop',
    payeeName: null,
    accountName: 'Synthetic bank',
  },
});
const safe: PreparedBankSuggestion = {
  action: 'rule',
  ruleId: 'rule-1',
  revision: 'b'.repeat(64),
  candidateRevision: 'a'.repeat(64),
  label: 'Synthetic rule',
  bulkSafe: true,
};
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it('excludes duplicates, ambiguous or unprepared rows and missing source amounts from the shortcut', () => {
  const rows = [
    candidate('safe'),
    candidate('duplicate'),
    candidate('ambiguous'),
    candidate('unprepared'),
    { ...candidate('missing'), bankCandidate: undefined },
  ];
  const prepared = (id: string): PreparedBankSuggestion | undefined =>
    id === 'duplicate'
      ? { action: 'merge', bookingId: 'own-1', label: 'Merge' }
      : id === 'ambiguous'
        ? { ...safe, bulkSafe: false }
        : id === 'unprepared'
          ? undefined
          : safe;
  expect(safeBankRows(rows, prepared).map((row) => row.id)).toEqual(['safe']);
  const preview = planBulk('confirm', safeBankRows(rows, prepared), prepared);
  expect(preview).toMatchObject({ selectedCount: 1, changed: 1, skipped: 0 });
  expect(preview.rows).toEqual([
    {
      type: 'candidate',
      id: 'safe',
      suggestion: {
        action: 'rule',
        ruleId: 'rule-1',
        revision: 'b'.repeat(64),
        candidateRevision: 'a'.repeat(64),
      },
    },
  ]);
});

it.each([false, true])(
  'previews and cancels without writes, then confirms with one shared Undo group (redesign %s)',
  async (enabled) => {
    flags.REDESIGN_ENABLED = enabled;
    const requests: { path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      requests.push({ path: input, body: JSON.parse(init?.body as string) });
      return Response.json(
        input === '/api/undo'
          ? { groupId: 'undo-1' }
          : { groupId: 'group-1', changedCount: 1, skippedCount: 0 },
      );
    });
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <BankBulkActions
            rows={[candidate('safe'), candidate('unsafe')]}
            selected={new Set()}
            onSelect={vi.fn()}
            prepared={(id) => (id === 'safe' ? safe : undefined)}
            sourceId="source-1"
          />
        </ToastProvider>
      </QueryClientProvider>,
    );
    const shortcut = screen.queryByRole('button', { name: 'Alle sicheren bestätigen (1)' });
    expect(shortcut !== null).toBe(enabled);
    expect(document.querySelector('.bank-selection-controls') !== null).toBe(enabled);
    expect(requests).toEqual([]);
    if (!enabled) return;
    const user = userEvent.setup();
    await user.click(shortcut!);
    let dialog = screen.getByRole('dialog', { name: 'Bankauswahl prüfen' });
    expect(within(dialog).getByText(/Umbuchungen, mögliche Duplikate/)).toBeTruthy();
    expect(
      within(dialog).getByRole('list', { name: 'Auswirkung der sicheren Vorschläge' }).textContent,
    ).toContain('−12,01 €');
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));
    expect(requests).toEqual([]);
    await user.click(shortcut!);
    dialog = screen.getByRole('dialog', { name: 'Bankauswahl prüfen' });
    await user.click(within(dialog).getByRole('button', { name: 'Auswahl jetzt ausführen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      path: '/api/bank-sync/inbox/bulk',
      body: {
        action: 'confirm',
        sourceId: 'source-1',
        expectedChanged: 1,
        rows: [
          {
            type: 'candidate',
            id: 'safe',
            suggestion: {
              action: 'rule',
              ruleId: 'rule-1',
              revision: 'b'.repeat(64),
              candidateRevision: 'a'.repeat(64),
            },
          },
        ],
      },
    });
    expect(screen.getAllByRole('button', { name: 'Rückgängig' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({ path: '/api/undo', body: { groupId: 'group-1' } });
  },
);
