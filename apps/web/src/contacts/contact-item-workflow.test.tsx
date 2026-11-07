// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import type * as Domain from '@budget/domain';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactBody, type Statement } from './contacts-page';

vi.mock('@budget/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof Domain>()),
  todayInVienna: () => '2026-09-17',
}));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({}),
  useLocation: () => ({ pathname: '/konten/kontakte/k1', searchStr: '' }),
  useLinkProps: ({ to, ...props }: { to: string }) => ({ href: to, ...props }),
  useBlocker: () => undefined,
}));
const outlay = (splitId: string, amountCents: number): Statement['outlays'][number] => ({
  splitId,
  bookingId: `${splitId}-booking`,
  date: '2026-09-01',
  amountCents: -amountCents,
  memo: splitId,
  remainingCents: amountCents,
});
const first = outlay('Erste Auslage', 1000);
const second = outlay('Zweite Auslage', 2000);
const statement: Statement = {
  contact: { id: 'k1', name: 'Kontakt Beispiel' },
  asOf: '2026-09-17',
  balanceCents: 3000,
  creditCents: 0,
  outlays: [first, second],
  movements: [first, second],
  receipts: [],
  closedThroughSplitId: null,
};
let sent: Record<string, unknown>[];
beforeEach(() => {
  sent = [];
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      sent.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({ groupId: 'receipt-group' }));
    }
    if (url.includes('/accounts'))
      return new Response(
        JSON.stringify({
          accounts: [
            {
              id: 'giro',
              name: 'Giro',
              type: 'checking',
              currency: 'EUR',
              onBudget: true,
              closedAt: null,
            },
          ],
        }),
      );
    if (url.includes('/lookups'))
      return new Response(JSON.stringify({ categories: [], incomeTypes: [], payees: [] }));
    return new Response(JSON.stringify(statement));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ToastProvider>
        <ContactBody statement={statement} ready />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('selects one outlay for a real receipt while leaving the other outlay unallocated', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung buchen' }));
  const checkbox = await screen.findByRole('checkbox', { name: /Zweite Auslage.*ausgleichen/ });
  fireEvent.click(checkbox);
  expect((screen.getByRole('textbox', { name: 'Rückzahlung' }) as HTMLInputElement).value).toBe(
    '20,00',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung speichern' }));
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({
    amountCents: 2000,
    allocations: [{ outlaySplitId: 'Zweite Auslage', amountCents: 2000 }],
    creditChoice: 'free',
  });
});

it('does not book money when an outlay is merely selected and then deselected', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Rückzahlung buchen' }));
  const checkbox = await screen.findByRole('checkbox', { name: /Erste Auslage.*ausgleichen/ });
  fireEvent.click(checkbox);
  fireEvent.click(checkbox);
  expect((screen.getByRole('textbox', { name: 'Rückzahlung' }) as HTMLInputElement).value).toBe(
    '0,00',
  );
  expect(
    (screen.getByRole('button', { name: 'Rückzahlung speichern' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(sent).toHaveLength(0);
});
