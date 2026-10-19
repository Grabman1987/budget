// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactQuery from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountTree } from './account-tree';

// Own cash -26,90 plus positions 24,68 is -2,22: the depot page shows 24,68, the tree must too.
const base = { closedAt: null as string | null, missingFxCurrencies: [], onBudget: false };
const accounts = [
  { ...base, id: 'depot', name: 'Testdepot', type: 'brokerage', valueEurCents: -222, sortOrder: 0 },
  { ...base, id: 'coin', name: 'Testkrypto', type: 'crypto', valueEurCents: 0, sortOrder: 1 },
  {
    ...base,
    id: 'cash',
    name: 'Testverrechnung',
    type: 'checking',
    valueEurCents: 11845,
    onBudget: true,
    sortOrder: 2,
  },
];
const position = (accountId: string, valueCents: number | null, valueStatus: string) => ({
  securityId: `s-${accountId}-${valueStatus}`,
  name: 'Testwert',
  quote: null,
  accounts: [{ accountId, valueCents, valueStatus }],
});
let positions: unknown = undefined;
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof ReactQuery>()),
  useQuery: (options: { queryKey: readonly unknown[] }) => ({
    data: options.queryKey.includes('portfolio-positions') ? positions : { accounts },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({}),
  Link: ({ children, params, ...props }: { children: ReactNode; params?: { id: string } }) => (
    <a href={params ? `/konten/${params.id}` : '/'} {...props}>
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
vi.mock('../ledger/account-form', () => ({ AccountFormPanel: () => null }));
vi.mock('../ledger/account-order', () => ({
  useOrderedAccounts: () => ({ accounts }),
  useReorder: () => ({ rowProps: () => ({}), controls: () => null }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  positions = undefined;
});

const amounts = (container: HTMLElement, group: string) => {
  const section = container.querySelector(`#acct-tree-${group}`)!.closest('section')!;
  return {
    sum: section.querySelector('.acct-group-bar .acct-amount')?.textContent,
    rows: [...section.querySelectorAll('li .acct-amount')].map((el) => el.textContent),
  };
};

it('shows the Depotwert of depots and crypto, the cash of the settlement account', () => {
  positions = {
    asOf: '2026-10-18',
    positions: [position('depot', 2468, 'known'), position('coin', 150_000, 'known')],
  };
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({ sum: '1.525 €', rows: ['25 €', '1.500 €'] });
  expect(amounts(container, 'budget')).toEqual({ sum: '118 €', rows: ['118 €'] });
  expect(container.querySelectorAll('#acct-tree-investments .is-neg')).toHaveLength(0);
});

it('marks a partly priced depot and its group sum with ≈', () => {
  positions = {
    asOf: '2026-10-18',
    positions: [
      position('depot', 2468, 'known'),
      position('depot', null, 'missing_price'),
      position('coin', 150_000, 'known'),
    ],
  };
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({
    sum: '≈ 1.525 €',
    rows: ['≈ 25 €', '1.500 €'],
  });
});

it('shows a dash instead of cash plus positions while the positions are not loaded', () => {
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({ sum: '–', rows: ['–', '–'] });
  expect(amounts(container, 'budget').rows).toEqual(['118 €']);
});
