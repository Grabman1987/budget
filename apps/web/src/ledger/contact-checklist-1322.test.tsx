// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const resplitWrite = vi.hoisted(() => vi.fn());
const http = vi.hoisted(() => ({ request: vi.fn() }));
const payeeRows = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('../api/http', async (original) => ({
  ...(await original<typeof Http>()),
  request: http.request,
}));
vi.mock('./mutations', () => ({
  useLedgerWrites: () => ({
    create: { mutateAsync: create },
    checklist: { mutateAsync: checklistWrite },
    resplit: { mutateAsync: resplitWrite, isPending: false },
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
  payeesQuery: () => ({ queryKey: ['payees'], queryFn: async () => ({ payees: payeeRows.rows }) }),
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
      selectable: true,
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
      selectable: true,
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
  resplitWrite.mockReset();
  resplitWrite.mockResolvedValue({ bookingId: 'b9', groupId: 'g' });
  payeeRows.rows = [];
  checklistWrite.mockResolvedValue({ bookingId: 'new', groupId: 'g', restCents: 0 });
  http.request.mockReset();
  http.request.mockResolvedValue(checklist);
});
afterEach(() => vi.useRealTimers());

async function open(
  amount: string,
  data: unknown = checklist,
  prefillExtra: Partial<BookingDraft> = { contactId: 'k1' },
) {
  http.request.mockResolvedValue(data);
  const prefill: Partial<BookingDraft> = {
    kind: 'income',
    accountId: 'giro',
    date: '2026-10-05',
    amount,
    ...prefillExtra,
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
const applied = (id: string) => screen.getByTestId(`applied-${id}`).textContent ?? '';

it('lists every open item; one contribution and all outlays are ticked, Rest 0,00 € when exact', async () => {
  await open('825,01');
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  const rent = screen.getByRole('checkbox', { name: /Mietanteil → Miete/ }) as HTMLInputElement;
  const abo = screen.getByRole('checkbox', { name: /Abo → Abos/ }) as HTMLInputElement;
  const outlay = screen.getByRole('checkbox', { name: /Auslage 01\.09\. → Essen/ });
  expect(rent.checked).toBe(true);
  expect(abo.checked).toBe(false);
  expect((outlay as HTMLInputElement).checked).toBe(true);
  expect(rest()).toMatch(/^0,00\s€$/);
  expect(applied('c1')).toMatch(/800,00\s€$/);
  expect(applied('o1')).toMatch(/25,01\s€$/);
  expect(screen.queryByRole('radiogroup')).toBeNull();
});

it('contributions are multi-select like outlays; Rest and the sent ids follow', async () => {
  const user = await open('825,01');
  const rent = screen.getByRole('checkbox', { name: /Mietanteil/ }) as HTMLInputElement;
  const abo = screen.getByRole('checkbox', { name: /Abo/ }) as HTMLInputElement;
  await user.click(abo);
  expect(abo.checked).toBe(true);
  expect(rent.checked).toBe(true);
  expect(rest()).toMatch(/^-?19,99\s€$|^−19,99\s€$/);
  await user.click(rent);
  expect(rent.checked).toBe(false);
  expect(abo.checked).toBe(true);
  await user.click(abo);
  expect(abo.checked).toBe(false);
});

it('shows the applied amount live; paid less offers open or schenken', async () => {
  const user = await open('810,01');
  expect(rest()).toMatch(/^[−-]15,00\s€$/);
  expect(applied('c1')).toMatch(/800,00\s€$/);
  expect(applied('o1')).toMatch(/10,01\s€$/);
  expect(
    (screen.getByLabelText('bleibt offen bis nächsten Monat') as HTMLInputElement).checked,
  ).toBe(true);
  await user.click(screen.getByLabelText('schenken'));
  expect((screen.getByLabelText('schenken') as HTMLInputElement).checked).toBe(true);
  // Unticking the outlay turns the gap into a 10,01 € surplus.
  await user.click(screen.getByRole('checkbox', { name: /Auslage/ }));
  await waitFor(() => expect(rest()).toMatch(/^10,01\s€$/));
  expect(screen.queryByLabelText('schenken')).toBeNull();
  expect(
    (screen.getByLabelText('als Guthaben für nächsten Monat stehen lassen') as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(screen.getByLabelText('als Geschenk an mich buchen')).toBeTruthy();
});

it('hides schenken when the shortfall falls only on the contribution', async () => {
  const user = await open('700,00');
  await user.click(screen.getByRole('checkbox', { name: /Auslage/ }));
  await waitFor(() => expect(rest()).toMatch(/^[−-]100,00\s€$/));
  expect(screen.getByLabelText('bleibt offen bis nächsten Monat')).toBeTruthy();
  expect(screen.queryByLabelText('schenken')).toBeNull();
});

it('hides schenken when a short outlay has no category', async () => {
  await open('810,01', {
    ...checklist,
    outlays: [{ ...checklist.outlays[0]!, categoryId: null, categoryName: null }],
  });
  expect(rest()).toMatch(/^[−-]15,00\s€$/);
  expect(screen.getByLabelText('bleibt offen bis nächsten Monat')).toBeTruthy();
  expect(screen.queryByLabelText('schenken')).toBeNull();
});

it('shows a contribution without target disabled', async () => {
  await open('825,01', {
    ...checklist,
    contributions: [
      ...checklist.contributions,
      { ...checklist.contributions[1]!, occurrenceId: 'c3', name: 'Ohne Ziel', selectable: false },
    ],
  });
  expect((screen.getByRole('checkbox', { name: /Ohne Ziel/ }) as HTMLInputElement).disabled).toBe(
    true,
  );
});

it('is keyboard operable: Space toggles a row and Rest follows', async () => {
  const user = await open('825,01');
  const row = screen.getByRole('checkbox', { name: /Auslage/ }) as HTMLInputElement;
  row.focus();
  await user.keyboard(' ');
  expect(row.checked).toBe(false);
  expect(rest()).toMatch(/^25,01\s€$/);
  await user.keyboard(' ');
  expect(row.checked).toBe(true);
  expect(rest()).toMatch(/^0,00\s€$/);
});

it('saves one checklist receipt with the ticked ids and the chosen rest handling', async () => {
  const user = await open('860,00');
  expect(rest()).toMatch(/^34,99\s€$/);
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
      occurrenceIds: ['c1'],
      creditReceiptSplitIds: [],
      shortfall: 'open',
      surplus: 'gift',
    },
  });
  expect(create).not.toHaveBeenCalled();
});

const withCredit = (usable: boolean) => ({
  outlays: checklist.outlays,
  contributions: [],
  credits: [
    {
      receiptSplitId: 'r1',
      date: '2026-09-02',
      remainingCents: 1000,
      categoryId: usable ? null : 'reise',
      categoryName: usable ? null : 'Reise',
      usable,
    },
  ],
});

it('offsets a usable credit against the outlays: Rest and the sent ids follow the net amount', async () => {
  const user = await open('15,01', withCredit(true));
  const credit = screen.getByRole('checkbox', { name: /Guthaben/ }) as HTMLInputElement;
  expect(credit.checked).toBe(true);
  expect(screen.getByText(/^[−-]10,00\s€/)).toBeTruthy();
  expect(rest()).toMatch(/^0,00\s€$/);
  expect(applied('o1')).toMatch(/25,01\s€$/);
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(checklistWrite).toHaveBeenCalledTimes(1));
  expect(checklistWrite.mock.calls[0]![0].body).toMatchObject({
    amountCents: 1501,
    outlaySplitIds: ['o1'],
    creditReceiptSplitIds: ['r1'],
  });
  await user.click(credit);
  expect(rest()).toMatch(/^[−-]10,00\s€$/);
});

it('shows an earmarked credit disabled and does not reduce the total', async () => {
  await open('25,01', withCredit(false));
  const credit = screen.getByRole('checkbox', { name: /Guthaben → Reise/ }) as HTMLInputElement;
  expect(credit.disabled).toBe(true);
  expect(credit.checked).toBe(false);
  expect(rest()).toMatch(/^0,00\s€$/);
});

it('saves two ticked contributions in one receipt', async () => {
  const user = await open('819,99');
  await user.click(screen.getByRole('checkbox', { name: /Abo/ }));
  await user.click(screen.getByRole('checkbox', { name: /Auslage/ }));
  expect(rest()).toMatch(/^0,00\s€$/);
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(checklistWrite).toHaveBeenCalledTimes(1));
  expect(checklistWrite.mock.calls[0]![0].body).toMatchObject({
    outlaySplitIds: [],
    occurrenceIds: ['c1', 'c2'],
  });
});

it('payee path: a payee linked to a contact shows the checklist and keeps the payee', async () => {
  payeeRows.rows = [{ id: 'pz', name: 'Zahler Muster', contactId: 'k1', defaultCategoryId: null }];
  const user = await open('825,01', checklist, { payee: 'Zahler Muster' });
  expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(checklistWrite).toHaveBeenCalledTimes(1));
  expect(checklistWrite.mock.calls[0]![0]).toMatchObject({
    contactId: 'k1',
    body: { payeeId: 'pz', occurrenceIds: ['c1'], outlaySplitIds: ['o1'] },
  });
  expect(create).not.toHaveBeenCalled();
});

it('re-split: an existing inflow of a contact offers Neu aufteilen with its own links ticked', async () => {
  const own = {
    outlays: [],
    credits: [],
    contributions: checklist.contributions.map((c, i) => ({ ...c, linkedHere: i === 0 })),
  };
  http.request.mockImplementation(async (_method: string, url: string) =>
    url.includes('/checklist') ? own : url.includes('receipt') ? { receipts: [] } : {},
  );
  payeeRows.rows = [{ id: 'pz', name: 'Zahler Muster', contactId: 'k1', defaultCategoryId: null }];
  const booking = {
    id: 'b9',
    accountId: 'giro',
    accountName: 'Giro Muster',
    date: '2026-10-01',
    amountCents: 80000,
    payeeId: 'pz',
    payeeName: 'Zahler Muster',
    memo: null,
    status: 'confirmed',
    flag: null,
    transferId: null,
    transferAccountId: null,
    transferAccountName: null,
    projectId: null,
    currency: 'EUR',
    originalAmountCents: null,
    originalCurrency: null,
    balanceAfterCents: null,
    splits: [
      {
        id: 's1',
        categoryId: 'miete',
        categoryName: 'Miete',
        amountCents: 80000,
        memo: null,
        contactId: null,
        incomeTypeId: null,
        transferId: null,
      },
    ],
  };
  const onDone = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <CaptureForm
          state={{ mode: 'edit', booking } as never}
          onDone={onDone}
          dirtyRef={{ current: false }}
          discard={{ asking: false, keep: vi.fn(), discard: vi.fn() }}
          requestClose={vi.fn()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Neu aufteilen' }));
  const rent = (await screen.findByRole('checkbox', { name: /Mietanteil/ })) as HTMLInputElement;
  expect(rent.checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: /Abo/ }) as HTMLInputElement).checked).toBe(false);
  expect(rest()).toMatch(/^0,00\s€$/);
  await user.click(screen.getByRole('button', { name: 'Neu aufteilen speichern' }));
  await waitFor(() => expect(resplitWrite).toHaveBeenCalledTimes(1));
  expect(resplitWrite).toHaveBeenCalledWith({
    contactId: 'k1',
    bookingId: 'b9',
    occurrenceIds: ['c1'],
  });
  await user.click(screen.getByRole('checkbox', { name: /Mietanteil/ }));
  expect(screen.getByRole('alert').textContent).toMatch(/ganzen Betrag/);
  expect(
    (screen.getByRole('button', { name: 'Neu aufteilen speichern' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

const outlayRow = (splitId: string, date: string, remainingCents: number) => ({
  splitId,
  bookingId: `b-${splitId}`,
  date,
  remainingCents,
  memo: null,
  categoryId: 'essen',
  categoryName: 'Essen',
});

it('"Alles bis <Datum> ausgleichen" ticks outlays up to the date and unticks later ones', async () => {
  const user = await open('17,00', {
    outlays: [
      outlayRow('o1', '2026-09-01', 1000),
      outlayRow('o2', '2026-09-20', 700),
      outlayRow('o3', '2026-10-02', 500),
    ],
    contributions: [],
    credits: [],
  });
  expect(screen.getByTestId('checklist-selected').textContent).toMatch(/^22,00\s€$/);
  fireEvent.change(screen.getByLabelText('Ausgleichsdatum'), { target: { value: '2026-09-30' } });
  await user.click(screen.getByRole('button', { name: 'Alles bis 30.09.2026 ausgleichen' }));
  const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
  expect(screen.getByTestId('checklist-selected').textContent).toMatch(/^17,00\s€$/);
  expect(rest()).toMatch(/^0,00\s€$/);
});

it('a remainder can be taken over as a gift per outlay; the others stay open', async () => {
  const user = await open('12,00', {
    outlays: [outlayRow('o1', '2026-09-01', 1000), outlayRow('o2', '2026-09-20', 700)],
    contributions: [],
    credits: [],
  });
  expect(rest()).toMatch(/^[−-]5,00\s€$/);
  await user.click(screen.getByRole('checkbox', { name: /Rest 5,00\s€ vom 20\.09\./ }));
  await user.click(screen.getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(checklistWrite).toHaveBeenCalledTimes(1));
  expect(checklistWrite.mock.calls[0]![0].body).toMatchObject({
    shortfall: 'open',
    waiveOutlaySplitIds: ['o2'],
  });
});
