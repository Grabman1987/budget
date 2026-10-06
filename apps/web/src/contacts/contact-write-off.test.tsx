// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@budget/ui';
import { beforeEach, expect, it, vi } from 'vitest';
import { ContactWriteOffDialog } from './contacts-page';

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

function setup(balanceCents: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['ledger', 'accounts'], {
    accounts: [
      {
        id: 'giro',
        name: 'Giro Muster',
        type: 'checking',
        onBudget: true,
        role: 'budget',
        currency: 'EUR',
        closedAt: null,
        openingDate: '2023-10-01',
      },
    ],
  });
  client.setQueryData(['ledger-lookups'], {
    categories: [
      {
        id: 'gifts',
        name: 'Geschenke',
        groupId: 'want',
        class: 'want',
        kind: 'spending',
        sortOrder: 0,
      },
    ],
    groups: [{ id: 'want', name: 'Wunsch', sortOrder: 0 }],
    incomeTypes: [
      { id: 'income-other', name: 'Sonstiges' },
      { id: 'income-capital', name: 'Kapitalerträge' },
    ],
    contacts: [],
    projects: [],
    institutions: [],
  });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ContactWriteOffDialog
          contact={{ id: 'k1', name: 'Kontakt Muster', balanceCents }}
          onClose={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

it('explains full and partial credit adoption without money moving and excludes capital income', async () => {
  setup(-42765);
  await waitFor(() =>
    expect(screen.getByRole('dialog').textContent).toContain(
      '427,65 € werden ins Budget übernommen',
    ),
  );
  expect(screen.getByRole('dialog').textContent).toContain('0,00 €');
  expect(screen.getByRole('dialog').textContent).toContain('Kein Geld bewegt sich.');
  expect((screen.getByLabelText('Betrag', { exact: true }) as HTMLInputElement).value).toBe(
    '427,65',
  );
  expect(screen.queryByRole('option', { name: 'Kapitalerträge' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), {
    target: { value: '27,65' },
  });
  expect(screen.getByRole('dialog').textContent).toContain('27,65 € werden ins Budget übernommen');
  expect(screen.getByRole('dialog').textContent).toContain('−400,00 €');
  fireEvent.change(screen.getByLabelText('Betrag', { exact: true }), { target: { value: '500' } });
  expect(
    (screen.getByRole('button', { name: 'Ausgleich speichern' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it('explains forgiven debt and requires an expense category', () => {
  setup(8400);
  expect(screen.getByRole('dialog').textContent).toContain('84,00 € werden als Ausgabe gebucht');
  expect(
    (screen.getByRole('button', { name: 'Ausgleich speichern' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'gifts' } });
  expect(
    (screen.getByRole('button', { name: 'Ausgleich speichern' }) as HTMLButtonElement).disabled,
  ).toBe(false);
});

it('uses a German date and rejects impossible and future dates before saving', () => {
  setup(8400);
  const input = screen.getByLabelText('Datum') as HTMLInputElement;
  expect(input.value).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'gifts' } });
  for (const value of ['31.02.2026', '01.01.9999', 'kein Datum']) {
    fireEvent.change(input, { target: { value } });
    expect(
      (screen.getByRole('button', { name: 'Ausgleich speichern' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  }
});
