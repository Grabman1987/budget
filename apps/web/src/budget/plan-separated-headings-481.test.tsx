// @vitest-environment jsdom
import { ToastProvider } from '@budget/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryRow } from './api';
import { budgetQuery, type BudgetMonthView } from './budget-api';
import { PlanMonthPage } from './plan-page';

vi.mock('../shell/app-link', () => ({
  AppLink: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('../pages/placeholder-page', () => ({
  PageFrame: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const month = '2026-10';
const groups = [
  { id: 'together', name: 'Mustergruppe', sortOrder: 0 },
  { id: 'alone', name: 'Einzelgruppe', sortOrder: 1 },
];
const categories: CategoryRow[] = ['first', 'second', 'single'].map((id, index) => ({
  id,
  name: ['Erster Posten', 'Zweiter Posten', 'Einzelposten'][index]!,
  groupId: index === 2 ? 'alone' : 'together',
  class: 'need',
  kind: 'variable',
  stage: 2,
  icon: null,
  cardAccountId: null,
  rolloverOverspending: false,
  hiddenAt: null,
  splitCount: 0,
  sortOrder: index,
}));
/** Independent literal parent 4509/-1405/3104; first child 501/-703/-202. */
function budget(singleOnly = false): BudgetMonthView {
  const shown = singleOnly ? categories.filter((category) => category.id !== 'second') : categories;
  return {
    groups,
    categories: shown,
    summary: {
      month,
      carryInCents: 0,
      incomeCents: 10000,
      uncoveredCents: 202,
      heldCents: 0,
      assignedCents: singleOnly ? 501 : 4509,
      activityCents: singleOnly ? -703 : -1405,
      availableCents: singleOnly ? -202 : 3104,
      toBeAssignedCents: singleOnly ? 9499 : 5491,
      creditOverspentCents: 0,
      cashOverspentCents: 202,
      cards: [],
      envelopes: shown.map((category) => ({
        categoryId: category.id,
        carryCents: 0,
        assignedCents: category.id === 'first' ? 501 : category.id === 'second' ? 4008 : 0,
        activityCents: category.id === 'first' ? -703 : category.id === 'second' ? -702 : 0,
        availableCents: category.id === 'first' ? -202 : category.id === 'second' ? 3306 : 0,
        overspentCents: category.id === 'first' ? 202 : 0,
        cashOverspentCents: category.id === 'first' ? 202 : 0,
        creditOverspentCents: 0,
        fundedCardCents: 0,
        goalCents: 0,
        needCents: 0,
        dueMonth: null,
        target: null,
      })),
    },
  };
}
let phone: boolean;
let data: BudgetMonthView;
let writes: Array<{ method: string; path: string; body: unknown }>;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({ component: PlanMonthPage });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [`/plan/monat?monat=${month}`] }),
  });
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...view, client };
}
const category = (id: string) =>
  document.querySelector<HTMLButtonElement>(`.pname[data-category-id="${id}"]`)!;
const parent = () => document.getElementById('grp-together')!;
const row = (id: string) => category(id).closest('tr')!;

