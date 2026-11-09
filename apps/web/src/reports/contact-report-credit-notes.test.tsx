// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, setAmountsHidden } from '@budget/ui';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContactReportPage } from './contact-report';
import type { ContactOverview, ContactReportStatement } from './contact-api';

vi.mock('../shell/redesign-flag', () => ({ REDESIGN_ENABLED: true }));
vi.mock('./contact-chart', () => ({ ContactBalanceChart: () => null }));
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
  useParams: () => ({ reportId: 'kontakte' }),
  useLocation: () => ({ pathname: '/reports/kontakte' }),
  useLinkProps: ({ to }: { to: string }) => ({ href: to }),
}));

const contacts: ContactOverview['contacts'] = [
  {
    id: 'credit',
    name: 'Beispiel Vorauszahlung',
    note: null,
    balanceCents: -5000,
    creditCents: 5000,
    receivableCents: 0,
  },
  {
    id: 'owed',
    name: 'Beispiel Forderung',
    note: null,
    balanceCents: 5000,
    creditCents: 0,
    receivableCents: 5000,
  },
  {
    id: 'settled',
    name: 'Beispiel Ausgeglichen',
    note: null,
    balanceCents: 0,
    creditCents: 0,
    receivableCents: 0,
  },
];
const overview: ContactOverview = {
  asOf: '2026-10-02',
  currency: 'EUR',
  contacts,
  totals: { receivableCents: 5000, payableCents: 5000, balanceCents: 0 },
};
const note =
  'Gemeinsamer Beispieleinkauf mit einer langen Buchungsnotiz für die vollständige Anzeige bei Tastaturfokus.';
const movement = {
  splitId: 'receipt',
  bookingId: 'booking-receipt',
  date: '2026-10-01',
  amountCents: 5000,
  memo: 'Vorauszahlung',
  bookingMemo: note,
  payeeName: 'Beispielempfänger',
  categoryName: 'Beispielauslagen',
  categoryId: null,
  categoryKind: 'advance' as const,
  currency: 'EUR',
  status: 'confirmed' as const,
  accountId: 'example-account',
  onBudget: true,
  contactDeltaCents: -5000,
  balanceCents: -5000,
};
const statement: ContactReportStatement = {
  contact: { id: 'credit', name: contacts[0]!.name, note: null },
  asOf: overview.asOf,
  currency: 'EUR',
  balanceCents: -5000,
  creditCents: 5000,
  credits: [{ receiptSplitId: 'receipt', remainingCents: 5000, categoryId: null }],
  creditChoices: [
    {
      receiptSplitId: 'receipt',
      remainingCents: 5000,
      categoryId: null,
      availableCents: 5000,
      automaticallyUsedCents: 0,
    },
  ],
  creditUses: [],
  movements: [movement],
  outlays: [],
  receipts: [
    {
      receiptSplitId: 'receipt',
      creditCents: 5000,
      allocations: [],
      recorded: true,
      allocatable: true,
    },
  ],
  closedThroughSplitId: null,
};
function show(view = overview, person = statement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['ledger', 'contact-report'], view);
  client.setQueryData(['ledger', 'contact-report', person.contact.id, view.asOf], person);
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ContactReportPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  setAmountsHidden(false);
  vi.unstubAllGlobals();
});

