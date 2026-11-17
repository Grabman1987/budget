// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import type * as Http from '../api/http';

// jsdom has no native media query implementation.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: flags.phone && query === '(max-width: 767px)',
    addEventListener() {},
    removeEventListener() {},
  }),
});
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false, phone: false }));
vi.mock('../shell/redesign-flag', () => flags);

const create = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', async (original) => ({
  ...(await original<typeof Http>()),
  request: http.request,
}));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({ create: { mutateAsync: create }, patch: { mutateAsync: patch } }),
}));
vi.mock('../budget/budget-api', () => ({
  budgetQuery: () => ({ queryKey: ['budget'], queryFn: async () => null }),
}));
vi.mock('./queries', () => ({
  LEDGER_KEY: ['ledger'],
  accountsQuery: () => ({
    queryKey: ['accounts'],
    queryFn: async () => ({
      accounts: [
        { id: 'wallet', name: 'Bargeld Muster', type: 'cash', onBudget: true, closedAt: null },
        { id: 'giro', name: 'Giro Muster', type: 'checking', onBudget: true, closedAt: null },
      ],
    }),
  }),
  lookupsQuery: () => ({
    queryKey: ['lookups'],
    queryFn: async () => ({
      categories: [],
      groups: [],
      contacts: [],
      incomeTypes: [],
      projects: [],
    }),
  }),
  payeesQuery: () => ({
    queryKey: ['payees'],
    queryFn: async () => ({ payees: [{ id: 'shop', name: 'Laden Beispiel' }] }),
  }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
}));
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  flags.REDESIGN_ENABLED = false;
  flags.phone = false;
  create.mockReset();
  patch.mockReset();
  http.request.mockReset();
  http.request.mockResolvedValue({ groupId: 'synthetic-receipt' });
  patch.mockResolvedValue({ groupId: 'synthetic-patch' });
  create.mockResolvedValue({ bookings: [], groupId: 'synthetic-group' });
});

afterEach(cleanup);
beforeEach(() => {
  // jsdom has no showModal.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
async function mount(redesign: boolean, phone: boolean) {
  flags.REDESIGN_ENABLED = redesign;
  flags.phone = phone;
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create', accountId: 'wallet' }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole('option', { name: 'Bargeld Muster' });
}

it('redesign phone: only the header carries the file upload entry', async () => {
  await mount(true, true);
  expect(screen.queryByRole('button', { name: 'Dokument hochladen' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Datei anhängen' })).toHaveLength(1);
});

it('redesign desktop and old UI: the capture form has no upload entry', async () => {
  await mount(true, false);
  expect(screen.queryByRole('button', { name: 'Dokument hochladen' })).toBeNull();
  cleanup();
  await mount(false, true);
  expect(screen.queryByRole('button', { name: 'Dokument hochladen' })).toBeNull();
});

it('keeps the typed capture draft while attaching a file from the header', async () => {
  await mount(true, true);
  const amount = screen.getByLabelText('Betrag', { exact: true }) as HTMLInputElement;
  fireEvent.change(amount, { target: { value: '12,40' } });
  expect(amount.value).toBe('12,40');
  const button = screen.getByRole('button', { name: 'Datei anhängen' });
  expect(button.closest('.bk-editor-titlebar')).toBeTruthy();
  const picker = screen.getByLabelText('Belegdatei auswählen') as HTMLInputElement;
  const openPicker = vi.spyOn(picker, 'click');
  fireEvent.click(button);
  expect(openPicker).toHaveBeenCalledOnce();
  expect(picker.type).toBe('file');
  expect((screen.getByLabelText('Betrag', { exact: true }) as HTMLInputElement).value).toBe(
    '12,40',
  );
});
