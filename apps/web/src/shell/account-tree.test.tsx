// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactQuery from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountTree } from './account-tree';

const accounts = [
  { id: 'card', name: 'Testkarte', type: 'credit_card', valueEurCents: -12000, onBudget: true },
  { id: 'loan', name: 'Testkredit', type: 'loan', valueEurCents: -23000, onBudget: false },
  { id: 'cash', name: 'Testgiro', type: 'checking', valueEurCents: -100, onBudget: true },
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
      id === 'cards' ? ['−120 €', '−120 €'] : ['−230 €', '−230 €'],
    );
  }
  expect(container.querySelector('#acct-tree-budget .is-neg')).not.toBeNull();
});