it('shows both sides of a zero net header and credit in the default list and automatically selected sheet', async () => {
  show();
  const list = screen.getByRole('region', { name: 'Kontaktsalden' });
  expect(within(list).getByRole('link', { name: /Beispiel Vorauszahlung/ }).textContent).toContain(
    'Guthaben: 50,00 €',
  );
  expect(within(list).getByRole('link', { name: /Beispiel Forderung/ }).textContent).toContain(
    'Offen: 50,00 €',
  );
  expect(within(list).queryByRole('link', { name: /Beispiel Ausgeglichen/ })).toBeNull();
  expect(
    (screen.getByRole('checkbox', { name: 'Auch ausgeglichene Kontakte' }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  const chain = screen.getByRole('group', { name: 'Maßkette Kontakte' });
  expect(chain.textContent).toContain('Wir bekommen');
  expect(chain.textContent).toContain('Wir schulden');
  expect(chain.textContent?.match(/50,00/g)).toHaveLength(2);
  expect(screen.getByTestId('report-frame-result').textContent).toBe('0,00 €');
  const sheet = screen.getByRole('region', { name: 'Kontaktkontoauszug' });
  expect(sheet.textContent).toContain('Guthaben des Kontakts: 50,00 €');
  expect(sheet.textContent).toContain('Offene Forderung: 0,00 €');
  expect(sheet.textContent).not.toContain('Ausgeglichen');
  expect(within(sheet).queryByRole('button', { name: 'Schulden erlassen' })).toBeNull();
});

it('does not hide source-provided credit even when the contact net is zero', () => {
  show(
    { ...overview, contacts: [{ ...contacts[0]!, balanceCents: 0 }] },
    { ...statement, balanceCents: 0 },
  );
  expect(screen.getByRole('link', { name: /Beispiel Vorauszahlung/ }).textContent).toContain(
    'Guthaben: 50,00 €',
  );
  expect(screen.getByRole('heading', { name: 'Kontoblatt Beispiel Vorauszahlung' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Kontaktkontoauszug' }).textContent).toContain(
    'Guthaben · 50,00 €',
  );
});

it.each(['2026-10-01', '2026-09-01'])(
  'shows source context in current and history movements (%s) with full accessible notes',
  (date) => {
    const { container } = show(overview, { ...statement, movements: [{ ...movement, date }] });
    const disclosure = container.querySelector('details[data-r8-detail="contact-history"]')!;
    disclosure.setAttribute('open', '');
    const row = screen.getByRole('button', { name: /Ursprungsbuchung öffnen/ });
    expect(row.textContent).toContain('Beispielempfänger');
    expect(row.textContent).toContain('Kategorie: Beispielauslagen');
    expect(row.getAttribute('aria-label')).toContain(note);
    expect(row.getAttribute('aria-label')).toBe(
      `Ursprungsbuchung öffnen · Vorauszahlung ${date === '2026-10-01' ? '01.10.2026' : '01.09.2026'} · Rückzahlung Beispielempfänger ${note} Kategorie: Beispielauslagen · Kontaktanteil −50,00 €`,
    );
    expect(row.getAttribute('aria-label')).toContain(row.textContent?.replace(/\s+/g, ' ').trim());
    expect(within(row).getByTitle(note).textContent?.trim()).toBe(note);
    row.focus();
    expect(document.activeElement).toBe(row);
  },
);

it('includes the visible fallback and category in the source name without repeating a booking note', () => {
  show(overview, {
    ...statement,
    movements: [{ ...movement, memo: null, bookingMemo: null, payeeName: null }],
  });
  expect(
    screen.getByRole('button', {
      name: 'Ursprungsbuchung öffnen · Rückzahlung 01.10.2026 · Rückzahlung Kategorie: Beispielauslagen · Kontaktanteil −50,00 €',
    }),
  ).toBeTruthy();
});

it('does not repeat matching booking and split notes in the accessible name', () => {
  show(overview, { ...statement, movements: [{ ...movement, bookingMemo: movement.memo }] });
  expect(
    screen.getByRole('button', {
      name: 'Ursprungsbuchung öffnen · Vorauszahlung 01.10.2026 · Rückzahlung Beispielempfänger Kategorie: Beispielauslagen · Kontaktanteil −50,00 €',
    }),
  ).toBeTruthy();
});

it('masks money in added context, titles and accessible names', () => {
  const privateNote = 'Beispielkosten 50,00 €';
  const { container } = show(overview, {
    ...statement,
    movements: [
      { ...movement, bookingMemo: privateNote, payeeName: privateNote, categoryName: privateNote },
    ],
  });
  act(() => setAmountsHidden(true));
  expect(container.innerHTML).not.toContain('50,00');
});
