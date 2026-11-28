// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { ToastProvider } from '@budget/ui';
import * as ledgerApi from './api';
import { SplitEditor } from './split-editor';
import {
  buildCreate,
  emptyDraft,
  expandBookingLines,
  newSplit,
  type BookingDraft,
} from './booking-model';

it.each([false, true])('contact shares are always euro amounts (portal: %s)', (portal) => {
  function Form() {
    const [draft, setDraft] = useState<BookingDraft>({
      ...emptyDraft('account-example', '2026-10-01'),
      amount: '100,01',
    });
    const [host, setHost] = useState<HTMLDivElement | null>(null);
    return (
      <>
        {portal && <div ref={setHost} />}
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
          contactHost={portal ? host : undefined}
        />
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
  fireEvent.click(screen.getByRole('button', { name: portal ? 'Kontakt hinzufügen' : 'Teilen' }));
  expect((screen.getByLabelText('Anteil 1.1 (€)') as HTMLInputElement).value).toBe('');
  expect(screen.queryByRole('group', { name: 'Anteilart 1.1' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '+ Weiterer Kontakt' }));
  expect((screen.getByLabelText('Anteil 1.2 (€)') as HTMLInputElement).value).toBe('');
});

it.each([false, true])('adding a line respects intervening category focus (%s)', (moveFocus) => {
  const frames: FrameRequestCallback[] = [];
  const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  function Form() {
    const [draft, setDraft] = useState(emptyDraft('account-example', '2026-10-01'));
    return (
      <SplitEditor
        draft={draft}
        setDraft={setDraft}
        categories={[]}
        accounts={[]}
        accountId="account-example"
        contacts={[{ id: 'contact-example', name: 'Kontakt Muster' }]}
        hasAdvanceCategory
        locked={false}
        error={undefined}
        compact
      />
    );
  }
  try {
    render(<Form />);
    const add = screen.getByRole('button', { name: 'Kategorie hinzufügen' });
    add.focus();
    fireEvent.click(add);
    const focusNewLine = frames.shift()!;
    const category = screen.getByLabelText('Kategorie 2') as HTMLInputElement;
    if (moveFocus) {
      act(() => category.focus());
      fireEvent.change(category, { target: { value: 'Kontakt Muster' } });
    }
    act(() => focusNewLine(0));
    expect(document.activeElement).toBe(moveFocus ? category : screen.getByLabelText('Betrag 2'));
    if (moveFocus) {
      expect(category.value).toBe('Kontakt Muster');
      expect(
        screen.getByRole('option', { name: 'Für Kontakt auslegen → Kontakt Muster' }),
      ).toBeTruthy();
    }
  } finally {
    raf.mockRestore();
  }
});

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
              availableCents: 20000,
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
  fireEvent.click(screen.getByRole('button', { name: 'Teilen' }));
  fireEvent.change(screen.getByLabelText('Kontakt 1.1'), { target: { value: 'contact-example' } });
  // owner 26.11.2026: euro only (33,33 % of 100,01 = 33,33 €).
  fireEvent.change(screen.getByLabelText('Anteil 1.1 (€)'), { target: { value: '33,33' } });
  expect(screen.getByText(/danach 99,99/)).toBeTruthy();
  expect(screen.getByText('Kategorie trägt 100,01 € bis zur Rückzahlung')).toBeTruthy();
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

it.each([
  [
    5000,
    [
      /Bereits beglichen: Guthaben 50,00 € von Kontakt Muster deckt den Anteil/,
      /Danach 16,67 € Guthaben/,
    ],
    'Kategorie trägt 66,68 €. Der Kontaktanteil ist mit Guthaben beglichen.',
  ],
  [
    2000,
    [
      /Guthaben 20,00 € von Kontakt Muster deckt 20,00 €\. 13,33 € bleiben offen/,
      /Danach 0,00 € Guthaben/,
    ],
    'Kategorie trägt 80,01 € bis zur Rückzahlung',
  ],
  [0, [], 'Kategorie trägt 100,01 € bis zur Rückzahlung'],
])(
  'shows the contact credit before and after in the share line (#1147, credit %s)',
  (credit, hints, label) => {
    function Form() {
      const [draft, setDraft] = useState<BookingDraft>({
        ...emptyDraft('account-example', '2026-10-01'),
        amount: '100,01',
        categoryId: 'food-example',
      });
      return (
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
              availableCents: 20000,
              hidden: false,
            },
          ]}
          accounts={[]}
          accountId="account-example"
          contacts={[{ id: 'contact-example', name: 'Kontakt Muster' }]}
          contactCredits={() => [{ remainingCents: credit, categoryId: null }]}
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
    fireEvent.click(screen.getByRole('button', { name: 'Teilen' }));
    fireEvent.change(screen.getByLabelText('Kontakt 1.1'), {
      target: { value: 'contact-example' },
    });
    // owner 26.11.2026: euro only (33,33 % of 100,01 = 33,33 €).
    fireEvent.change(screen.getByLabelText('Anteil 1.1 (€)'), { target: { value: '33,33' } });
    const group = screen.getByRole('group', { name: 'Kontaktanteil 1.1' });
    for (const hint of hints) expect(group.textContent).toMatch(hint);
    if (!hints.length) expect(group.querySelector('.bk-share-credit')).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    if (credit === 5000) {
      const choice = within(group).getByRole('checkbox', { name: 'Mit Guthaben verrechnen' });
      fireEvent.click(choice);
      expect(group.textContent).toContain('vorher und danach 50,00 €');
      expect(group.textContent).toContain('Der Anteil bleibt bis zur Rückzahlung offen.');
      expect(screen.getByText('Kategorie trägt 100,01 € bis zur Rückzahlung')).toBeTruthy();
      fireEvent.click(choice);
      expect(screen.getByText(label)).toBeTruthy();
    }
  },
);

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

it.each([false, true])(
  '"50/50 mit Kontakt" gives the contact the lower half and the last used contact (portal: %s)',
  (portal) => {
    localStorage.setItem('budget-last-share-contact', 'k2');
    function Form() {
      const [draft, setDraft] = useState<BookingDraft>({
        ...emptyDraft('account-example', '2026-10-01'),
        amount: '100,01',
        categoryId: 'cat-1',
      });
      const [host, setHost] = useState<HTMLDivElement | null>(null);
      return (
        <>
          {portal && <div ref={setHost} />}
          <SplitEditor
            draft={draft}
            setDraft={setDraft}
            categories={[
              { id: 'cat-1', name: 'Essen', kind: 'expense', availableCents: 0 } as never,
            ]}
            accounts={[]}
            accountId="account-example"
            contacts={[
              { id: 'k1', name: 'Kontakt Eins' },
              { id: 'k2', name: 'Kontakt Zwei' },
            ]}
            hasAdvanceCategory
            locked={false}
            error={undefined}
            contactHost={portal ? host : undefined}
          />
          <output data-testid="expanded">
            {expandBookingLines(draft)
              .splits.map((x) => x.amount)
              .join('|')}
          </output>
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
    fireEvent.click(screen.getByRole('button', { name: '50/50 mit Kontakt' }));
    expect((screen.getByLabelText('Anteil 1.1 (€)') as HTMLInputElement).value).toBe('50,00');
    expect((screen.getByLabelText('Kontakt 1.1') as HTMLSelectElement).value).toBe('k2');
    // The share is set: the shortcut is gone and the whole draft is a valid, cent-exact split.
    expect(screen.queryByRole('button', { name: '50/50 mit Kontakt' })).toBeNull();
    expect(screen.getByTestId('expanded').textContent).toBe('50,01|50,00');
    localStorage.removeItem('budget-last-share-contact');
  },
);
