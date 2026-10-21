// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@budget/ui';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { SplitEditor, captureLines } from './split-editor';
import { buildCreate, emptyDraft, type BookingDraft } from './booking-model';
import { Combobox } from './combobox';
import type { PickCategory } from './capture-model';

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
const category = (id: string, name: string, group: string): PickCategory => ({
  id,
  name,
  group,
  kind: 'expense',
  cls: 'need',
  availableCents: null,
  hidden: false,
});
function mount(categories: PickCategory[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  function Form() {
    const [draft, setDraft] = useState<BookingDraft>({
      ...emptyDraft('account-734', '2026-10-21'),
      amount: '10,00',
    });
    return (
      <>
        <SplitEditor
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          accounts={[]}
          accountId="account-734"
          contacts={[{ id: 'contact-734', name: 'Kontakt Alpha' }]}
          hasAdvanceCategory
          locked={false}
          error={undefined}
        />
        <output data-testid="payload">
          {JSON.stringify(
            buildCreate({ ...draft, lines: captureLines(draft) }, null, {
              requireCategory: true,
              advanceCategoryId: 'advance-734',
            }),
          )}
        </output>
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <Form />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

it('keeps category groups before contacts even for a category-substring/contact-prefix search', async () => {
  const user = mount([
    category('cat-a', 'Kategorie A', 'Gruppe A'),
    category('cat-b', 'Muster für Wege', 'Gruppe B'),
  ]);
  const field = screen.getByRole('combobox', { name: 'Kategorie' });
  await user.click(field);
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Kategorie A',
    'Muster für Wege',
    'Für Kontakt auslegen → Kontakt Alpha',
    'Kontakt neu anlegen',
  ]);
  expect(screen.getByText('Gruppe A')).toBeTruthy();
  expect(screen.getByText('Gruppe B')).toBeTruthy();
  await user.paste('für');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Muster für Wege',
    'Für Kontakt auslegen → Kontakt Alpha',
  ]);
  expect(field.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]?.id);
  await user.keyboard('{Enter}');
  expect(JSON.parse(screen.getByTestId('payload').textContent ?? '')).toMatchObject({
    ok: true,
    value: { amountCents: -1000, splits: [{ categoryId: 'cat-b', amountCents: -1000 }] },
  });
});

it('keeps the contact and contact creation reachable after sixty-one categories', async () => {
  const user = mount(
    Array.from({ length: 61 }, (_, i) => category(`cat-${i}`, `Kategorie ${i}`, 'Gruppe A')),
  );
  await user.click(screen.getByRole('combobox', { name: 'Kategorie' }));
  expect(screen.getAllByRole('option')).toHaveLength(63);
  expect(screen.getAllByRole('option').at(-2)?.textContent).toBe(
    'Für Kontakt auslegen → Kontakt Alpha',
  );
  expect(screen.getAllByRole('option').at(-1)?.textContent).toBe('Kontakt neu anlegen');
  await user.keyboard('{ArrowDown>62/}{Enter}');
  expect(JSON.parse(screen.getByTestId('payload').textContent ?? '')).toMatchObject({
    ok: true,
    value: {
      amountCents: -1000,
      splits: [
        {
          categoryId: 'advance-734',
          contactId: 'contact-734',
          amountCents: -1000,
        },
      ],
    },
  });
  const field = screen.getByRole('combobox', { name: 'Kategorie' });
  await user.click(field);
  await user.clear(field);
  await user.keyboard('{ArrowDown>63/}{Enter}');
  expect(screen.getByLabelText('Name des neuen Kontakts')).toBeTruthy();
});

it('preserves the default payee combobox cap and prefix matching', async () => {
  function Payee() {
    const [text, setText] = useState('');
    const options = Array.from({ length: 61 }, (_, i) => ({ id: `${i}`, label: `Weitere ${i}` }));
    options[0] = { id: 'contains', label: 'Vorher Muster' };
    options[1] = { id: 'prefix', label: 'Muster Anfang' };
    return (
      <Combobox
        label="Empfänger"
        value={text}
        onChange={setText}
        options={options}
        onSelect={() => undefined}
        listWhenEmpty
      />
    );
  }
  render(<Payee />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: 'Empfänger' }));
  expect(screen.getAllByRole('option')).toHaveLength(60);
  await user.paste('Muster');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'Muster Anfang',
    'Vorher Muster',
  ]);
});
