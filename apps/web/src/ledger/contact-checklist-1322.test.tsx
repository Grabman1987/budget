// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import { CaptureForm } from './capture-form';
import type * as Http from '../api/http';
import type { BookingDraft } from './booking-model';

// jsdom has no native media query implementation.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
});
const flags = vi.hoisted(() => ({ REDESIGN_ENABLED: false }));
vi.mock('../shell/redesign-flag', () => flags);

const create = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const checklistWrite = vi.hoisted(() => vi.fn());
const http = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../api/http', async (original) => ({
  ...(await original<typeof Http>()),
  request: http.request,
}));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({
    create: { mutateAsync: create },
    checklist: { mutateAsync: checklistWrite },
    patch: { mutateAsync: patch },
  }),
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
        { id: 'giro', name: 'Giro Muster', type: 'checking', onBudget: true, closedAt: null },
      ],
    }),
  }),
  lookupsQuery: () => ({
    queryKey: ['lookups'],
    queryFn: async () => ({
      categories: [{ id: 'advance', name: 'Auslagen', kind: 'advance' }],
      groups: [],
      contacts: [{ id: 'k1', name: 'Kontakt Muster' }],
      incomeTypes: [],
      projects: [],
    }),
  }),
  payeesQuery: () => ({ queryKey: ['payees'], queryFn: async () => ({ payees: [] }) }),
}));
vi.mock('../pwa/queue-store', () => ({
  readChoices: async () => undefined,
  saveChoices: async () => undefined,
}));

// Synthetic contact: open outlay 25,01 € and due contributions 800,00 € and 19,99 €.
const checklist = {
  outlays: [
    {
      splitId: 'o1',
      bookingId: 'b1',
      date: '2026-09-01',
      remainingCents: 2501,
      memo: null,
      categoryId: 'essen',
      categoryName: 'Essen',
    },
  ],
  contributions: [
    {
      occurrenceId: 'c1',
      paymentId: 'p1',
      name: 'Mietanteil',
      dueDate: '2026-10-03',
      amountCents: 80000,
      categoryId: 'miete',
      categoryName: 'Miete',
      incomeTypeId: null,
    },
    {
      occurrenceId: 'c2',
      paymentId: 'p2',
      name: 'Abo',
      dueDate: '2026-10-04',
      amountCents: 1999,
      categoryId: 'abo',
      categoryName: 'Abos',
      incomeTypeId: null,
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T12:00:00+02:00'));
  flags.REDESIGN_ENABLED = false;
  create.mockReset();
  patch.mockReset();
  checklistWrite.mockReset();
  checklistWrite.mockResolvedValue({ bookingId: 'new', groupId: 'g', restCents: 0 });
  http.request.mockReset();
  http.request.mockResolvedValue(checklist);
});
afterEach(() => vi.useRealTimers());

async function open(amount: string) {
  const prefill: Partial<BookingDraft> = {
    kind: 'income',
    accountId: 'giro',
    date: '2026-10-05',
    amount,
    contactId: 'k1',
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'create', prefill }}
          onDone={vi.fn()}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  await screen.findByTestId('contact-checklist');
  return userEvent.setup();
}
const rest = () => screen.getByTestId('checklist-rest').textContent ?? '';

it('lists every open item, all ticked, and an exact payment leaves Rest 0,00 €', async () => {
  await open('845,00');
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  expect(screen.getByRole('checkbox', { name: /Mietanteil → Miete/ })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /Abo → Abos/ })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /Auslage 01\.09\. → Essen/ })).toBeTruthy();
  expect(rest()).toMatch(/^0,00\s€$/);
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('offers open or gift when paid less, credit or gift when paid more', async () => {
  const user = await open('830,00');
  expect(rest()).toMatch(/^[−-]15,00\s€$/);
  const open_ = screen.getByLabelText('bleibt offen bis nächsten Monat') as HTMLInputElement;
  expect(open_.checked).toBe(true);
  await user.click(screen.getByLabelText('schenken'));
  expect((screen.getByLabelText('schenken') as HTMLInputElement).checked).toBe(true);
  // Unticking the subscription (19,99 €) turns the 15,00 € gap into a 4,99 € surplus.
  await user.click(screen.getByRole('checkbox', { name: /Abo → Abos/ }));
  await waitFor(() => expect(rest()).toMatch(/^4,99\s€$/));
  expect(screen.queryByLabelText('schenken')).toBeNull();
  const credit = screen.getByLabelText(
    'als Guthaben für nächsten Monat stehen lassen',
  ) as HTMLInputElement;
  expect(credit.checked).toBe(true);
  expect(screen.getByLabelText('als Geschenk an mich buchen')).toBeTruthy();
});

it('is keyboard operable: Space toggles a row and Rest follows', async () => {
  const user = await open('845,00');
  const row = screen.getByRole('checkbox', { name: /Auslage/ }) as HTMLInputElement;
  row.focus();
  await user.keyboard(' ');
  expect(row.checked).toBe(false);
  expect(rest()).toMatch(/^25,01\s€$/);
  await user.keyboard(' ');
  expect(rest()).toMatch(/^0,00\s€$/);
});

it('saves one checklist receipt with the ticked ids and the chosen rest handling', async () => {
  const user = await open('860,00');
  expect(rest()).toMatch(/^15,00\s€$/);
  await user.click(screen.getByLabelText('als Geschenk an mich buchen'));
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(checklistWrite).toHaveBeenCalledTimes(1));
  expect(checklistWrite).toHaveBeenCalledWith({
    contactId: 'k1',
    body: {
      accountId: 'giro',
      date: '2026-10-05',
      amountCents: 86000,
      memo: null,
      outlaySplitIds: ['o1'],
      occurrenceIds: ['c1', 'c2'],
      shortfall: 'open',
      surplus: 'gift',
    },
  });
  expect(create).not.toHaveBeenCalled();
});
