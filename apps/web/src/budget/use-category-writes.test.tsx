// @vitest-environment jsdom
import {
  createTestDatabase,
  insertTracked,
  schema,
  updateTracked,
  type OpenedDatabase,
} from '@budget/db';
import { ToastProvider, useToast } from '@budget/ui';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLedgerApi } from '../../../server/src/api';
import { inboxQuery, resolveInbox } from '../inbox/api';
import { paymentsPreviewQuery } from '../pages/payments-preview-report';
import { goalsProgressReportQuery } from '../pages/goals-progress-report';
import { expectedQuery } from '../expected/api';
import { useBudgetWrite } from './use-category-writes';
import { usePlanHistory } from './plan-history';

let opened: OpenedDatabase;
let client: QueryClient;
const ID = 'synthetic-warning';
function Workflow() {
  const write = useBudgetWrite();
  const toast = useToast();
  const history = usePlanHistory();
  const queue = useQuery(inboxQuery());
  useQuery(paymentsPreviewQuery());
  useQuery(expectedQuery());
  useQuery(goalsProgressReportQuery());
  return (
    <>
      <button disabled={history?.label !== 'Rückgängig'} onClick={() => history?.run()}>
        Toolbar undo
      </button>
      <button disabled={history?.label !== 'Wiederholen'} onClick={() => history?.run()}>
        Toolbar redo
      </button>
      <button onClick={() => toast.dismiss()}>Dismiss</button>
      <button onClick={() => toast.show({ message: 'Unrelated error' })}>Other toast</button>
      <button
        onClick={() =>
          void write(
            async () => ({ groupId: '', changedCount: 0 }),
            () => 'No change',
          )
        }
      >
        No group
      </button>
      <button
        onClick={() =>
          void write(
            async () => {
              throw new Error('offline');
            },
            () => 'Not reached',
          )
        }
      >
        Failed write
      </button>
      <span aria-label="Offene Aufgaben">{queue.data?.count}</span>
      <button
        onClick={() =>
          void write(
            () => resolveInbox(ID),
            () => 'Aufgabe erledigt.',
          )
        }
      >
        Erledigen
      </button>
    </>
  );
}
const row = () => opened.db.select().from(schema.inboxItem).get()!;
const state = async (count: number) =>
  waitFor(() => expect(screen.getByLabelText('Offene Aufgaben').textContent).toBe(String(count)));
const click = async (name: string) =>
  act(async () => fireEvent.click(screen.getByRole('button', { name })));
const feedback = async (text: string) =>
  waitFor(() => {
    const toast = screen.getByRole('status');
    expect(toast.className).toContain('is-open');
    expect(toast.querySelector('.toast-body > span')?.textContent).toBe(text);
    expect(toast.querySelector('.toast-body')?.hasAttribute('inert')).toBe(false);
  });