beforeEach(() => {
  phone = false;
  data = budget();
  writes = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 767px)' && phone,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        writes.push({
          method,
          path: url.pathname,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
      const body =
        url.pathname === `/api/budget/${month}`
          ? data
          : url.pathname === '/api/categories'
            ? { groups, categories: data.categories, targets: [] }
            : url.pathname === '/api/accounts'
              ? { accounts: [] }
              : url.pathname === '/api/expected'
                ? { payments: [] }
                : {};
      return new Response(JSON.stringify(body), { status: method === 'GET' ? 200 : 422 });
    }),
  );
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('#481 separate multi-category headings preserve independent category identity', () => {
  it('puts group totals in a distinct preceding row with no first-category control', async () => {
    mount();
    await screen.findByRole('button', { name: 'Gruppe Mustergruppe' });
    expect(parent().classList.contains('prow')).toBe(false);
    expect(parent().querySelector('.pname')).toBeNull();
    expect(parent().querySelector('.assign-btn, .assign-input, .pill, .spending-bar')).toBeNull();
    expect(parent()).not.toBe(row('first'));
    expect(parent().nextElementSibling).toBe(row('first'));
    expect(row('first').nextElementSibling).toBe(row('second'));
    for (const [selector, value] of [
      ['.col-assign', '45,09 €'],
      ['.col-act', '−14,05 €'],
      ['.col-avail', '31,04 €'],
    ])
      expect(parent().querySelector(selector!)?.textContent?.trim()).toBe(value);
    expect(row('first').querySelector('.col-assign')?.textContent).toContain('5,01');
    expect(row('first').querySelector('.col-act')?.textContent).toContain('−7,03');
    expect(row('first').querySelector('.col-avail')?.textContent).toContain('−2,02');
    expect(document.querySelectorAll('.ptable tbody .prow')).toHaveLength(3);
    expect(document.querySelectorAll('.ptable tbody .psingle')).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it('does not inspect the first category through parent totals, but preserves its own inspector', async () => {
    mount();
    await screen.findByRole('button', { name: 'Gruppe Mustergruppe' });
    await userEvent.click(parent().querySelector('.col-avail')!);
    const inspector = screen.getByRole('complementary', { name: 'Plan-Inspektor' });
    expect(within(inspector).queryByRole('heading', { name: 'Erster Posten' })).toBeNull();
    await userEvent.click(category('first'));
    expect(within(inspector).getByRole('heading', { name: 'Erster Posten' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(category('first'));
    expect(writes).toEqual([]);
  });

  it('collapses only children and preserves the native parent focus and ordered expansion', async () => {
    mount();
    const toggle = await screen.findByRole('button', { name: 'Gruppe Mustergruppe' });
    const originalParent = parent();
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(parent()).toBe(originalParent);
    expect(category('first')).toBeNull();
    expect(category('second')).toBeNull();
    expect(category('single')).not.toBeNull();
    expect(document.activeElement).toBe(toggle);
    await userEvent.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(parent().nextElementSibling).toBe(row('first'));
    expect(row('first').nextElementSibling).toBe(row('second'));
    expect(document.activeElement).toBe(toggle);
    expect(writes).toEqual([]);
  });

  it('retains single-category7A then separates the same first category when a second arrives', async () => {
    data = budget(true);
    const { client } = mount();
    await screen.findByRole('button', { name: 'Mustergruppe· Erster Posten' });
    expect(parent()).toBe(row('first'));
    expect(row('first').classList.contains('psingle')).toBe(true);
    data = budget();
    act(() => client.setQueryData(budgetQuery(month).queryKey, data));
    await waitFor(() => expect(parent()).not.toBe(row('first')));
    expect(category('first').dataset['categoryId']).toBe('first');
    expect(parent().nextElementSibling).toBe(row('first'));
    expect(row('first').nextElementSibling).toBe(row('second'));
    expect(row('single').classList.contains('psingle')).toBe(true);
    expect(writes).toEqual([]);
  });

  it('keeps phone group, category and all mixed selection distinct from collapse and inline add', async () => {
    phone = true;
    mount();
    await screen.findByRole('button', { name: 'Gruppe Mustergruppe' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await userEvent.click(screen.getByText(/^Optionen/, { selector: 'summary' }));
    await userEvent.click(screen.getByRole('button', { name: 'Auswählen' }));
    const group = screen.getByRole('button', { name: 'Gruppe Mustergruppe auswählen' });
    const all = screen.getByRole('button', { name: 'Alle Kategorien auswählen' });
    await userEvent.click(group);
    expect(category('first').getAttribute('aria-pressed')).toBe('true');
    expect(category('second').getAttribute('aria-pressed')).toBe('true');
    expect(category('single').getAttribute('aria-pressed')).toBe('false');
    expect(all.getAttribute('aria-pressed')).toBe('mixed');
    await userEvent.click(category('first'));
    expect(group.getAttribute('aria-pressed')).toBe('mixed');
    expect(category('second').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(all);
    for (const id of ['first', 'second', 'single'])
      expect(category(id).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Gruppe Mustergruppe' }));
    expect(all.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Gruppe Mustergruppe' }));
    expect(category('first').getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Kategorienauswahl' })).getByRole('button', {
        name: 'Auswahl beenden',
      }),
    );
    for (const id of ['first', 'second', 'single'])
      expect(category(id).getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(
      screen.getByRole('button', { name: 'Kategorie in Mustergruppe anlegen' }),
    );
    await screen.findByRole('dialog', { name: 'Kategorie anlegen' });
    expect(writes).toEqual([]);
  });
});

describe('#481 desktop separate-heading selection domain', () => {
  it('retains desktop selection across native Space, Enter and click collapse but clears outside', async () => {
    const user = userEvent.setup();
    mount();
    const toggle = await screen.findByRole('button', { name: 'Gruppe Mustergruppe' });
    const originalParent = parent();
    expect(originalParent.classList.contains('pgroup')).toBe(true);
    expect(originalParent.classList.contains('prow')).toBe(false);
    const group = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Gruppe Mustergruppe auswählen',
    });
    const first = () =>
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Erster Posten auswählen' });
    const second = () =>
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Zweiter Posten auswählen' });
    const single = screen.getByRole<HTMLInputElement>('checkbox', {
      name: 'Einzelposten auswählen',
    });
    await user.click(group);
    expect(group.checked).toBe(true);
    expect(first().checked).toBe(true);
    expect(second().checked).toBe(true);
    expect(single.checked).toBe(false);
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    for (const key of ['[Space]', '{Enter}']) {
      await user.keyboard(key);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(parent()).toBe(originalParent);
      expect(document.activeElement).toBe(toggle);
      expect(category('first')).toBeNull();
      expect(category('second')).toBeNull();
      expect(group.checked).toBe(true);
      expect(single.checked).toBe(false);
      await user.keyboard(key);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(toggle);
      expect(group.checked).toBe(true);
      expect(first().checked).toBe(true);
      expect(second().checked).toBe(true);
      expect(single.checked).toBe(false);
    }
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
    expect(group.checked).toBe(true);
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(first().checked).toBe(true);
    expect(second().checked).toBe(true);
    expect(single.checked).toBe(false);
    await user.click(document.body);
    expect(group.checked).toBe(false);
    expect(first().checked).toBe(false);
    expect(second().checked).toBe(false);
    expect(single.checked).toBe(false);
    expect(writes).toEqual([]);
  });
});
