// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { CategoryCombobox } from './category-picker';
import * as api from '../budget/api';
import type * as queries from './queries';

vi.mock('../pages/settings-draft-guard', () => ({ SettingsDraftGuard: () => null }));
vi.mock('../budget/api', async (original) => ({
  ...(await original<typeof api>()),
  fetchCategories: vi.fn(async () => ({
    groups: [{ id: 'group', name: 'Mustergruppe', sortOrder: 0 }],
    categories: [],
    targets: [],
  })),
  createCategory: vi.fn(),
}));
vi.mock('./queries', async (original) => ({
  ...(await original<typeof queries>()),
  accountsQuery: () => ({ queryKey: ['accounts-test'], queryFn: async () => ({ accounts: [] }) }),
}));

let client: QueryClient;
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
});

function mount(allowCreate = true, withCategory = false) {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSelect = vi.fn();
  const onParentClick = vi.fn();
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        {/* Observe bubbled events from the nested picker, as an inline register row does. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <form onSubmit={onSubmit} onClick={onParentClick}>
          <CategoryCombobox
            label="Kategorie"
            categories={
              withCategory
                ? [
                    {
                      id: 'existing',
                      name: 'Musterposten',
                      group: 'Mustergruppe',
                      kind: 'expense',
                      cls: 'need',
                      hidden: false,
                      availableCents: null,
                    },
                  ]
                : []
            }
            selectedName=""
            onSelect={onSelect}
            allowCreate={allowCreate}
            excludeIncome
          />
        </form>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSelect, onSubmit, onParentClick };
}

it.each(['{Enter}', '{ArrowDown}{Enter}', '{ArrowUp}{Enter}'])(
  'selects the sole real match with %s without opening creation',
  async (keys) => {
    const { user, onSelect } = mount(true, true);
    await user.type(screen.getByRole('combobox'), 'Musterposten');
    await user.keyboard(keys);
    expect(onSelect).toHaveBeenCalledWith('existing');
    expect(screen.queryByRole('dialog')).toBeNull();
  },
);

it('keeps creation outside category options and reachable by Tab after an unmatched search', async () => {
  const { user, onSelect } = mount(true, true);
  await user.type(screen.getByRole('combobox'), 'Unbekannt');
  expect(screen.queryAllByRole('option')).toHaveLength(0);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Neue Kategorie …' }));
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('dialog', { name: 'Kategorie anlegen' })).toBeTruthy();
  expect(onSelect).not.toHaveBeenCalled();
});

it('closes the action popup with Escape and restores the category input', async () => {
  const { user, onSubmit } = mount(true, true);
  const field = screen.getByRole('combobox');
  await user.type(field, 'Unbekannt');
  await user.tab();
  await user.keyboard('{Escape}');
  expect(document.activeElement).toBe(field);
  expect(screen.queryByRole('listbox')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onSubmit).not.toHaveBeenCalled();
});

it('creates from an unmatched search, selects the saved category and never submits the booking', async () => {
  vi.mocked(api.createCategory).mockResolvedValue({
    groupId: 'audit-category',
    category: { id: 'new-category', name: 'Musterposten', groupId: 'group' } as api.CategoryRow,
  });
  const { user, onSelect, onSubmit, onParentClick } = mount();
  await user.type(screen.getByRole('combobox'), 'Unbekannt');
  await user.click(screen.getByRole('button', { name: 'Neue Kategorie …' }));
  const dialog = await screen.findByRole('dialog', { name: 'Kategorie anlegen' });
  onParentClick.mockClear();
  await user.click(within(dialog).getByText('Name', { exact: true }));
  expect(within(dialog).queryByRole('option', { name: 'Einnahme' })).toBeNull();
  expect(within(dialog).queryByRole('option', { name: 'Auslagen' })).toBeNull();
  expect(within(dialog).queryByRole('option', { name: 'Kartenzahlung' })).toBeNull();
  expect(dialog.closest('form')).toBeNull();
  await user.type(within(dialog).getByLabelText('Name', { exact: true }), 'Musterposten');
  await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('new-category'));
  expect(api.createCategory).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Musterposten', groupId: 'group' }),
  );
  expect(onSubmit).not.toHaveBeenCalled();
  expect(onParentClick).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('does not offer creation in a read-only filter', async () => {
  const { user } = mount(false);
  await user.click(screen.getByRole('combobox'));
  expect(screen.queryByRole('button', { name: 'Neue Kategorie …' })).toBeNull();
  expect(api.fetchCategories).not.toHaveBeenCalled();
});

it('creates only once when Save is pressed twice before the response', async () => {
  let finish!: (result: Awaited<ReturnType<typeof api.createCategory>>) => void;
  vi.mocked(api.createCategory).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { user, onSelect } = mount();
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByRole('button', { name: 'Neue Kategorie …' }));
  const dialog = await screen.findByRole('dialog', { name: 'Kategorie anlegen' });
  await user.type(within(dialog).getByLabelText('Name', { exact: true }), 'Einzelner Posten');
  await user.dblClick(within(dialog).getByRole('button', { name: 'Speichern' }));
  expect(api.createCategory).toHaveBeenCalledTimes(1);
  finish({
    groupId: 'audit-single',
    category: { id: 'single', name: 'Einzelner Posten' } as api.CategoryRow,
  });
  await waitFor(() => expect(onSelect).toHaveBeenCalledWith('single'));
});

it('rejects duplicate names with the existing message and keeps the form open', async () => {
  vi.mocked(api.fetchCategories).mockResolvedValueOnce({
    groups: [{ id: 'group', name: 'Mustergruppe', sortOrder: 0 }],
    categories: [{ id: 'existing', name: 'Musterposten' } as api.CategoryRow],
    targets: [],
  });
  const { user, onSelect } = mount();
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByRole('button', { name: 'Neue Kategorie …' }));
  const dialog = await screen.findByRole('dialog', { name: 'Kategorie anlegen' });
  await user.type(within(dialog).getByLabelText('Name', { exact: true }), ' musterPOSTEN ');
  await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  expect(await within(dialog).findByRole('alert')).toHaveProperty(
    'textContent',
    'Dieser Name wird schon verwendet.',
  );
  expect(api.createCategory).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});
