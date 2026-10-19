// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type * as ReactQuery from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { AccountTree } from './account-tree';

// Seed example: depot cash -26,90 plus positions 24,68 is -2,22 (the depot page shows 24,68);
// the Verrechnungskonto holds 118,45, so the platform is worth 116,23 together.
const base = { closedAt: null as string | null, missingFxCurrencies: [], onBudget: false };
let linked = true;
const accountList = () => [
  {
    ...base,
    id: 'depot',
    name: 'Testdepot',
    type: 'brokerage',
    valueEurCents: -222,
    referenceAccountId: linked ? 'cash' : null,
    sortOrder: 0,
  },
  { ...base, id: 'coin', name: 'Testkrypto', type: 'crypto', valueEurCents: 150000, sortOrder: 1 },
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
    data: options.queryKey.includes('portfolio-positions')
      ? positions
      : { accounts: accountList() },
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
  useOrderedAccounts: () => ({ accounts: accountList() }),
  useReorder: () => ({ rowProps: () => ({}), controls: () => null }),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  positions = undefined;
  linked = true;
});

const amounts = (container: HTMLElement, group: string) => {
  const section = container.querySelector(`#acct-tree-${group}`)!.closest('section')!;
  return {
    sum: section.querySelector('.acct-group-bar .acct-amount')?.textContent,
    rows: [...section.querySelectorAll('li .acct-amount')].map((el) => el.textContent),
  };
};
const loaded = (...extra: ReturnType<typeof position>[]) => ({
  asOf: '2026-10-18',
  positions: [position('depot', 2468, 'known'), position('coin', 150_000, 'known'), ...extra],
});

it('shows the Depotwert on depots and the depot cash on the linked Verrechnungskonto', () => {
  positions = loaded();
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({ sum: '1.525 €', rows: ['25 €', '1.500 €'] });
  // 118,45 - 26,90 = 91,55, shown rounded as 92 €.
  expect(amounts(container, 'budget')).toEqual({ sum: '92 €', rows: ['92 €'] });
  expect(container.querySelectorAll('#acct-tree-investments .is-neg')).toHaveLength(0);
  expect(container.querySelector('[data-testid="acct-cash"]')).toBeNull();
});

it('without a Verrechnungskonto the depot cash stays under the depot row and in the sums', () => {
  linked = false;
  positions = loaded();
  const { container } = render(<AccountTree />);
  // 24,68 + 1.500 - 26,90 = 1.497,78.
  expect(amounts(container, 'investments')).toEqual({ sum: '1.498 €', rows: ['25 €', '1.500 €'] });
  expect(container.querySelector('[data-testid="acct-cash"]')?.textContent).toBe('Cash −27 €');
  expect(amounts(container, 'budget')).toEqual({ sum: '118 €', rows: ['118 €'] });
});

it('marks a partly priced depot and its group sum with ≈', () => {
  positions = loaded(position('depot', null, 'missing_price'));
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({
    sum: '≈ 1.525 €',
    rows: ['≈ 25 €', '1.500 €'],
  });
});

it('shows a dash instead of cash plus positions while the positions are not loaded', () => {
  const { container } = render(<AccountTree />);
  expect(amounts(container, 'investments')).toEqual({ sum: '–', rows: ['–', '–'] });
  expect(amounts(container, 'budget')).toEqual({ sum: '–', rows: ['–'] });
});
