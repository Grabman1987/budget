// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
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
].map((a, sortOrder) => ({ ...a, sortOrder, missingFxCurrencies: [] }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: () => ({ data: { accounts } }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a href="#account">{children}</a>,
}));
vi.mock('../ledger/account-order', () => ({
  useOrderedAccounts: () => ({ accounts }),
  useReorder: () => ({ rowProps: () => ({}), controls: () => null }),
}));
afterEach(cleanup);
it('card/loan balances and group totals stay ink with a minus; budget overdraft remains an alarm', () => {
  const { container } = render(<AccountTree />);
  for (const id of ['cards', 'loans']) {
    const group = container.querySelector(`#acct-tree-${id}`)!.closest('section')!;
    expect(group.querySelector('.is-neg')).toBeNull();
    expect([...group.querySelectorAll('.acct-amount')].map((el) => el.textContent)).toEqual(
      id === 'cards' ? ['−200 €', '−200 €'] : ['−230 €', '−230 €'],
    );
  }
  expect(container.querySelector('#acct-tree-budget .is-neg')).not.toBeNull();
});

it('explains each sidebar total with its existing account-group scope', () => {
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
    expect(group.textContent).toContain(description);
    expect(group.querySelector('.acct-group-bar')?.textContent).toContain(total);
  }
});
