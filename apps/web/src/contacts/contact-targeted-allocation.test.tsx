// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import type * as Domain from '@budget/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactBody, type Statement } from './contacts-page';

vi.mock('@budget/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof Domain>()),
  todayInVienna: () => '2026-10-02',
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/konten/kontakte/contact-example', searchStr: '' }),
  useLinkProps: ({ to, ...props }: { to: string }) => ({ href: to, ...props }),
  useBlocker: () => undefined,
}));

const first = {
  splitId: 'first-outlay',
  bookingId: 'first-booking',
  date: '2026-09-01',
  amountCents: -1001,
  remainingCents: 0,
  memo: 'Frühere Beispielauslage',
  categoryName: 'Beispiel Möbel',
};
const second = {
  splitId: 'second-outlay',
  bookingId: 'second-booking',
  date: '2026-10-01',
  amountCents: -2002,
  remainingCents: 2002,
  memo: 'Spätere Beispielauslage',
  categoryName: 'Beispiel Reise',
};
const paid = {
  splitId: 'receipt-example',
  bookingId: 'receipt-booking',
  date: '2026-09-02',
  amountCents: 1001,
  memo: 'Beispielrückzahlung',
};
const base: Statement = {
  contact: { id: 'contact-example', name: 'Beispielkontakt' },
  asOf: '2026-10-02',
  balanceCents: 2002,
  creditCents: 0,
  credits: [],
  creditChoices: [],
  outlays: [first, second],
  movements: [first, paid, second],
  receipts: [
    {
      receiptSplitId: paid.splitId,
      allocations: [{ outlaySplitId: first.splitId, amountCents: 1001 }],
      creditCents: 0,
      recorded: true,
    },
  ],
  closedThroughSplitId: null,
};
let sent: { url: string; body: Record<string, unknown> }[];
let allocationReads: number;
let statement: Statement;
let rejectAllocation: boolean;
const dialogMethods = ['showModal', 'close'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
);
beforeEach(() => {
  sent = [];
  allocationReads = 0;
  rejectAllocation = false;
  statement = structuredClone(base);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ groupId: 'example-group' }));
    }
    if (url.endsWith('/allocations')) {
      allocationReads++;
      if (rejectAllocation)
        return new Response(JSON.stringify({ error: 'Auslage ist gesperrt.' }), { status: 422 });
      return new Response(
        JSON.stringify({
          receiptSplitId: paid.splitId,
          amountCents: 1001,
          allocations: base.receipts[0]!.allocations,
          outlays: [{ ...first, remainingCents: 1001 }, second],
        }),
      );
    }
    if (url.includes('/accounts'))
      return new Response(
        JSON.stringify({
          accounts: [
            {
              id: 'account-example',
              name: 'Beispielkonto',
              type: 'checking',
              currency: 'EUR',
              onBudget: true,
              closedAt: null,
            },
          ],
        }),
      );
    if (url.includes('/lookups'))
      return new Response(
        JSON.stringify({
          categories: [
            { id: 'category-example', name: 'Beispiel Möbel', class: 'want', kind: 'variable' },
          ],
          incomeTypes: [],
          payees: [],
        }),
      );
    return new Response(JSON.stringify(statement));
  });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of dialogMethods) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  vi.unstubAllGlobals();
});
function show(ready = true) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ContactBody statement={statement} ready={ready} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
function openAllocation() {
  fireEvent.click(screen.getByText('Zuordnung', { exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Zuordnung ändern' }));
}
const disabled = (button: HTMLElement) => (button as HTMLButtonElement).disabled;
const value = (input: HTMLElement) => (input as HTMLInputElement).value;

it('keeps the recorded amount and submits an exact allocation to a later outlay', async () => {
  show();
  expect(allocationReads).toBe(0);
  openAllocation();
  const dialog = within(screen.getByRole('dialog', { name: 'Rückzahlung neu zuordnen' }));
  const firstInput = await dialog.findByRole('textbox', { name: /Zuordnung Auslage 1/ });
  fireEvent.change(firstInput, { target: { value: '0' } });
  expect(disabled(dialog.getByRole('button', { name: 'Zuordnung speichern' }))).toBe(true);
  fireEvent.change(dialog.getByRole('textbox', { name: /Zuordnung Auslage 2/ }), {
    target: { value: '10,01' },
  });
  expect(sent).toHaveLength(0);
  fireEvent.click(dialog.getByRole('button', { name: 'Zuordnung speichern' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toEqual({
    url: '/api/contacts/contact-example/settlements/receipt-example/allocations',
    body: { allocations: [{ outlaySplitId: second.splitId, amountCents: 1001 }] },
  });
  expect(screen.getByRole('button', { name: /^Rückgängig$/ })).toBeTruthy();
});

it('resets to oldest-first and refuses an allocation above the outlay amount', async () => {
  show();
  openAllocation();
  const dialog = within(screen.getByRole('dialog', { name: 'Rückzahlung neu zuordnen' }));
  const input = await dialog.findByRole('textbox', { name: /Zuordnung Auslage 1/ });
  fireEvent.change(input, { target: { value: '10,02' } });
  expect(dialog.getByRole('alert').textContent).toContain('dürfen die verfügbare Auslage nicht');
  expect(disabled(dialog.getByRole('button', { name: 'Zuordnung speichern' }))).toBe(true);
  fireEvent.click(dialog.getByRole('button', { name: 'Älteste Auslagen zuerst' }));
  expect(value(input)).toBe('10,01');
  expect(disabled(dialog.getByRole('button', { name: 'Zuordnung speichern' }))).toBe(false);
  expect(sent).toHaveLength(0);
});

it('keeps a failed fresh preview read from writing and offers retry', async () => {
  rejectAllocation = true;
  show();
  openAllocation();
  const dialog = within(screen.getByRole('dialog', { name: 'Rückzahlung neu zuordnen' }));
  await dialog.findByRole('button', { name: /Erneut/ });
  expect(disabled(dialog.getByRole('button', { name: 'Zuordnung speichern' }))).toBe(true);
  expect(sent).toHaveLength(0);
});

it('offers a partial gift after all credit was automatically consumed', async () => {
  statement.creditChoices = [
    {
      receiptSplitId: paid.splitId,
      categoryId: null,
      remainingCents: 0,
      availableCents: 1001,
      automaticallyUsedCents: 1001,
    },
  ];
  show();
  const credit = screen.getByRole('region', { name: 'Kontaktguthaben' });
  expect(credit.textContent).toContain('automatisch verrechnet: 10,01');
  fireEvent.click(within(credit).getByRole('button', { name: 'Guthaben ändern' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Kontaktguthaben verwenden' }));
  expect(dialog.getByText(/können neu verwendet werden/).textContent).toContain(
    'Auslagen werden wieder offen',
  );
  expect(value(dialog.getByRole('textbox', { name: 'Guthabenbetrag' }))).toBe('10,01');
  fireEvent.change(dialog.getByRole('textbox', { name: 'Guthabenbetrag' }), {
    target: { value: '6,01' },
  });
  fireEvent.change(dialog.getByLabelText('Guthaben verwenden', { exact: true }), {
    target: { value: 'gift' },
  });
  await waitFor(() =>
    expect(disabled(dialog.getByRole('button', { name: 'Entscheidung speichern' }))).toBe(false),
  );
  fireEvent.click(dialog.getByRole('button', { name: 'Entscheidung speichern' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toEqual({
    url: '/api/contacts/contact-example/credits/receipt-example',
    body: {
      date: '2026-10-02',
      amountCents: 601,
      choice: 'gift',
      accountId: 'account-example',
    },
  });
});

it('retains selectable outlays and cents when recording a new targeted repayment', async () => {
  statement.receipts = [];
  statement.movements = [first, second];
  statement.outlays = [{ ...first, remainingCents: 1001 }, second];
  statement.balanceCents = 3003;
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung buchen' }));
  fireEvent.click(
    await screen.findByRole('checkbox', { name: /Spätere Beispielauslage.*ausgleichen/ }),
  );
  expect(value(screen.getByRole('textbox', { name: 'Rückzahlung' }))).toBe('20,02');
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung speichern' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.body).toMatchObject({
    amountCents: 2002,
    allocations: [{ outlaySplitId: second.splitId, amountCents: 2002 }],
  });
});
