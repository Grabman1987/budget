// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BookingFieldDialog } from './booking-field-dialog';
import * as api from './api';

vi.mock('./api', async (original: () => Promise<Record<string, unknown>>) => ({
  ...(await original()),
  readDatePreview: vi.fn(),
  readPayeePreview: vi.fn(),
  fetchPayees: vi.fn(async () => ({ payees: [{ id: 'p1', name: 'Synthetic Shop' }] })),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const preview = (over: Partial<api.BookingFieldPreview> = {}): api.BookingFieldPreview => ({
  ids: ['a', 'b', 'c'],
  selection: {} as api.BookingFieldPreview['selection'],
  changed: ['a'],
  unchanged: ['b'],
  skipped: [
    {
      id: 'c',
      reason: 'linked_transfer',
      message: 'x',
      booking: { description: 'Synthetic Umbuchung', accountName: 'Giro' } as never,
    },
  ],
  monthShifts: [
    { month: '2026-09', currency: 'EUR', deltaCents: 1000 },
    { month: '2026-10', currency: 'EUR', deltaCents: -1000 },
  ],
  revision: 'r'.repeat(64),
  ...over,
});

const mount = (kind: 'date' | 'payee', onConfirm = vi.fn(async () => {})) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BookingFieldDialog
        kind={kind}
        ids={['a', 'b', 'c']}
        onClose={() => {}}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
  return onConfirm;
};

it('date: needs a date, shows counts, reasons and month shifts, then confirms once', async () => {
  vi.mocked(api.readDatePreview).mockResolvedValue(preview());
  const onConfirm = mount('date');
  const user = userEvent.setup();
  expect(
    (screen.getByRole('button', { name: 'Änderungen prüfen' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.type(screen.getByLabelText('Neues Datum'), '2026-10-03');
  await user.click(screen.getByRole('button', { name: 'Änderungen prüfen' }));
  expect((await screen.findByRole('status')).textContent).toBe(
    '3 ausgewählt · 1 werden geändert · 1 geschützt · 1 bereits unverändert.',
  );
  expect(api.readDatePreview).toHaveBeenCalledWith(['a', 'b', 'c'], '2026-10-03');
  expect(screen.getByText(/Synthetic Umbuchung · Giro · verknüpfte Umbuchung/)).toBeTruthy();
  expect(screen.getByLabelText('Verschiebung zwischen Monaten').textContent).toContain('09/2026');
  await user.click(screen.getByRole('button', { name: 'Änderungen übernehmen' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledWith({ date: '2026-10-03' }, expect.anything());
});

it('payee: editing the choice invalidates the preview; no confirm when nothing changes', async () => {
  vi.mocked(api.readPayeePreview).mockResolvedValue(preview({ changed: [], monthShifts: [] }));
  mount('payee');
  const user = userEvent.setup();
  const select = screen.getByLabelText('Neuer Empfänger');
  await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
  await user.selectOptions(select, 'p1');
  await user.click(screen.getByRole('button', { name: 'Änderungen prüfen' }));
  expect(await screen.findByText('Neuer Empfänger: Synthetic Shop')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Änderungen übernehmen' })).toBeNull();
  expect(screen.queryByLabelText('Verschiebung zwischen Monaten')).toBeNull();
  await user.selectOptions(select, 'none');
  expect(screen.queryByRole('status')).toBeNull();
  expect(api.readPayeePreview).toHaveBeenCalledWith(['a', 'b', 'c'], 'p1');
});

it('shows a failure and no stale preview when the preview request fails', async () => {
  vi.mocked(api.readDatePreview).mockRejectedValue(new Error('boom'));
  mount('date');
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Neues Datum'), '2026-10-03');
  await user.click(screen.getByRole('button', { name: 'Änderungen prüfen' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Änderungen übernehmen' })).toBeNull();
});