beforeEach(async () => {
  opened = createTestDatabase();
  insertTracked(
    opened.db,
    schema.inboxItem,
    { id: ID, kind: 'stale_value', title: 'Synthetische Quelle prüfen' },
    { actor: 'test' },
  );
  const app = createLedgerApi({
    db: opened.db,
    today: () => '2026-10-01',
    stepUp: async (_c, next) => next(),
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => app.request(path.replace(/^\/api/, ''), init)),
  );
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Workflow />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await state(1);
});
afterEach(() => {
  client.clear();
  opened.close();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('shared budget write undo/redo feedback', () => {
  it('expires toolbar undo with its toast and keeps it disabled after an unrelated no-op', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click('Erledigen');
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      false,
    );
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      true,
    );
    vi.useRealTimers();
    await click('No group');
    await feedback('No change');
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it.each(['Dismiss', 'Other toast', 'No group', 'Failed write'])(
    'clears toolbar history on %s',
    async (next) => {
      await click('Erledigen');
      await feedback('Aufgabe erledigt.');
      expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
        false,
      );
      await click(next);
      expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.getByRole('button', { name: 'Toolbar redo' }).hasAttribute('disabled')).toBe(
        true,
      );
    },
  );
  it('does not restore a rejected undo after a later write', async () => {
    await click('Erledigen');
    await feedback('Aufgabe erledigt.');
    let reject!: (error: Error) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    await click('Toolbar undo');
    await click('No group');
    await feedback('No change');
    await act(async () => reject(new Error('offline')));
    await feedback('No change');
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
  it.each(['success', 'failure'])(
    'does not replace unrelated feedback after undo %s',
    async (outcome) => {
      await click('Erledigen');
      await feedback('Aufgabe erledigt.');
      let finish!: () => void;
      vi.mocked(fetch).mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = () =>
              outcome === 'success'
                ? resolve(
                    new Response(JSON.stringify({ groupId: 'synthetic-undo' }), { status: 200 }),
                  )
                : reject(new Error('offline'));
          }),
      );
      await click('Toolbar undo');
      await click('Other toast');
      await act(async () => finish());
      await feedback('Unrelated error');
      expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
        true,
      );
      expect(screen.getByRole('button', { name: 'Toolbar redo' }).hasAttribute('disabled')).toBe(
        true,
      );
    },
  );

  it('exposes the same audited action to toolbar and toast without applying it twice', async () => {
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      true,
    );
    await click('Erledigen');
    await state(0);
    await click('Toolbar undo');
    await state(1);
    await feedback('Rückgängig gemacht.');
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      true,
    );
    await click('Toolbar redo');
    await state(0);
    expect(row().resolution).toBe('Vom Nutzer als erledigt markiert');
    expect(vi.mocked(fetch).mock.calls.filter(([path]) => path === '/api/undo')).toHaveLength(2);
  });
  it('shows rejected undo in German and preserves the later stored state', async () => {
    await click('Erledigen');
    await state(0);
    updateTracked(
      opened.db,
      schema.inboxItem,
      [ID],
      { detail: 'Spätere Quellenprüfung' },
      { actor: 'source' },
    );
    const before = row();
    await click('Rückgängig');
    await feedback('Rückgängig nicht möglich. Bitte prüfe den aktuellen Stand.');
    await state(0);
    expect(row()).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Wiederholen' })).toBeNull();
  });
  it('shows rejected redo in German and preserves the newer source update', async () => {
    await click('Erledigen');
    await state(0);
    await click('Rückgängig');
    await state(1);
    updateTracked(
      opened.db,
      schema.inboxItem,
      [ID],
      { detail: 'Neue Quellenwarnung' },
      { actor: 'source' },
    );
    const before = row();
    await click('Wiederholen');
    await feedback('Wiederholen nicht möglich. Bitte prüfe den aktuellen Stand.');
    await state(1);
    expect(row()).toEqual(before);
    expect(screen.queryByRole('button', { name: 'Rückgängig' })).toBeNull();
  });
  it('reports connection failure without changing the stored or rendered state', async () => {
    await click('Erledigen');
    await state(0);
    const before = row();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    await click('Rückgängig');
    await feedback('Rückgängig nicht möglich. Keine Verbindung zum Server.');
    await state(0);
    expect(row()).toEqual(before);
    expect(screen.getByRole('button', { name: 'Toolbar undo' }).hasAttribute('disabled')).toBe(
      false,
    );
    await click('Toolbar undo');
    await state(1);
    await feedback('Rückgängig gemacht.');
  });
  it('refreshes the preview and expected family after writes, undo and redo', async () => {
    const reads = (path: string) =>
      vi.mocked(fetch).mock.calls.filter(([url]) => url === path).length;
    await waitFor(() => expect(reads('/api/expected/year-preview')).toBe(1));
    await waitFor(() => expect(reads('/api/expected')).toBe(1));
    await waitFor(() => expect(reads('/api/goals')).toBe(1));
    await click('Erledigen');
    await state(0);
    await waitFor(() => expect(reads('/api/expected/year-preview')).toBe(2));
    await waitFor(() => expect(reads('/api/expected')).toBe(2));
    await waitFor(() => expect(reads('/api/goals')).toBe(2));
    await click('Rückgängig');
    await state(1);
    await waitFor(() => expect(reads('/api/expected/year-preview')).toBe(3));
    await waitFor(() => expect(reads('/api/expected')).toBe(3));
    await waitFor(() => expect(reads('/api/goals')).toBe(3));
    await click('Wiederholen');
    await state(0);
    await waitFor(() => expect(reads('/api/expected/year-preview')).toBe(4));
    await waitFor(() => expect(reads('/api/expected')).toBe(4));
    await waitFor(() => expect(reads('/api/goals')).toBe(4));
  });
  it('retains the successful audited write, undo and redo chain', async () => {
    await click('Erledigen');
    await state(0);
    expect(row().resolution).toBe('Vom Nutzer als erledigt markiert');
    await click('Rückgängig');
    await feedback('Rückgängig gemacht.');
    await state(1);
    expect(row().resolvedAt).toBeNull();
    await click('Wiederholen');
    await state(0);
    expect(row().resolution).toBe('Vom Nutzer als erledigt markiert');
  });
});
