// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactQuery from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountTree } from './account-tree';

const accounts = [
  { id: 'card', name: 'Testkarte', type: 'credit_card', valueEurCents: -20000, onBudget: true },
  { id: 'loan', name: 'Testkredit', type: 'loan', valueEurCents: -23000, onBudget: false },
  { id: 'cash', name: 'Testgiro', type: 'checking', valueEurCents: -100, onBudget: true },
  { id: 'giro', name: 'Girokonto', type: 'checking', valueEurCents: 100100, onBudget: true },
  { id: 'reserve', name: 'Reserve', type: 'savings', valueEurCents: 50000, onBudget: true },
  { id: 'depot', name: 'Depot', type: 'brokerage', valueEurCents: 40000, onBudget: false },
].map((a, sortOrder) => ({
  ...a,
  sortOrder,
  closedAt: null as string | null,
  missingFxCurrencies: [],
}));
let shownAccounts = accounts;
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: () => ({ data: { accounts: shownAccounts } }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ id: 'giro' }),
  Link: ({
    children,
    to,
    params,
    ...props
  }: {
    children: ReactNode;
    to: string;
    params?: { id: string };
  }) => (
    <a href={params ? `/konten/${params.id}` : to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('./app-link', () => ({
  AppLink: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../ledger/account-form', () => ({
  AccountFormPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="Konto anlegen">
        <button onClick={onClose}>Schließen</button>
      </div>
    ) : null,
}));
vi.mock('../ledger/account-order', () => ({
  useOrderedAccounts: () => ({ accounts: shownAccounts }),
  useReorder: () => ({ rowProps: () => ({}), controls: () => null }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  shownAccounts = accounts;
});
it('marks every negative balance, including cards and loans, with red and a minus', () => {
  const { container } = render(<AccountTree />);
  for (const id of ['cards', 'loans']) {
    const group = container.querySelector(`#acct-tree-${id}`)!.closest('section')!;
    expect(group.querySelectorAll('.is-neg')).toHaveLength(2);
    expect([...group.querySelectorAll('.acct-amount')].map((el) => el.textContent)).toEqual(
      id === 'cards' ? ['−200 €', '−200 €'] : ['−230 €', '−230 €'],
    );
  }
  expect(container.querySelector('#acct-tree-budget .is-neg')).not.toBeNull();
});

it('shows group icons and totals without subtitle lines, and typed account icons', () => {
  const { container } = render(<AccountTree />);
  const scopes = [
    ['budget', 'Budget-Konten', 'Giro, Bargeld, Tagesgeld', '1.500 €'],
    ['cards', 'Kreditkarten', 'Kartensalden', '−200 €'],
    ['loans', 'Kredite', 'Darlehen', '−230 €'],
    ['investments', 'Investments', 'Depot, Krypto, P2P, Sonstiges', '400 €'],
  ];

  for (const [id, title, description, total] of scopes) {
    const list = container.querySelector(`#acct-tree-${id}`)!;
    const group = list.closest('section')!;
    expect(group.textContent).toContain(title);
    expect(group.textContent).not.toContain(description);
    expect(group.querySelector('.acct-group-icon')).not.toBeNull();
    expect(group.querySelector('.acct-group-bar')?.textContent).toContain(total);
  }
  expect(container.querySelectorAll('.acct-type-icon')).toHaveLength(accounts.length);
  expect(screen.getByRole('link', { name: /Girokonto/ }).getAttribute('aria-current')).toBe('page');
});

it('offers account creation and account settings even for an empty ledger', () => {
  shownAccounts = [];
  render(<AccountTree />);
  expect(screen.getByText('Konten')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Konten verwalten' }).getAttribute('href')).toBe(
    '/einstellungen/konten',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Neues Konto anlegen' }));
  expect(screen.getByRole('dialog', { name: 'Konto anlegen' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Schließen' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('hides closed accounts and retains collapse memory through editing and remount', () => {
  shownAccounts = [
    ...accounts,
    { ...accounts[0]!, id: 'closed', name: 'Geschlossene Testkarte', closedAt: '2026-09-01' },
  ];
  localStorage.setItem('budget-acct-tree-budget', '1');
  const { container, unmount } = render(<AccountTree />);
  expect(screen.queryByText('Geschlossene Testkarte')).toBeNull();
  const list = container.querySelector('#acct-tree-budget')!;
  expect(list.hasAttribute('hidden')).toBe(true);
  fireEvent.click(
    screen.getByRole('button', { name: 'Reihenfolge der Konten in Budget-Konten ändern' }),
  );
  expect(list.hasAttribute('hidden')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
  expect(list.hasAttribute('hidden')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Budget-Konten' }));
  expect(localStorage.getItem('budget-acct-tree-budget')).toBeNull();
  unmount();
  render(<AccountTree />);
  expect(screen.getByRole('button', { name: 'Budget-Konten' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
});
