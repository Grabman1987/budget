// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import * as ledgerApi from './api';
import { SplitEditor } from './split-editor';
import { buildCreate, emptyDraft, newSplit, type BookingDraft } from './booking-model';

it('shares a category by percent, keeps cents exact, and guards an unfinished second line', () => {
  function Form() {
    const [draft, setDraft] = useState<BookingDraft>({
      ...emptyDraft('account-example', '2026-10-01'),
      amount: '100,01',
      categoryId: 'food-example',
    });
    const result = buildCreate(draft, null, {
      requireCategory: true,
      advanceCategoryId: 'advance-example',
    });
    return (
      <>
        <SplitEditor
          draft={draft}
          setDraft={setDraft}
          categories={[
            {
              id: 'food-example',
              name: 'Essen Muster',
              group: 'Bedarf',
              kind: 'expense',
              cls: 'need',
              availableCents: null,
              hidden: false,
            },
          ]}
          accounts={[]}
          accountId="account-example"
          contacts={[{ id: 'contact-example', name: 'Kontakt Muster' }]}
          hasAdvanceCategory
          locked={false}
          error={undefined}
        />
        <output data-testid="payload">{JSON.stringify(result)}</output>
      </>
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <Form />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Teilen ▾' }));
  fireEvent.change(screen.getByLabelText('Kontakt 1.1'), { target: { value: 'contact-example' } });
  fireEvent.change(screen.getByLabelText('Anteil 1.1 (%)'), { target: { value: '33,33' } });
  expect(JSON.parse(screen.getByTestId('payload').textContent!)).toMatchObject({
    ok: true,
    value: {
      splits: [
        { categoryId: 'food-example', amountCents: -6668 },
        { contactId: 'contact-example', amountCents: -3333 },
      ],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: '+ Weitere Kategorie' }));
  expect(JSON.parse(screen.getByTestId('payload').textContent!)).toMatchObject({ ok: false });
  expect(screen.getByText(/Speichern geht erst/)).toBeTruthy();
});

it('undoing an inline contact creation clears that contact from the unsaved line', async () => {
  const created = vi.spyOn(ledgerApi, 'createContact').mockResolvedValue({
    contact: { id: 'new-contact-example', name: 'Neuer Kontakt Muster' },
    groupId: 'contact-group-example',
  });
  const undone = vi
    .spyOn(ledgerApi, 'undoGroup')
    .mockResolvedValue({ groupId: 'undo-group-example' });
  function Form() {
    const [draft, setDraft] = useState<BookingDraft>({
      ...emptyDraft('account-example', '2026-10-01'),
      amount: '120',
    });
    return (
      <>
        <SplitEditor
          draft={draft}
          setDraft={setDraft}
          categories={[]}
          accounts={[]}
          accountId="account-example"
          contacts={[]}
          hasAdvanceCategory
          locked={false}
          error={undefined}
        />
        <output data-testid="payload">
          {JSON.stringify(buildCreate(draft, null, { requireCategory: true }))}
        </output>
      </>
    );
  }
  try {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <Form />
        </ToastProvider>
      </QueryClientProvider>,
    );
    fireEvent.focus(screen.getByLabelText('Kategorie'));
    fireEvent.change(screen.getByLabelText('Kategorie'), { target: { value: 'Kontakt neu' } });
    fireEvent.click(screen.getByRole('option', { name: 'Kontakt neu anlegen' }));
    fireEvent.change(screen.getByLabelText('Name des neuen Kontakts'), {
      target: { value: 'Neuer Kontakt Muster' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Kontakt anlegen' }));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('payload').textContent!)).toMatchObject({
        ok: true,
        value: { splits: [{ contactId: 'new-contact-example', amountCents: -12000 }] },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('payload').textContent!)).toMatchObject({ ok: false }),
    );
  } finally {
    created.mockRestore();
    undone.mockRestore();
  }
});

it('does not replace a line amount while the total is invalid', () => {
  function Form() {
    const [draft, setDraft] = useState<BookingDraft>({
      ...emptyDraft('account-example', '2026-10-01'),
      amount: 'invalid',
      splitOn: true,
      splits: [newSplit({ amount: '20' }), newSplit({ amount: '30' })],
    });
    return (
      <SplitEditor
        draft={draft}
        setDraft={setDraft}
        categories={[]}
        accounts={[]}
        accountId="account-example"
        contacts={[]}
        hasAdvanceCategory
        locked={false}
        error={undefined}
      />
    );
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <Form />
      </ToastProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rest verteilen in Zeile 1' }));
  expect((screen.getByLabelText('Betrag 1') as HTMLInputElement).value).toBe('20');
});
